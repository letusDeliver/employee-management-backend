# Chapter 8: RBAC (Roles & Permissions)

## 1. Introduction

This feature builds `src/middlewares/rbac.middleware.js` — a reusable,
role-based authorization gate — and wires it to a real, concrete endpoint
(`GET /api/v1/users`, admin-only) that proves the whole authorization
chain works end to end.

It exists because Feature 7 answered _"who is this request from"_
(authentication) but deliberately said nothing about _"what are they
allowed to do"_ (authorization). Every user has carried a `role` since
Feature 6; this is the feature that finally does something with it.

In the architecture, `rbac.middleware.js` is the third file in this
project reserved by name in the very first architecture discussion
("Middleware: auth, RBAC checks, validation (Zod), error handling") before
finally being built — the same pattern as `utils/jwt.js` (Chapter 7).

---

## 2. Theory

**Authentication vs. authorization**: authentication proves identity
("who are you"); authorization decides permission ("what can you do").
They are deliberately separate middleware, run in a fixed order —
`authMiddleware` must run before any RBAC check, since you cannot decide
what someone's allowed to do before you know who they are. This exact
principle was stated back in Chapter 2's middleware-order discussion,
before either middleware existed.

**Two genuinely different ways to build RBAC**:

- **Coarse-grained (role-based)** — a middleware checks `req.user.role`
  directly against a hardcoded allow-list per route
  (`requireRole('ADMIN')`). No new tables, no extra queries per request.
  The cost: a new authorization rule means a code change and a redeploy.
- **Fine-grained (permission-based)** — named permissions
  (`employee:delete`, `employee:read:all`) exist as data, mapped to roles
  via a database table, checked via a lookup. More flexible — could be
  edited without a redeploy — but real added complexity for a system with
  no consumer that actually needs that flexibility yet.

This project chose the coarse-grained approach deliberately: there is
currently exactly one thing to protect (the new `/users` endpoint) and no
existing feature that needs anything more granular than "is this role
allowed here at all." The middleware is written generally enough
(`requireRole(...allowedRoles)`, a factory, not a single hardcoded check)
that it doesn't foreclose a permission-based layer later if Employee CRUD
turns out to genuinely need one.

**`401` vs. `403`, precisely**: `401 Unauthorized` means "I don't know who
you are" (Chapter 7). `403 Forbidden` means "I know exactly who you are,
and the answer is no." `ForbiddenError` was built in Chapter 2's original
error hierarchy and sat completely unused until this feature — the fourth
"reserved, then finally used" piece in this project's history.

**A real operational consequence of Chapter 7's design, worth restating
here concretely**: `role` lives inside the access token's payload, not
re-checked against the database on every request. Promoting a user to
`ADMIN` in the database does **not** immediately grant them admin access —
their existing access token still carries the old role until it expires
(at most 15 minutes) or they call `/refresh` or log in again, both of
which re-fetch the user and re-issue a token with the current role. This
was directly observed during this feature's own verification, not just
theorized.

**The "first admin" problem**: there is no API endpoint that lets a user
grant themselves a higher role — building one would be a privilege-
escalation vulnerability by construction. Every registration defaults to
`EMPLOYEE`. So how does the first `ADMIN` ever get created? Real systems
typically solve this with a seed script, a one-time manual database
update, or a bootstrap admin email read from config at startup. This
feature solves it the same way Features 3, 6, and 7 solved analogous
verification problems: a throwaway script directly against the database.

---

## 3. Architecture

### Request Flow — `GET /api/v1/users`

```
GET /api/v1/users
Authorization: Bearer <accessToken>
    ↓
helmet → cors → morgan → cookieParser → express.json()
    ↓
authMiddleware
    ├─ no/invalid/expired token → 401
    └─ valid → req.user = { id, role }
    ↓
requireRole('ADMIN')
    ├─ req.user.role !== 'ADMIN' → 403 Forbidden
    └─ req.user.role === 'ADMIN' → next()
    ↓
userController.list → userService.listUsers()
    ↓
userRepository.findAll() → sanitizeUser() on every record
    ↓
200 { users: [...] }   — no password field on any entry
```

### Layer Responsibilities

| Layer      | File                 | Responsibility                                          | Must NOT do                                              |
| ---------- | -------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| Middleware | `auth.middleware.js` | Authenticate — who is this                              | Decide what they're allowed to do                        |
| Middleware | `rbac.middleware.js` | Authorize — are they allowed here                       | Verify tokens itself (trusts `req.user` was already set) |
| Repository | `user.repository.js` | `findAll()` — Prisma only                               | Decide who's allowed to call it                          |
| Service    | `user.service.js`    | Sanitize every user record before it leaves the service | Touch `req`/`res`                                        |
| Controller | `user.controller.js` | Shape the response                                      | Contain any authorization logic itself                   |

### Where This Sits in the Full Clean Architecture

```
HTTP Request
    ↓
Route            ← user.routes.js (NEW)
    ↓
Middleware chain ← authMiddleware → requireRole('ADMIN')  (NEW gate)
    ↓
Controller       ← user.controller.js (NEW)
    ↓
Service          ← user.service.js (NEW)
    ↓
Repository       ← user.repository.js (MODIFIED — findAll() added)
    ↓
PostgreSQL       ← User table (existing, no schema change this feature)
```

No schema change this feature — the `role` column has existed since
Chapter 6, deliberately added early to avoid exactly the migration this
feature would otherwise have needed.

---

## 4. Folder Structure

```
src/
├── middlewares/
│   └── rbac.middleware.js       (NEW) — reserved by name since Feature 1
└── modules/
    └── users/
        ├── user.repository.js    (MODIFIED) — findAll() added
        ├── user.service.js       (NEW) — listUsers(), shared sanitizeUser
        ├── user.controller.js    (NEW)
        └── user.routes.js        (NEW)

src/routes/index.js                (MODIFIED) — mounts usersRouter at /users
src/modules/auth/auth.service.js   (MODIFIED) — reuses sanitizeUser from user.service.js
```

`modules/users/` previously held only `user.repository.js`, consumed by
`auth.service.js`. This feature gives it a full service/controller/routes
slice for the first time — the same "a module grows its own layers only
once something actually needs them" pattern `auth` went through across
Chapters 6 and 7.

---

## 5. File-by-File Explanation

### `src/middlewares/rbac.middleware.js`

```js
import ForbiddenError from '../errors/ForbiddenError.js';

const requireRole =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('You do not have permission to perform this action'));
    }

    next();
  };

export default requireRole;
```

- **A factory, not a single fixed middleware**: `requireRole('ADMIN')`,
  `requireRole('ADMIN', 'MANAGER')`, etc. — one implementation, reusable
  for any future route needing any combination of allowed roles.
- **Fails closed**: `!req.user` is checked explicitly, even though in
  practice `authMiddleware` should always run first and guarantee it
  exists. The check doesn't _assume_ correct wiring elsewhere — a missing
  `req.user` denies access rather than crashing or, worse, silently
  passing.
- **Throws the previously-unused `ForbiddenError`** — built in Chapter 2,
  never thrown by any code until this feature.
- **Interview question**: _"Why write this as `(...allowedRoles) => (req,
res, next) => {...}` instead of a plain `(req, res, next)` function?"_ —
  The outer function is a factory that captures which roles are allowed
  for _this specific route_, returning a genuine Express middleware
  closed over that list — the same higher-order-middleware pattern already
  used by `validateMiddleware(schema)` in Chapter 6.

### `src/modules/users/user.repository.js` (modified)

```js
const findAll = () => {
  return prisma.user.findMany();
};
```

- **One line, no filtering, no business logic** — deciding _who_ is
  allowed to call this is the middleware's job, not the repository's.

### `src/modules/users/user.service.js`

```js
import userRepository from './user.repository.js';

export const sanitizeUser = (user) => {
  const { password, ...safeUser } = user;
  return safeUser;
};

const listUsers = async () => {
  const users = await userRepository.findAll();
  return users.map(sanitizeUser);
};

export default { listUsers };
```

- **A small DRY correction made during this feature**: `sanitizeUser` had
  been duplicated verbatim inside `auth.service.js` since Chapter 6. Since
  this feature needed the exact same logic (strip `password` before any
  user record leaves a service), it was extracted here as a named export
  and `auth.service.js` was updated to import and reuse it instead of
  keeping its own copy.
- **Why `user.service.js`, not a generic `utils/` helper**: sanitizing a
  `User` record is fundamentally about the `User` entity, not a
  general-purpose utility — keeping it in the module that owns that
  entity's shape means anyone changing what a "safe" user record looks
  like only has one place to update.
- **Interview question**: _"When do you extract a helper instead of
  leaving small duplication in place?"_ — When a second real consumer
  appears for logic that must stay identical across both — here, both
  `auth.service.js` and `user.service.js` need the exact same fields
  stripped, and letting them drift independently (e.g., one gets updated
  to also strip a new sensitive field, the other doesn't) is a real risk
  worth eliminating once there are two call sites, not before.

### `src/modules/users/user.controller.js`

```js
const list = async (req, res) => {
  const users = await userService.listUsers();
  res.status(200).json({ users });
};
```

- Genuinely thin — no role checking here at all, since `requireRole`
  already ran in the route's middleware chain before this controller is
  ever reached.

### `src/modules/users/user.routes.js`

```js
router.get('/', authMiddleware, requireRole('ADMIN'), asyncHandler(userController.list));
```

- **The middleware order is the whole security model of this route,
  visible in one line**: authenticate, then authorize, then handle. Get
  this order wrong (swap the two middlewares) and `requireRole` would run
  against a `req.user` that hasn't been verified yet — this is exactly why
  Chapter 2 established middleware order as a design decision worth
  stating explicitly, not an incidental detail.

---

## 6. Request Lifecycle

Traced live during implementation:

1. A fresh user registered via `/auth/register` — defaults to `EMPLOYEE`.
2. `GET /api/v1/users` with no `Authorization` header → `401
Authentication required` (from `authMiddleware`, unchanged from
   Chapter 7 — `requireRole` never even runs).
3. `GET /api/v1/users` with a valid `EMPLOYEE`-role access token → `403
You do not have permission to perform this action` (from
   `requireRole('ADMIN')` — the token is valid, the role just doesn't
   qualify).
4. A throwaway script directly updated that user's `role` to `ADMIN` in
   the database.
5. **The still-logged-in access token from step 3 was not retried** — its
   payload still says `role: 'EMPLOYEE'`, baked in at the time it was
   issued. A **fresh login** was required to get a new token whose payload
   reflects the updated role, read fresh from the database inside
   `issueTokenPair`.
6. `GET /api/v1/users` with that fresh, `ADMIN`-role token → `200`, an
   array of all three users in the database at the time (from this and
   prior features' testing), each with `password` absent.
7. `logs/combined.log` was searched for the test password and found
   nothing — consistent with every prior feature's logging discipline.

---

## 7. Best Practices

- **Authenticate, then authorize — always in that order, every route.**
- **Fail closed in the authorization check itself**, not just by relying
  on correct middleware ordering elsewhere.
- **Keep authorization decisions out of controllers and services** — a
  controller that starts checking `req.user.role` itself duplicates logic
  that belongs in one reusable, testable middleware.
- **Extract duplicated logic once a second real consumer needs the exact
  same behavior**, not preemptively, and not indefinitely once that second
  consumer actually shows up.

### Security implications, consolidated

- Role information comes from nowhere but the verified JWT payload —
  never a request body, query string, or client-supplied header.
- `403`, not a silent `200` with filtered data or a misleading `404`, is
  the honest response for "you're authenticated but not authorized here."
- Role changes have a real, bounded propagation delay (up to the access
  token's lifetime) — a direct, accepted trade-off of the stateless-
  access-token design, not a bug.
- There is no self-service path to becoming an `ADMIN` — by design, not
  by oversight.

---

## 8. Performance Considerations

- **`requireRole` costs nothing beyond an array `.includes()` check** — no
  database access, consistent with keeping the entire authenticated
  request path (auth + authorization) database-free except where the
  route's actual business logic needs it.
- **`GET /users`'s cost is a single unfiltered `findMany()`** — fine at
  this project's current scale; pagination is a natural, currently-
  unneeded future addition once the user count grows large.

---

## 9. Common Mistakes

| Mistake                                                                                | Why it happens                                                    | How senior engineers avoid it                                                                                                                          |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Checking `req.user.role` inline inside a controller instead of a shared middleware     | Feels quicker for a single route                                  | Duplicates the check everywhere it's needed and makes the security model harder to audit at a glance                                                   |
| Trusting a `role` field from the request body/query string                             | Seems convenient during quick manual testing                      | Only ever trust role information that came from a verified token signature                                                                             |
| Assuming a role change takes effect on the next request                                | Not realizing the role is baked into the already-issued token     | Understand that a stateless access token's claims are frozen at issuance time until it's refreshed or expires                                          |
| Building a full permissions table before there's a second real need for it             | "Roles & permissions" sounds like it implies a permissions schema | Recognize the coarse-grained middleware for a single admin-only route today, and revisit only when a genuine second need for finer granularity appears |
| Returning `200` with an empty/filtered result instead of `403` for unauthorized access | Seems "safer" or more graceful                                    | Obscures what actually happened and complicates debugging; an honest `403` is the correct, standard signal                                             |

---

## 10. Interview Preparation

**Q: Why must `authMiddleware` run before `requireRole` in the middleware
chain?**

- _Concise answer_: authorization decisions depend on knowing who's
  making the request; `requireRole` reads `req.user.role`, which only
  exists after `authMiddleware` has verified the token and set it.
- _Detailed answer_: this is the authentication/authorization ordering
  principle stated as far back as Chapter 2's middleware-order discussion,
  now concretely instantiated. If the order were reversed, `requireRole`
  would run against an unset `req.user` on every request — its fail-closed
  check (`!req.user`) would deny everyone, including legitimately
  authorized admins, which is at least a safe failure mode, but it would
  make the route completely unusable rather than correctly gated.
- _What interviewers are evaluating_: whether middleware ordering is
  understood as a load-bearing security property, not an arbitrary list.

**Q: A user's role was just changed from `EMPLOYEE` to `ADMIN` in the
database, but they still can't access an admin route with their current
session. Why, and is that a bug?**

- _Concise answer_: not a bug — their existing access token's payload
  still carries the old role, frozen at the moment it was issued; a fresh
  login or `/refresh` call re-reads the current role from the database.
- _Detailed answer_: this is the direct, accepted cost of choosing
  stateless access-token verification in Chapter 7 — no database check
  happens on every request specifically so that verification stays cheap.
  The trade-off is that any change to the underlying user record (role,
  or a future "deactivated" flag) has a propagation delay bounded by the
  access token's lifetime (15 minutes here) or by the user's next
  refresh/login.
- _What interviewers are evaluating_: understanding that stateless-token
  designs have this specific, well-known limitation, and being able to
  explain it as a deliberate trade-off rather than a surprising bug.

**Q: Why choose role-based checks over a permissions table for this
feature specifically?**

- _Concise answer_: there's exactly one thing to protect right now and no
  existing requirement for finer granularity than "is this role allowed
  here" — building a permissions schema now would be designing data
  structures for a system with no real consumer yet.
- _Detailed answer_: a permissions table earns its complexity once
  routes need genuinely different, independently-configurable rules per
  role (e.g., "MANAGER can edit an employee's leave balance but not their
  salary") — a real need that will likely surface during Employee CRUD,
  not before. Building it speculatively now means guessing at a shape that
  may not match what's actually needed later. The `requireRole(...roles)`
  middleware is intentionally general enough to not block adding a
  permission-based layer on top later.
- _What interviewers are evaluating_: judgment about right-sizing a
  design to the problem actually in front of you, versus reaching for the
  more "impressive"-sounding architecture by default.

---

## 11. Summary

### Key Takeaways

- Authentication and authorization are separate, ordered concerns — this
  feature is the concrete implementation of a principle stated back in
  Chapter 2.
- `rbac.middleware.js` is the third file in this project reserved by name
  long before it was built.
- A role's effect on access is bounded by the access token's lifetime —
  not instant, and that's by design, not a defect.

### Important Terminology

- **RBAC (Role-Based Access Control)** — authorizing actions based on a
  user's assigned role.
- **Coarse-grained vs. fine-grained authorization** — checking a role
  directly, versus checking named permissions mapped to roles as data.
- **Fail closed** — denying access by default when a required piece of
  authorization state is missing, rather than assuming it's fine.

### Design Principles

- Authenticate, then authorize, always in that order.
- Extract shared logic once a second real consumer needs it identically,
  not before.
- Match the authorization model's complexity to what's actually needed
  today, without foreclosing a more complex model later.

### Best Practices

- `403` for "authenticated but not allowed," never a silently-filtered
  `200` or a misleading `404`.
- Role/permission data comes only from a verified token, never client
  input.
- Fail-closed checks in authorization middleware, independent of trusting
  correct wiring elsewhere.

---

## 12. Revision Notes (5-minute read)

- `rbac.middleware.js`: `requireRole(...allowedRoles)`, fails closed,
  throws `ForbiddenError` (403) — reserved since Feature 1, built now.
- `modules/users/` gained its own `service`/`controller`/`routes` for the
  first time; `findAll()` added to the repository.
- New endpoint: `GET /api/v1/users` — `authMiddleware` →
  `requireRole('ADMIN')` → list all users, sanitized.
- `sanitizeUser` extracted from `auth.service.js` into `user.service.js`
  as a shared, named export — removes a duplication that existed since
  Chapter 6.
- Verified live: no token → `401`; wrong role → `403`; promoted to
  `ADMIN` via a throwaway DB script (no self-service path exists, by
  design); **a fresh login was required** before the promotion actually
  took effect, since the old access token's role claim was frozen at
  issuance; correct role → `200`, full user list, no passwords.
- No schema change this feature — `role` has existed since Chapter 6
  specifically to avoid needing one here.

---

## 13. One-Line Interview Answers

**Q: Why must authentication run before authorization?**
A: You can't decide what someone is allowed to do before you know who
they are.

**Q: Why didn't the role promotion take effect immediately?**
A: The access token's role claim is frozen at issuance — a direct
consequence of verifying it statelessly, without a database check on
every request.

**Q: Why role-based checks instead of a permissions table here?**
A: There's exactly one route to protect and no real need yet for finer
granularity than "is this role allowed at all."

**Q: Why does `requireRole` check `!req.user` explicitly?**
A: To fail closed even if middleware ordering were ever wrong elsewhere,
rather than assuming `req.user` is always set correctly.

**Q: Why extract `sanitizeUser` into `user.service.js` now?**
A: A second real consumer (`user.service.js` itself) needed the identical
behavior, and letting two copies drift independently was a real risk
worth removing.

---

## 14. Practical Examples From Our Codebase

Verified live, in order:

```
$ curl /api/v1/users                                    # no token
401 {"message":"Authentication required"}

$ curl /api/v1/users -H "Authorization: Bearer <EMPLOYEE token>"
403 {"message":"You do not have permission to perform this action"}

# (promoted the user to ADMIN via a throwaway DB script)

$ curl /api/v1/users -H "Authorization: Bearer <same old EMPLOYEE token>"
403 (unchanged — the old token's role claim is stale)

$ curl -X POST /api/v1/auth/login -d '{"email":"...","password":"..."}'
# fresh token, role now reads ADMIN from the database

$ curl /api/v1/users -H "Authorization: Bearer <fresh ADMIN token>"
200 {"users":[{"id":"...","email":"...","role":"EMPLOYEE",...},
              {"id":"...","email":"...","role":"ADMIN",...}, ...]}
# no "password" field on any entry
```
