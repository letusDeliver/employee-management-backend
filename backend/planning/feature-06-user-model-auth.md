# Feature 6: User Model & Auth (Register/Login) — Action Plan

Status: **Awaiting review/approval**. Nothing below has been executed yet.

## Scope

Add the first real Prisma model (`User`), the first generic request-body
validation middleware, and the first full Clean Architecture slice (route
→ controller → service → repository) for `POST /register` and
`POST /login`. **JWT issuance is explicitly out of scope** — `/login`
verifies credentials correctly and returns a sanitized user object; the
next feature (JWT Access + Refresh Tokens) modifies this same controller
to also issue tokens, without changing the underlying verification logic.

## Confirmed decisions (from the theory discussion)

- `/login` returns `200` with a sanitized user object, no token yet.
- `bcryptjs` (pure JS, no native compilation) over `bcrypt`, given Windows.
- `User.role` (enum, default `EMPLOYEE`) is added now, even though RBAC
  enforcement is a separate future feature.

## Actions

1. **Install `bcryptjs`** (dependency).

2. **Update `prisma/schema.prisma`** — add the `User` model and `Role`
   enum:

   ```prisma
   model User {
     id        String   @id @default(uuid())
     email     String   @unique
     password  String
     name      String
     role      Role     @default(EMPLOYEE)
     createdAt DateTime @default(now())
     updatedAt DateTime @updatedAt
   }

   enum Role {
     ADMIN
     MANAGER
     EMPLOYEE
   }
   ```

3. **Run `npx prisma migrate dev --name add_user_model`** — this is the
   first _real_ migration (Feature 3's had zero models and produced none).
   Uses the already-granted `CREATEDB` shadow-database permission from
   Feature 3.

4. **Create `src/middlewares/validate.middleware.js`** — the generic,
   reusable Zod-schema-runner middleware reserved in the original
   architecture but never built (no prior feature needed per-request body
   validation; Feature 4's env validation is a boot-time concern, a
   different mechanism entirely):
   - Takes a Zod schema, returns Express middleware.
   - `safeParse`s `req.body`; on failure, forwards a `BadRequestError` with
     a readable summary of the issues; on success, replaces `req.body`
     with the parsed/coerced data and calls `next()`.

5. **Create `src/modules/users/user.repository.js`**:
   - `findByEmail(email)`, `create(data)`, `findById(id)` — Prisma calls
     only, importing the shared client from `config/database.js`. No
     business logic.

6. **Create `src/modules/auth/auth.validation.js`**:
   - `registerSchema`: `email` (valid email), `password` (minimum length,
     not a complexity regex — per the NIST-800-63B-aligned reasoning from
     the theory discussion), `name` (non-empty string).
   - `loginSchema`: `email` (valid email), `password` (non-empty string —
     no length policy enforced at login time, only at registration).

7. **Create `src/modules/auth/auth.service.js`**:
   - `register(data)`: checks email uniqueness via the user repository
     (`ConflictError` if taken), hashes the password with `bcryptjs`,
     creates the user, returns it with `password` stripped out.
   - `login(data)`: looks up the user by email. If not found, runs a
     **dummy `bcrypt.compare`** against a precomputed dummy hash (so the
     "not found" path takes comparable time to the "found but wrong
     password" path — the timing-attack mitigation from the theory
     discussion) before throwing a generic `UnauthorizedError('Invalid
credentials')`. If found, compares the password; on mismatch, throws
     the exact same generic error (enumeration-safety — both failure modes
     are indistinguishable to the caller). On success, returns the user
     with `password` stripped out.

8. **Create `src/modules/auth/auth.controller.js`**:
   - Thin — extracts `req.body`, calls the corresponding service method,
     shapes the response: `201 { message, user }` for register, `200
{ message, user }` for login.

9. **Create `src/modules/auth/auth.routes.js`**:
   - `POST /register` → `validateMiddleware(registerSchema)` →
     `asyncHandler(controller.register)`.
   - `POST /login` → `validateMiddleware(loginSchema)` →
     `asyncHandler(controller.login)`.

10. **Update `src/routes/index.js`** — mount the auth router at `/auth`
    (so the full paths become `/api/v1/auth/register`,
    `/api/v1/auth/login`).

11. **Manual verification**:
    - Register a new user → `201`, response contains no `password` field.
    - Register the same email again → `409 Conflict`.
    - Login with correct credentials → `200`, sanitized user returned.
    - Login with a wrong password → `401`, generic `"Invalid credentials"`.
    - Login with a non-existent email → `401`, the **exact same** generic
      message (confirms enumeration-safety).
    - Confirm the stored `password` column actually contains a bcrypt hash,
      not plaintext (inspect via a throwaway script against the real DB,
      not psql, consistent with how Feature 3 avoided needing the
      Postgres superuser password).
    - Confirm register/login request bodies (containing passwords) never
      appear in `logs/*.log` — re-confirms Morgan's no-body-logging
      behavior specifically in the presence of real credentials now.

12. **Run `npm run lint` and `npm run format:check`.**

13. **Update `CLAUDE.md`** — check off "User model & Auth: Register/Login."

14. **Write the next handbook chapter**
    (`handbook/06-user-model-auth.md`) automatically, per your standing
    instruction.

## Explicitly out of scope (deferred to later features)

- JWT issuance, access/refresh tokens, session management — the entire
  next feature.
- RBAC enforcement (middleware checking `role`) — the `role` _column_
  exists now; nothing reads it yet.
- Rate limiting on `/login` (brute-force protection) — no rate-limiting
  middleware exists in the stack yet; flagged as a real production gap to
  revisit, not silently skipped.
- Password reset / email verification flows — not part of this feature.
