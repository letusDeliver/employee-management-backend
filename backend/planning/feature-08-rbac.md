# Feature 8: RBAC (Roles & Permissions) — Action Plan

Status: **Awaiting review/approval**. Nothing below has been executed yet.

## Scope

Build a reusable, role-based authorization middleware and wire it to a
real, concrete endpoint (`GET /api/v1/users`, admin-only) that proves it
works end to end. A full permission-table system is deliberately out of
scope — revisit if Employee CRUD's actual requirements demand it.

## Confirmed decisions (from the theory discussion)

- Coarse-grained `requireRole(...allowedRoles)` middleware — no new
  database tables.
- `GET /api/v1/users` (admin-only, lists all users) is this feature's
  concrete proof-of-chain endpoint.

## Actions

1. **Create `src/middlewares/rbac.middleware.js`**:
   - `requireRole(...allowedRoles)` — a factory returning Express
     middleware.
   - Fails closed: if `req.user` or `req.user.role` is missing/malformed,
     deny access (this should never happen if `authMiddleware` always
     runs first, but the check doesn't assume that).
   - If `req.user.role` isn't in `allowedRoles`, throws `ForbiddenError`
     (403) — reserved since Chapter 2, unused until now.
   - If it is, calls `next()`.

2. **Add `findAll()` to `src/modules/users/user.repository.js`** —
   Prisma query only, no business logic.

3. **Create `src/modules/users/user.service.js`**:
   - `listUsers()`: calls `userRepository.findAll()`, strips `password`
     from every record before returning (same sanitize-before-return
     principle as `auth.service.js`).

4. **Create `src/modules/users/user.controller.js`**:
   - Thin — calls `userService.listUsers()`, responds `200` with the
     array.

5. **Create `src/modules/users/user.routes.js`**:
   - `GET /` → `authMiddleware` → `requireRole('ADMIN')` →
     `asyncHandler(userController.list)`.

6. **Update `src/routes/index.js`** — mount the new users router at
   `/users` (full path becomes `/api/v1/users`).

7. **Manual verification**:
   - Register a fresh user (defaults to `EMPLOYEE`).
   - `GET /api/v1/users` as that `EMPLOYEE` → `403 Forbidden`.
   - `GET /api/v1/users` with no token at all → `401` (confirms
     `authMiddleware` still runs first, independent of the new RBAC
     check).
   - Promote a test user to `ADMIN` via a throwaway script against the
     real database (same pattern as Features 3, 6, and 7 — this project
     has no self-service "become admin" endpoint by design).
   - Log in as that `ADMIN`, call `GET /api/v1/users` → `200`, an array
     of users, **no `password` field on any entry**.
   - Confirm no secrets/passwords leak into `logs/*.log`.

8. **Run `npm run lint` and `npm run format:check`.**

9. **Update `CLAUDE.md`** — check off "RBAC (roles & permissions)."

10. **Update the root `README.md`** (per the new standing Rule 16) — add
    `GET /users` to the API endpoints table, check off RBAC in the
    roadmap. Done before pushing, in the same commit.

11. **Write the next handbook chapter** (`handbook/08-rbac.md`)
    automatically, per your standing instruction.

## Explicitly out of scope (deferred to later features)

- A full `Permission`/`RolePermission` database schema — revisit only if
  a real, concrete need for finer granularity shows up (most likely during
  Employee CRUD).
- Any self-service way to change a user's own role — role changes remain
  a manual/administrative operation for now.
- Any UI or endpoint for promoting/demoting users — verification uses a
  direct database script instead; a real "admin manages users" endpoint
  is a natural candidate for a future feature if needed.
