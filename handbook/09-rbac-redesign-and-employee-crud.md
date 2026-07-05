# Chapter 9: RBAC Redesign + Employee CRUD

## 1. Introduction

This feature does two things, in two checkpointed stages on one branch:

- **Stage A** replaces Chapter 8's coarse-grained `User.role` enum +
  `requireRole` middleware with a full relational RBAC model — `Role`,
  `Permission`, `UserRole`, `RolePermission` — and a `requirePermission`
  middleware.
- **Stage B** builds `Employee` — this project's first entity that isn't
  `User`/`RefreshToken` — as a full Clean Architecture slice on top of
  Stage A's permission model.

Chapter 8 explicitly deferred a permissions table "until Employee CRUD's
real needs demand it." This is that moment: Employee CRUD needs
`:own`-scoped, resource-based access (an `EMPLOYEE` reading only their own
record) that a single `role` string genuinely cannot express — you can't
encode "read your own record" as one flat role name.

## 2. Theory

**Why a role string can't express `:own`-scoped access**: `requireRole`
answers one question — "is this role allowed here at all." It has no
concept of _which_ record a request is about, because the middleware runs
before any record is ever fetched. `GET /employees/:id` needs a second
question answered — "is this specific record theirs" — which can only be
answered after the record is loaded. This is why Stage B's authorization
is deliberately two layers: `requirePermission` (coarse, middleware) and
an ownership comparison (fine, service layer, once the record exists).

**Permission naming (`resource:action:scope`)**: `employee:read:any` vs.
`employee:read:own` are two different grantable capabilities, not one
permission with a parameter. This keeps the seed data (`RolePermission`
grants) declarative — changing what `MANAGER` can do is a data change, not
a code change.

**Soft delete's real cost, not just its benefit**: soft delete (a
`deletedAt` timestamp instead of a real `DELETE`) preserves history, the
same principle as `RefreshToken.revoked` from Chapter 7. Its cost, found
concretely while building this feature: a foreign key's `ON DELETE SET
NULL` only fires on an actual `DELETE` statement — a soft delete is just
an `UPDATE`, so `Employee.managerId` references to a soft-deleted manager
are **not** automatically cleaned up. A real, working system doesn't get
referential-integrity cleanup "for free" from soft delete the way it does
from a hard delete.

**Why the `User`↔`Employee` relation is one-to-many, not one-to-one**:
the business rule is "at most one **active** Employee per user," which is
a different, narrower rule than "at most one Employee ever." A `userId`
genuinely can have more than one `Employee` row across time (soft-deleted
history plus one live record) — that makes it a real one-to-many
relationship at the table level, even though at any single point in time
it behaves like one-to-one. Modeling it as `Employee?` (true 1:1) would
have been the intuitive first guess, and was in fact this feature's first
attempt — see Section 9 for exactly how that surfaced as a bug.

## 3. Architecture

### Two-Layer Authorization — `GET /employees/:id`

```
GET /api/v1/employees/:id
Authorization: Bearer <accessToken>
    ↓
authMiddleware → req.user = { id, roles }
    ↓
requirePermission('employee:read:any', 'employee:read:own')
    ├─ resolves roles → permission set (via permissionCache)
    ├─ neither key granted → 403 (coarse gate)
    └─ granted → req.grantedPermissions = [...], next()
    ↓
employee.service.getEmployeeById(id, { id: req.user.id, grantedPermissions })
    ├─ employeeRepository.findById(id) → not found → 404
    ├─ grantedPermissions includes 'employee:read:any'? → skip ownership check
    └─ else: employee.userId !== requester.id → 403 (fine gate)
    ↓
200 { employee }
```

### Layer Responsibilities

| Layer      | File                       | Responsibility                                                    | Must NOT do                                                                   |
| ---------- | -------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Middleware | `permission.middleware.js` | Coarse gate — does any role grant the required permission         | Compare against a specific record                                             |
| Service    | `employee.service.js`      | Fine gate — is _this_ record the caller's own; all business rules | Touch `req`/`res`, run raw Prisma queries                                     |
| Repository | `employee.repository.js`   | Prisma queries only, always `deletedAt: null`-scoped for reads    | Decide who's allowed to call it                                               |
| Cache      | `permissionCache.js`       | Role-name → permission-key resolution, few-minutes TTL            | Cache anything user-specific (roles are looked up per-request from the token) |

### Full Pipeline

```
HTTP Request
    ↓
Route            ← employee.routes.js (NEW)
    ↓
authMiddleware    ← reads { sub, roles } from JWT (roles now an array)
    ↓
requirePermission ← permission.middleware.js (NEW, replaces rbac.middleware.js)
    ↓
validateMiddleware ← employee.validation.js (NEW, Zod)
    ↓
Controller        ← employee.controller.js (NEW, thin)
    ↓
Service           ← employee.service.js (NEW — ownership checks, business rules)
    ↓
Repository        ← employee.repository.js (NEW — Prisma only)
    ↓
PostgreSQL        ← Employee table (NEW), Role/Permission/UserRole/RolePermission (NEW)
```

## 4. Folder Structure

```
src/
├── middlewares/
│   ├── auth.middleware.js          (MODIFIED) — req.user.roles, not .role
│   └── permission.middleware.js    (NEW) — replaces rbac.middleware.js (deleted)
├── modules/
│   ├── rbac/
│   │   └── rbac.repository.js      (NEW) — Role/Permission/UserRole queries
│   ├── auth/
│   │   └── auth.service.js         (MODIFIED) — transactional register(), roles in JWT payload
│   ├── users/
│   │   ├── user.service.js         (MODIFIED) — sanitizeUser(user, roles)
│   │   └── user.routes.js          (MODIFIED) — requirePermission('user:list')
│   └── employees/                  (NEW — full slice)
│       ├── employee.validation.js
│       ├── employee.repository.js
│       ├── employee.service.js
│       ├── employee.controller.js
│       └── employee.routes.js
└── utils/
    └── permissionCache.js          (NEW)

prisma/
├── schema.prisma                   (MODIFIED) — Role, Permission, UserRole,
│                                      RolePermission, Employee added; User.role removed
├── seed.js                         (NEW) — idempotent role/permission seeding
└── migrations/
    ├── ..._add_rbac_tables_remove_role_enum/
    ├── ..._add_employee_table/
    └── ..._fix_employee_userid_partial_unique/   (bugfix mid-feature, see Section 9)
```

## 5. File-by-File Explanation

### `src/middlewares/permission.middleware.js`

```js
const requirePermission =
  (...requiredKeys) =>
  async (req, res, next) => {
    if (!req.user || !Array.isArray(req.user.roles)) {
      return next(new ForbiddenError(...));
    }

    const grantedKeys = await permissionCache.getPermissionKeysForRoles(req.user.roles);
    const hasPermission = requiredKeys.some((key) => grantedKeys.includes(key));

    if (!hasPermission) {
      return next(new ForbiddenError(...));
    }

    req.grantedPermissions = grantedKeys;
    next();
  };
```

- **A factory accepting multiple keys**, not just one — `GET
/employees/:id` needs to accept _either_ `:any` or `:own`, so the
  middleware's job is "does the caller have at least one of these," not
  "does the caller have exactly this one."
- **`req.grantedPermissions` is exposed to the service layer** — this is
  the mechanism that lets `employee.service.js` distinguish "has `:any`,
  skip the ownership check" from "only has `:own`, must check ownership,"
  without re-querying the permission set a second time.

### `src/utils/permissionCache.js`

- A plain `Map`, keyed by role name, 5-minute TTL. Role→permission
  mappings change rarely (an admin editing what `MANAGER` can do), so this
  avoids a join on every authenticated request.
- **Interview question**: _"What's cached here, and what isn't?"_ — Only
  the role-name → permission-keys mapping. A user's _role assignment_
  (which roles they hold) is never cached — that's read fresh from the
  JWT on every request, which is itself only as fresh as the last
  login/refresh. Two different staleness windows, deliberately: role
  _definitions_ change take effect on the very next request; role
  _assignments_ to a user are bounded by the access token's lifetime,
  same as Chapter 8.

### `src/modules/auth/auth.service.js` — `register()` (modified)

```js
const user = await prisma.$transaction(async (tx) => {
  const createdUser = await userRepository.create({ email, password: hashedPassword, name }, tx);
  const defaultRole = await rbacRepository.findRoleByName(DEFAULT_ROLE_NAME, tx);
  await rbacRepository.assignRoleToUser(createdUser.id, defaultRole.id, tx);
  return createdUser;
});

const { roles, ...tokens } = await issueTokenPair(user);
```

- **A narrow fix, not a full rewrite**, of Chapter 7's documented
  non-transactional gap. User creation and default-role assignment are
  now atomic — a user can never exist with zero roles, which used to be a
  real broken state (an account that could pass no permission check,
  ever). Token issuance (the `RefreshToken` write) stays _outside_ the
  transaction, deliberately: a failure there just means "the account
  exists correctly, log in again" — a UX inconvenience, not a data
  integrity problem. Widening the transaction to cover token issuance too
  was considered and rejected as unnecessary scope for what this fix
  actually needed to guarantee.

### `src/modules/employees/employee.service.js`

```js
const rethrowForeignKeyViolationAsBadRequest = (error) => {
  if (error.code !== 'P2003') throw error;
  const constraintName = error.meta?.driverAdapterError?.cause?.constraint?.index ?? '';
  const field = constraintName.includes('managerId') ? 'managerId' : 'userId';
  throw new BadRequestError(`${field}: references a record that does not exist`);
};
```

- **Translates a raw Prisma driver error into a typed, client-safe
  error** — the same principle as `app.js`'s JSON-syntax-error translator
  from the `API_ENDPOINTS.md` feature: never let a database driver's
  internal error text reach an API response as a generic `500`.
- **The field name comes from the constraint name Postgres reports**
  (`Employee_userId_fkey` / `Employee_managerId_fkey`), not from a
  dedicated field on the Prisma error — worth knowing the shape of
  `error.meta` before assuming a friendlier field exists.

## 6. Request Lifecycle

Traced live during implementation (abbreviated — full curl-level detail
lives in `handbook/API_ENDPOINTS.md`):

1. Fresh `register()` → user + `UserRole(EMPLOYEE)` created atomically;
   JWT payload `{ sub, roles: ['EMPLOYEE'] }`.
2. `GET /api/v1/users` as that user → `403` (no `user:list` permission).
3. Promoted to `ADMIN` via a direct-database script (same pattern as
   Chapter 8 — no self-service escalation endpoint, by design) — the
   **old** access token still shows `403` (stale role claim, same
   propagation-delay behavior as Chapter 8, now mediated through
   permission resolution instead of a raw role check). A fresh login →
   `200`, full user list.
4. `POST /employees` (with a `userId`) → `201`. Same `userId` again →
   `409`.
5. `GET /employees/:id` as the record's own `EMPLOYEE` → `200`. As a
   _different_ `EMPLOYEE` → `403` (the ownership-check message, distinct
   from the middleware's generic one).
6. `PATCH /employees/:id` with `managerId` set to its own `id` → `400`.
7. `DELETE /employees/:id` → `200`; `GET`/`DELETE` again on the same `id`
   → `404`, not `409` — a soft-deleted record is simply gone from every
   read path.

## 7. Best Practices

- **Two authorization layers for resource-scoped access**: a coarse
  permission gate in middleware, a fine ownership check in the service —
  never try to make the middleware alone answer "is this specific record
  yours," since it has no record loaded yet.
- **Translate driver-level errors at the boundary that first sees them**
  (the service layer, right where the Prisma call happens) rather than
  letting them reach the generic error handler as an unstyled `500`.
- **Narrow a fix to what it actually needs to guarantee.** The `register()`
  transaction fix is deliberately scoped to "never a roleless user," not
  "never any post-registration failure at all" — a wider transaction would
  have been solving a problem this feature didn't actually have.
- **A soft-delete decision is not "delete, but reversible" for free** —
  every FK-driven cleanup a real `DELETE` would trigger has to be
  considered explicitly; soft delete doesn't inherit them automatically.

### Security implications, consolidated

- Permission resolution happens fresh (through the cache) on every
  request — a role's _permissions_ can change and take effect
  immediately; a user's _role assignment_ is still bounded by their
  token's lifetime, unchanged from Chapter 8's finding.
- `EMPLOYEE` never gets `employee:update:own` — HR-field edits (salary,
  department) stay an `ADMIN`/`MANAGER` action, by explicit design, not
  an oversight.
- BOLA (Broken Object Level Authorization) is this feature's most
  concrete example so far: `GET /employees/:id`'s ownership check is the
  entire defense against an `EMPLOYEE` reading someone else's record — get
  that comparison wrong, and it's a real BOLA vulnerability, not just a
  test failure.

## 8. Performance Considerations

- Permission resolution is cached (5-minute TTL) — most permission checks
  never touch the database.
- `listUsers()`'s role lookup is batched into one query for all users
  (`getRoleNamesForUsers`), not one query per user — an intentional
  N+1-avoidance, not an accident.
- `GET /employees` is an unfiltered scan, same scalability profile as
  `GET /users` — pagination is explicitly Chapter 10's job, not this
  one's.

## 9. Common Mistakes

| Mistake                                                             | Why it happens                                                                     | How senior engineers avoid it                                                                                                                                                  |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Modeling `User`↔`Employee` as a true one-to-one relation            | The business intent ("one active record per user") sounds like 1:1 at first glance | Ask whether the _table_, not just the current moment in time, can ever hold more than one row per key — soft-deleted history means it genuinely can                            |
| Using a plain `@unique` for "at most one active X per Y"            | Prisma's schema DSL makes `@unique` the obvious, easy tool                         | Recognize that "unique among live rows" is a _partial_ uniqueness rule, which needs a hand-written partial index — a plain unique constraint enforces the wrong, stricter rule |
| Doing an ownership check in the middleware                          | Feels like it belongs with the other authorization logic                           | Remember the middleware runs before the record is fetched — it has nothing to compare against yet; the check belongs in the service                                            |
| Letting a Prisma driver error reach the client as a raw `500`       | Only the "happy path" and the one exception you were thinking of get handled       | Catch by Prisma error `code` (e.g. `P2003`, `P2002`) at the service boundary and translate to a typed, client-safe error                                                       |
| Assuming soft delete gives you the same FK cleanup as a hard delete | "Soft delete" sounds like a strict superset of delete                              | Check what your `ON DELETE` rules actually fire on — an `UPDATE` (soft delete) never triggers them                                                                             |

## 10. Interview Preparation

**Q: Why does `GET /employees/:id` accept two different permissions
(`employee:read:any` OR `employee:read:own`) instead of two separate
routes?**

- _Concise answer_: the HTTP contract is identical either way — what
  differs is _whose_ records you can reach, a data-level concern, not a
  routing concern.
- _Detailed answer_: splitting it into two routes would duplicate the
  entire endpoint for no benefit, since the ownership check has to live
  in the service regardless (the middleware can't do it). One route,
  middleware gates on "any relevant permission," service gates on the
  actual record.
- _What interviewers are evaluating_: whether the candidate defaults to
  routing complexity for what's actually a service-layer decision.

**Q: Walk through why `Employee.userId`'s uniqueness needed a hand-written
migration instead of `schema.prisma`'s `@unique`.**

- _Concise answer_: the real rule is "unique among non-deleted rows," a
  partial constraint Prisma's schema DSL can't express.
- _Detailed answer_: a plain `@unique` enforces global uniqueness across
  all rows, including soft-deleted ones — which would have permanently
  blocked re-using a `userId` after its Employee record was deleted, a
  direct contradiction of the soft-delete design. This was found by
  testing the exact "soft-delete then recreate" scenario while writing
  this feature's documentation, not by code review. The fix was a
  hand-written `CREATE UNIQUE INDEX ... WHERE "deletedAt" IS NULL` in the
  migration SQL, which also meant the `User`↔`Employee` Prisma relation had
  to become one-to-many (`Employee[]`), since Prisma requires the FK side
  of a 1:1 relation to be schema-level unique.
- _What interviewers are evaluating_: whether the candidate can reason
  about the gap between "what my ORM's schema language can express" and
  "what the database can actually do" — and catches it by testing the
  business rule, not just reading the code.

**Q: Two real bugs were found while writing this feature's API
documentation rather than during initial development. What does that
suggest about how documentation and testing should relate?**

- _Concise answer_: writing down every documented edge case, then
  actually running each one, surfaces bugs that "does it compile / does
  the happy path work" testing doesn't.
- _Detailed answer_: both bugs (the partial-unique-index gap and the
  uncaught `P2003` foreign-key error) were found specifically because the
  documentation template requires an Edge Cases and Negative Testing
  section for every endpoint — writing "what should happen if the
  referenced `userId` doesn't exist" as a sentence, then actually sending
  that request, is what caught them. This mirrors the exact same pattern
  from the malformed-JSON `500` bug found while documenting Chapter 8's
  work.
- _What interviewers are evaluating_: whether documentation is treated as
  a real verification tool, not paperwork produced after the fact.

## 11. Summary

### Key Takeaways

- Resource-scoped authorization needs two layers: a coarse permission
  gate (middleware) and a fine ownership check (service) — the
  middleware structurally cannot do the second one.
- A soft-delete design has a real cost (no automatic FK cleanup) that
  only shows up if you go looking for it.
- "Unique among live rows" is a materially different, stricter-to-express
  constraint than "unique," and most ORM schema languages (Prisma
  included) can't express the former without hand-written SQL.

### Important Terminology

- **Coarse-grained vs. fine-grained authorization** — role-name check vs.
  permission-key resolution (this feature moved from the former to the
  latter).
- **BOLA (Broken Object Level Authorization)** — failing to verify a
  caller actually owns the specific resource they're requesting by ID.
- **Partial unique index** — a uniqueness constraint scoped by a `WHERE`
  predicate (here, `deletedAt IS NULL`), not covering every row in the
  table.

### Design Principles

- Two-layer authorization for any resource-scoped permission.
- Translate driver/ORM errors into typed errors at the first boundary
  that sees them.
- Scope a bug fix to the specific guarantee it needs to restore, not
  every adjacent thing that could theoretically also be improved.

### Best Practices

- Never let a raw Prisma/driver error reach an API response.
- Test every documented edge case for real before calling a feature done
  — this is where both of this feature's real bugs were actually found.
- Keep the ownership check in the service, the permission gate in
  middleware — never blend the two.

## 12. Revision Notes (5-minute read)

- Stage A: `Role`/`Permission`/`UserRole`/`RolePermission` tables replace
  `User.role`; `requirePermission` replaces `requireRole`; JWT payload is
  now `{ sub, roles }`; `register()`'s user+role creation is now
  transactional (narrowly).
- Stage B: `Employee` model (nullable `userId`/`managerId`, soft delete
  via `deletedAt`, self-relation for manager hierarchy) with a full
  Clean Architecture slice — 5 endpoints, `ADMIN`/`MANAGER` full CRUD,
  `EMPLOYEE` read-own only.
- Two real bugs found and fixed while verifying this feature: (1) a
  plain unique index on `Employee.userId` permanently blocked reusing a
  `userId` after soft delete — fixed with a hand-written partial unique
  index, which also changed the `User`↔`Employee` relation to one-to-many.
  (2) An invalid `userId`/`managerId` leaked a raw `500` — fixed by
  catching Prisma's `P2003` and translating it to a `400`.
- Full endpoint-level detail (all 20 sections per endpoint, every example
  verified live) lives in `handbook/API_ENDPOINTS.md`.
- Rollback plan (pre-migration `pg_dump`, recovery paths by failure
  scenario) documented in
  `planning/feature-09-rbac-redesign-and-employee-crud.md`.

## 13. One-Line Interview Answers

**Q: Why two authorization layers instead of one?**
A: The coarse permission check runs before any record is fetched; the
fine ownership check needs the record loaded first — one middleware
structurally cannot do both.

**Q: Why not a plain `@unique` on `Employee.userId`?**
A: The real rule is "unique among non-deleted rows," which a plain
unique index enforces too strictly — it would permanently block reusing
a `userId` after soft delete.

**Q: Why does soft delete not clean up `managerId` references the way a
hard delete's `ON DELETE SET NULL` would?**
A: That FK rule only fires on a real `DELETE` statement; soft delete is
just an `UPDATE`, so it never triggers.

**Q: Why keep token issuance outside `register()`'s new transaction?**
A: The fix only needed to guarantee a user is never created without a
role — token issuance failing after that is a "log in again"
inconvenience, not a broken account.

## 14. Practical Examples From Our Codebase

Verified live, in order:

```
$ curl -X POST /api/v1/auth/register -d '{"email":"...","password":"...","name":"..."}'
201 {"user":{"...","roles":["EMPLOYEE"]},"accessToken":"..."}

$ curl /api/v1/users -H "Authorization: Bearer <EMPLOYEE token>"
403 {"message":"You do not have permission to perform this action"}

$ curl -X POST /api/v1/employees -H "Authorization: Bearer <ADMIN token>" \
  -d '{"userId":"<uuid>","department":"Engineering","jobTitle":"Backend Developer","salary":75000,"dateOfJoining":"2024-01-15"}'
201 {"employee":{"id":"...","salary":"75000",...}}

$ curl -X POST /api/v1/employees -H "Authorization: Bearer <ADMIN token>" \
  -d '{"userId":"<same uuid>", ...}'
409 {"message":"This user already has an employee record"}

$ curl -X DELETE /api/v1/employees/<id> -H "Authorization: Bearer <ADMIN token>"
200 {"message":"Employee deleted successfully"}

$ curl -X POST /api/v1/employees -H "Authorization: Bearer <ADMIN token>" \
  -d '{"userId":"<same uuid>", ...}'
201   # succeeds now - the soft-deleted record's userId was freed, per the partial-unique-index fix

$ curl /api/v1/employees/<id> -H "Authorization: Bearer <a different EMPLOYEE token>"
403 {"message":"You do not have permission to view this employee record"}
```
