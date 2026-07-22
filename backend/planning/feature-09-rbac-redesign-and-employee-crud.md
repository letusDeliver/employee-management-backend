# Feature 9: RBAC Redesign + Employee CRUD — Action Plan

Status: **Awaiting review/approval**. Nothing below has been executed yet.

Branch: `feature/09-rbac-and-employee-crud` (renamed from the originally
created `feature/09-employee-crud` once scope expanded during the theory
discussion — no commits existed yet, so the rename was free).

## Scope

This feature has two stages on **one branch**, with a hard checkpoint
between them:

- **Stage A — RBAC redesign**: replace the Feature 8 coarse-grained
  `User.role` enum + `requireRole` middleware with a full relational
  model (`Role`, `Permission`, `UserRole`, `RolePermission`) and a
  `requirePermission` middleware. This is a rebuild of the authorization
  layer underneath Features 6-8, not new user-facing behavior.
- **Stage B — Employee CRUD**: the actual new feature — `Employee` model
  and a full Clean Architecture slice, built on top of Stage A's
  permission middleware from the start.

Stage A is **not independently mergeable** — the moment `User.role` is
retired, login/`/me`/`/users` are broken until the new model is fully
wired back in. So Stage A must be fully re-verified end-to-end before
Stage B begins, and only the combined result is merged to `main`.

Explicitly deferred to later, already-numbered features (not part of this
one): `AuditLog` table + audit writes (Feature 11), `Attachment` table +
Cloudinary/Multer (Feature 12), pagination/search/filter/sort on
`GET /employees` (Feature 10).

## Confirmed decisions (from the theory discussion)

- **Data model**: separate `Employee` table, 1:1 with `User` via a
  nullable, unique `userId` FK (Employee can outlive or predate a login
  account).
- **Authorization matrix**: `ADMIN` and `MANAGER` can create/read-any/
  update-any/delete-any Employee records. `EMPLOYEE` can only
  read-own (no self-service edit of their own HR record — department/
  salary/job title changes stay a manager/admin action).
- **Delete semantics**: soft delete via nullable `deletedAt` timestamp,
  not a separate `isActive`/employment-status field. All reads default to
  `WHERE deletedAt IS NULL`. Employment-status tracking (ACTIVE/
  TERMINATED/ON_LEAVE) is a possible future feature, not built now.
- **`role` enum retirement**: clean cut-over, no backward-compatibility
  shim — this is a dev database with no real production data at stake.
- **Opportunistic fix bundled in**: `register()`'s Feature-7-documented
  non-transactional gap gets fixed here, narrowly — see Action 6 below.
- **`department` stays a plain string**, not a normalized `Department`
  table, for now (documented simplification, same treatment as other
  honest gaps in this project).

---

## Stage A — RBAC Redesign

### Schema (one migration)

New models: `Role`, `Permission`, `UserRole`, `RolePermission`.
`User.role` enum column removed entirely (the `Role` _enum_ type is
deleted so the name is free for the new `Role` _model_ — Prisma doesn't
allow an enum and a model to share a name, so this only works because
we're retiring the enum in the same migration).

Initial permission key set (`resource:action:scope` convention):

| Key                   | Meaning                               |
| --------------------- | ------------------------------------- |
| `user:list`           | List all users (`GET /users`)         |
| `employee:create`     | Create an employee record             |
| `employee:read:any`   | Read any employee record (incl. list) |
| `employee:read:own`   | Read your own employee record only    |
| `employee:update:any` | Update any employee record            |
| `employee:delete:any` | Soft-delete any employee record       |

Seed grants:

| Role       | Permissions                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `ADMIN`    | `user:list`, `employee:create`, `employee:read:any`, `employee:update:any`, `employee:delete:any` |
| `MANAGER`  | `employee:create`, `employee:read:any`, `employee:update:any`, `employee:delete:any`              |
| `EMPLOYEE` | `employee:read:own`                                                                               |

### Actions

1. **Update `prisma/schema.prisma`**: add `Role`, `Permission`,
   `UserRole` (composite PK `[userId, roleId]`, secondary index on
   `roleId`), `RolePermission` (composite PK `[roleId, permissionId]`,
   secondary index on `permissionId`); remove the `Role` enum and
   `User.role` column. Run the migration
   (`add_rbac_tables_remove_role_enum` or similar).

2. **Write `prisma/seed.js`**: idempotent (upsert) creation of the three
   system roles (`isSystem: true`), the six permissions above, and the
   `RolePermission` grants from the table above. Wire it into
   `prisma.config.js` (Prisma 7's seed config shape gets verified in a
   scratch check first, per this project's established habit, before
   relying on it for real).

3. **Create `src/modules/rbac/rbac.repository.js`**: Prisma-only queries
   — `getPermissionKeysForRoles(roleNames)` (join `Role → RolePermission
→ Permission`, return a flat array of keys), `assignRoleToUser(userId,
roleName, tx?)` (accepts an optional Prisma transaction client, since
   `register()` needs to call this inside a transaction).

4. **Create `src/utils/permissionCache.js`**: a small in-memory
   `Map`-based cache, keyed by role name, short TTL (a few minutes),
   populated via `rbac.repository.js` on miss. Role→permission mappings
   change rarely, so this avoids a join on every authenticated request
   without needing Redis.

5. **Update `src/middlewares/auth.middleware.js`**: `req.user` becomes
   `{ id: payload.sub, roles: payload.roles }` (array, not a single
   `role` string).

6. **Update `src/modules/auth/auth.service.js`**:
   - `issueTokenPair`: JWT payload becomes `{ sub, roles }` — roles
     fetched via the user's `UserRole` records.
   - `register()`: user creation **and** default-`EMPLOYEE`-role
     assignment now happen inside one `prisma.$transaction`. This is a
     deliberately _narrow_ fix to the Feature 7 gap — it guarantees a
     user is never created without a role (a real broken state: an
     account that can pass zero permission checks, ever), but token
     issuance (the `RefreshToken` write) stays a separate step after
     commit, same as before. A failure between the transaction commit
     and token issuance just means "please log in again," which is a
     minor UX inconvenience, not a data-integrity problem — not the same
     class of bug as the original gap.
   - `login()`: fetch the user's roles (via `UserRole`) to build the JWT
     payload.

7. **Replace `src/middlewares/rbac.middleware.js`** with
   `src/middlewares/permission.middleware.js`:
   - `requirePermission(...requiredKeys)` — resolves the permission set
     granted by `req.user.roles` (through the cache), fails closed with
     `ForbiddenError` (403) if `req.user` is missing or none of the
     required keys are granted.
   - This is a coarse gate only. Fine-grained ownership checks (for
     `:own`-scoped permissions) happen in the service layer once the
     specific record is loaded — the middleware has no record to check
     against yet.

8. **Update `src/modules/users/user.routes.js`**: `GET /` now uses
   `requirePermission('user:list')` instead of `requireRole('ADMIN')`.

9. **Update `src/modules/users/user.service.js`**: `sanitizeUser` shapes
   a `roles` array (role names) onto the safe user object instead of a
   single `role` field.

### Stage A verification (must all pass before Stage B starts)

- Fresh `register()` → `201`, user has exactly one `UserRole` row
  (`EMPLOYEE`), JWT payload contains `roles: ['EMPLOYEE']`.
- `login()` → same shape, roles reflect current `UserRole` assignments.
- `GET /me` → still `200`, sanitized user now shows `roles` array.
- `GET /users` as an `EMPLOYEE` → `403`. As an `ADMIN` (promoted via the
  same throwaway-DB-script pattern as Feature 8, now inserting a
  `UserRole` row instead of updating an enum column) → `200`.
- No secrets/tokens/passwords in `logs/*.log` (same check as every prior
  feature).
- `npm run lint` / `npm run format:check` clean.
- Update `handbook/API_ENDPOINTS.md` for `/auth/register`, `/auth/login`,
  `/auth/me`, `/users` — the JWT payload shape and authorization
  mechanism changed even though URLs/request shapes mostly didn't (Rule
  17).

**→ Stop here and confirm with you before starting Stage B.**

---

## Stage B — Employee CRUD

### Schema

Add `Employee`: `id`, `userId` (unique, nullable, FK → `User.id`,
`ON DELETE SET NULL`), `department` (string), `jobTitle` (string),
`salary` (decimal), `dateOfJoining` (date), `managerId` (nullable,
self-relation FK → `Employee.id`, `ON DELETE SET NULL`), `deletedAt`
(nullable timestamp), `createdAt`/`updatedAt`. One migration.

Indexes now: unique on `userId`, index on `managerId`. The
`department`-specific partial index and any search-related index are
deferred to Feature 10, where they're actually put to use.

### Actions

10. **`src/modules/employees/employee.validation.js`**: Zod schemas —
    `createEmployeeSchema` (all HR fields required, `dateOfJoining` must
    not be in the future, `salary` a positive number), `updateEmployeeSchema`
    (`.partial()` of the same).

11. **`src/modules/employees/employee.repository.js`**: Prisma-only —
    `create`, `findById` (filtered `deletedAt: null`), `findByUserId`,
    `findAll` (unpaginated, `deletedAt: null` — pagination is Feature
    10's job), `update`, `softDelete` (sets `deletedAt: new Date()`).

12. **`src/modules/employees/employee.service.js`**: business rules —
    - `createEmployee`: reject if `userId` already has a non-deleted
      Employee row (`ConflictError`, 409); reject if `managerId` equals
      the employee's own id (impossible on create, but the check is
      shared with update); wraps the Prisma unique-constraint violation
      into the same `ConflictError` if the DB catches a race the
      pre-check missed.
    - `getEmployeeById`: throws `NotFoundError` (404) if missing or
      soft-deleted; enforces the ownership check for `employee:read:own`
      callers (`record.userId === req.user.id`, otherwise `ForbiddenError`)
      — callers with `employee:read:any` skip this check entirely.
    - `listEmployees`: `employee:read:any` only (an `EMPLOYEE` calling
      this without `:any` is rejected at the middleware layer, since they
      only ever have `:own`).
    - `updateEmployee`: `NotFoundError` if missing/soft-deleted; rejects
      `managerId === id` (no self-management).
    - `softDeleteEmployee`: `NotFoundError` if already soft-deleted
      (from the querying side, a soft-deleted record simply doesn't
      exist — consistent with how a hard-deleted record would look).

13. **`src/modules/employees/employee.controller.js`**: thin — parse
    request, call service, shape response. No business rules here.

14. **`src/modules/employees/employee.routes.js`**:
    - `POST /` → `requirePermission('employee:create')`
    - `GET /` → `requirePermission('employee:read:any')`
    - `GET /:id` → `requirePermission('employee:read:any', 'employee:read:own')`
      (middleware allows either key; the service does the fine-grained
      ownership check when only `:own` was actually granted)
    - `PATCH /:id` → `requirePermission('employee:update:any')`
    - `DELETE /:id` → `requirePermission('employee:delete:any')`
    - All routes behind `authMiddleware` first, same as every existing
      protected route.

15. **Update `src/routes/index.js`**: mount `employeeRouter` at
    `/employees` (full path `/api/v1/employees`).

### Stage B verification

- Create employee as `ADMIN`/`MANAGER` → `201`.
- Second employee for the same `userId` → `409`.
- `GET /employees` as `ADMIN` → `200`, array. As plain `EMPLOYEE` → `403`.
- `GET /employees/:id` as the owning `EMPLOYEE` → `200`. As a
  _different_ `EMPLOYEE` → `403`. As `ADMIN`/`MANAGER` for any record →
  `200`.
- `PATCH /employees/:id` with `managerId` set to the record's own `id` →
  `400`/`422` business-rule rejection.
- `DELETE /employees/:id` → `200`/`204`; subsequent `GET` on the same id
  → `404`; a second `DELETE` on the same id → `404` (not `409`).
- `npm run lint` / `npm run format:check` clean.
- `handbook/API_ENDPOINTS.md`: full 20-section entries for all five new
  endpoints (Rule 17).
- Root `README.md`: new endpoints added to the API table, roadmap
  checkbox flow updated (Rule 16).
- `CLAUDE.md` Progress Log: check off "Employee CRUD," append the
  feature-9 prose note (RBAC redesign + Employee CRUD, both stages,
  findings from both checkpoints).
- Next handbook chapter: `handbook/09-rbac-redesign-and-employee-crud.md`.

---

## Explicitly out of scope (deferred to already-planned later features)

- Pagination, searching, filtering, sorting on `GET /employees` —
  **Feature 10**.
- `AuditLog` table and any audit-trail writes — **Feature 11**. Employee
  CRUD ships without audit logging for one feature-cycle; this is a
  deliberate, temporary, honestly-documented gap, closed immediately next
  by retrofitting audit-log calls into the service methods built here.
- `Attachment` table, Multer, Cloudinary — **Feature 12**.
- Multi-tenancy (`tenantId` columns) — no proven need yet; today's design
  deliberately avoids constraints that would make adding it later
  expensive (see the theory discussion), but nothing is built now.
- `Department` as a normalized entity, employment-status tracking
  (`ACTIVE`/`TERMINATED`/etc.) — possible future features, not this one.
- Self-service editing of one's own Employee record — `EMPLOYEE` role
  gets `employee:read:own` only, no `:update:own`.
- Any self-service role-management endpoint — role assignment stays a
  manual/administrative operation (direct DB script for testing), same
  as Feature 8.

---

## Rollback Plan (Stage A)

Every prior feature's "rollback" was just `git checkout` — the database
never changed shape, so reverting code was sufficient. Stage A is
different: it **drops a real column** (`User.role`) and adds four new
tables against the one live local Postgres instance. Git branches don't
isolate database state — the migration applies to the same database
regardless of which branch is checked out. So code rollback and schema
rollback are two separate mechanisms here, and only doing the first is
not enough.

### Pre-migration safety net (done before touching `schema.prisma`)

- Full `pg_dump` of the dev database, taken via `pg_dump.exe`:
  `backups/pre-stage-a-rbac-20260705-095625.sql` (git-ignored — contains
  password hashes/PII, must never be committed; `backups/` added to
  `.gitignore` for this reason).
  - Note for future reference: the dump command had to percent-encode
    the password in-memory before calling `pg_dump`, because the real
    `DATABASE_URL`'s password contains a literal `@` that Prisma's own
    URL parser tolerates but `pg_dump`'s standard URI parser doesn't
    (it misreads part of the password as a hostname). Worth knowing if
    any other external Postgres tool needs to consume this connection
    string directly in the future.
- Current git state is clean on `main` at the commit this branch forked
  from — the pre-Stage-A `schema.prisma` and all auth-related source
  files are recoverable from `main` at any time via `git checkout main --
<path>`, independent of the database question above.

### Recovery paths, by failure scenario

**1. The migration itself fails mid-apply (a DDL error).**
Postgres wraps each Prisma migration in a single transaction, so a
failed migration is auto-rolled-back at the database level — no partial
schema change survives. Recovery: run `npx prisma migrate status` to
confirm the failed migration is marked as not applied, fix
`schema.prisma`, and re-run `npx prisma migrate dev`. No data lost, no
restore needed.

**2. The migration succeeds, but the seed data is wrong/corrupted.**
No schema rollback needed. `prisma/seed.js` is written to be idempotent
(upserts, not inserts) specifically so this case is cheap to fix — just
re-run it:

```
npx prisma db seed
```

This re-creates the three system roles, the six permissions, and the
`RolePermission` grants from a clean slate without touching any other
table.

**3. The migration and seed both succeed, but Stage A must be abandoned
entirely** (e.g. the new auth flow is found to be broken in a way that
isn't a quick fix).

1.  **Restore the previous schema**: `git checkout main --
prisma/schema.prisma`, then `npx prisma generate` to regenerate a
    Prisma Client matching the restored (old) schema.
2.  **Restore the previous database state**: the new tables and the
    dropped `role` column can't be undone by editing `schema.prisma`
    alone — Prisma doesn't generate a "down" migration automatically.
    Restore from the pre-migration backup:
    ```
    psql "$FIXED_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
    psql "$FIXED_URL" -f backups/pre-stage-a-rbac-20260705-095625.sql
    ```
    (using the same in-memory percent-encoded connection string
    approach as the backup step — the raw `DATABASE_URL` is never
    displayed). This restores every table, including `User.role`
    values and any test data created since the backup was taken —
    which is exactly why the backup was taken _immediately_ before
    running the migration, not at the start of the session.
3.  **Reseed roles**: not applicable after a full backup restore (the
    restored database already reflects the pre-Stage-A state, with no
    `Role`/`Permission` tables at all). This step only applies to
    failure scenario 2 above.
4.  **Revert the auth middleware and service code**: `git checkout
main -- src/middlewares/auth.middleware.js
src/middlewares/rbac.middleware.js src/modules/auth/auth.service.js
src/modules/users/user.service.js src/modules/users/user.routes.js`
    (deleting `src/middlewares/permission.middleware.js` and
    `src/modules/rbac/` if they were created), then restart the dev
    server.
5.  Re-verify the restored state exactly like any prior feature's
    baseline: register, login, `/me`, `/users` all working against the
    old `role`-enum model again.

### What this plan deliberately does not cover

Multi-instance/production rollback procedures (this is a single local
dev database with no deployed environment yet) — this plan is scoped to
what's actually true of this project right now, not a hypothetical
production runbook. Revisit when Dockerization/deployment is a real
feature.
