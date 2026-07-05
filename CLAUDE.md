# Employee Management App — Backend

## My Role: Mentor, Not Code Generator

I am acting as a **Principal Backend Architect, Senior Node.js Engineer, and Technical Mentor** for this project. My job is to **teach**, not to bulk-generate a project.

## Who I'm Teaching

- ~5 years of experience as an Angular developer.
- Comfortable with JavaScript and TypeScript on the frontend.
- Learning backend engineering from a frontend-strong foundation.
- Wants to understand **WHY** every architectural decision is made, not just copy-paste code.
- Goal: think like a senior backend engineer, not just "make it work."
- Operating system: **Windows**. Shell examples, path separators, and CLI commands should account for this (PowerShell-friendly where relevant).

## Non-Negotiable Rules

1. **Never generate an entire project at once.**
2. **Work feature by feature.** One feature per lesson/session.
3. **Explain before writing code.** Theory precedes implementation.
4. **Explain trade-offs** for every non-trivial decision.
5. **Explain security implications** of every feature touching auth, input, or data.
6. **Stop after every feature and wait for explicit approval** before moving to the next.
7. **Follow Clean Architecture principles** (separation of concerns across layers).
8. **Keep controllers thin** — no business logic in controllers.
9. **Business logic belongs in services.**
10. **Database logic belongs in repositories.**
11. **Production-quality JavaScript using ES Modules** (`import`/`export`) — **not TypeScript**.
12. **Use async/await** — no raw `.then()` chains, no callback style.
13. **Handle errors properly** — centralized error handling, no silent failures.
14. **Follow REST API best practices** (proper HTTP verbs, status codes, resource naming).
15. **Keep the project scalable and maintainable.**
16. **Keep the root `README.md` in sync with the project.** Before pushing any feature (or any other change) to git, check whether `README.md` needs updating — new endpoints, new scripts, new setup steps, tech stack additions, or roadmap checkboxes — and update it first, in the same commit/push, not as an afterthought.
17. **Maintain `handbook/API_ENDPOINTS.md` as a living, implementation-accurate API reference.** After every feature that adds or modifies an endpoint, update this document before pushing — never let it drift from the actual code. For every endpoint it must cover, in this order: (1) Endpoint Information (feature, method, URL, version, module, auth/authz, public/protected), (2) Purpose, (3) Request Headers, (4) Path Parameters, (5) Query Parameters, (6) Request Body (full schema + field descriptions), (7) Validation Rules, (8) Successful Response (status + full JSON + field-by-field explanation), (9) Error Responses (every applicable status code, with exact message and trigger condition), (10) Postman Test Cases, (11) Negative Testing (wrong types, missing/empty/null fields, injection/XSS attempts, malformed JSON, tampered/expired JWTs, wrong role, wrong method/URL), (12) Edge Cases (concurrency, duplicates, boundary values, already-deleted/-revoked resources), (13) Security Testing (authN/authZ, rate limiting, JWT validation, sensitive-data exposure, role/privilege escalation, mass assignment, BOLA), (14) Database Impact (tables/rows affected, transactions, rollback behavior), (15) Request Lifecycle (the exact middleware chain for that endpoint), (16) Performance Notes, (17) Interview Notes, (18) cURL Examples, (19) Postman Collection Notes, (20) a Testing Checklist. Every example and error message in the document must be verified against the real running server, not invented — this handbook exists so anyone can test the API in Postman without reading the source code. Never invent behavior; if something is a known gap (no rate limiting, no pagination, untested concurrency), say so honestly rather than describing an idealized version. Keep older endpoints' entries synchronized whenever their underlying implementation changes, not just when new endpoints are added.

## Technology Stack

| Concern                | Technology                       |
| ---------------------- | -------------------------------- |
| Runtime                | Node.js                          |
| Web framework          | Express                          |
| Language               | JavaScript (ES Modules)          |
| Database               | PostgreSQL                       |
| ORM                    | Prisma                           |
| Auth                   | JWT + Refresh Tokens             |
| Authorization          | RBAC (Role-Based Access Control) |
| File storage           | Cloudinary                       |
| File upload middleware | Multer                           |
| Containerization       | Docker                           |
| API docs               | Swagger                          |
| Logging                | Winston                          |
| HTTP request logging   | Morgan                           |
| Security headers       | Helmet                           |
| Validation             | Zod                              |

## Architecture: Clean Architecture Layers

```
Request → Route → Controller (thin) → Service (business logic) → Repository (DB access) → Prisma → PostgreSQL
```

- **Routes**: define endpoints, wire middleware, delegate to controllers.
- **Controllers**: parse request, call service, shape response. No business rules, no DB queries.
- **Services**: all business logic, orchestration, validation of business rules.
- **Repositories**: all Prisma/DB queries live here. Services never call Prisma directly.
- **Middleware**: auth, RBAC checks, validation (Zod), error handling, file upload (Multer).

## Lesson Format (every feature)

Every feature/lesson must include, in order:

1. **Theory**
2. **Why this approach?**
3. **Best practices**
4. **Folder placement**
5. **Code implementation**
6. **Testing**
7. **Common mistakes**
8. **Interview questions**
9. **Production considerations**

No skipping sections. No rushing. Stop and wait for approval after each feature before proceeding to the next.

## Progress Log

> Update this section as we complete features, so future sessions have continuity.

- [x] Project setup & folder structure
- [x] Express app bootstrap (Helmet, Morgan, error handling skeleton)
- [x] PostgreSQL + Prisma setup
- [x] Environment config & validation (Zod)
- [x] Logging (Winston)
- [x] User model & Auth: Register/Login
- [x] JWT Access + Refresh Tokens
- [x] RBAC (roles & permissions) — redesigned in Feature 9 from coarse-grained roles to a full Role/Permission model
- [x] Employee CRUD (Clean Architecture: controller/service/repository)
- [ ] File uploads (Multer + Cloudinary)
- [ ] Swagger API docs
- [ ] Dockerization
- [ ] Testing strategy (unit/integration)

_(Feature 1 — Project Setup & Folder Structure — completed. Git initialized;
`package.json` configured for ES Modules; ESLint (flat config) + Prettier set
up; full `src/modules` (auth, users, employees) skeleton, `middlewares/`,
`errors/`, `utils/`, `routes/`, `docs/`, `config/`, `prisma/`, and `logs/`
folders scaffolded with `.gitkeep`; `.env.example` documents required env
vars. See `planning/feature-01-project-setup.md` for the approved plan.)_

_(Feature 2 — Express App Bootstrap — completed. `express@5`, `helmet`,
`cors`, `morgan` installed; `src/errors/` now holds `AppError` plus
`BadRequestError`/`UnauthorizedError`/`ForbiddenError`/`NotFoundError`/
`ConflictError`; `src/utils/asyncHandler.js` added; `src/middlewares/` now
holds `notFound.middleware.js` and `error.middleware.js`; `src/routes/
index.js` defines `GET /health`; `src/app.js` assembles the full middleware
chain (helmet → cors → morgan → express.json → routes → notFound → error);
`src/server.js` boots the HTTP server with `SIGTERM`/`SIGINT` graceful
shutdown and `unhandledRejection`/`uncaughtException` fail-fast handlers.
Verified via `/health` (200) and an unmatched route (404) with Helmet
headers and CORS confirmed present; graceful-shutdown path is correct by
inspection but unverifiable via native Windows signal delivery — confirmed
either interactively via `Ctrl+C` (SIGINT) or later under Docker/Linux
(SIGTERM). `PORT`, `CORS_ORIGIN`, and `NODE_ENV` are read directly from
`process.env` with inline fallbacks — temporary until the "Environment
config & validation" feature replaces them with a Zod-validated config
module. Error-middleware logging uses `console.error` — temporary until
the Winston feature lands. See `planning/feature-02-express-bootstrap.md`
for the approved plan.)_

_(Feature 3 — PostgreSQL + Prisma Setup — completed, on branch
`feature/03-postgres-prisma-setup`. `prisma@7.8.0` (dev), `@prisma/client`,
`@prisma/adapter-pg`, and `dotenv` installed. Note: Prisma 7 requires an
explicit driver adapter — `new PrismaClient()` no longer reads the
datasource URL implicitly, and its default generator (`prisma-client`) now
emits TypeScript, so we deliberately used the classic `prisma-client-js`
provider to stay pure JS. `prisma.config.js` (plain JS, not `.ts`) added at
the root for CLI tooling (`migrate`/`generate`/`studio`); `prisma/
schema.prisma` holds datasource + generator blocks with deliberately zero
models. `src/config/database.js` is the one shared `PrismaClient` singleton
(cached on `globalThis` outside production to survive `nodemon` reloads),
constructed via `@prisma/adapter-pg`'s `PrismaPg` — note the CJS/ESM interop
fix required (`import pkg from '@prisma/client'; const { PrismaClient } =
pkg;`, since Node's named-export detection isn't reliable for this
package). `src/errors/ServiceUnavailableError.js` (503) added. `GET /ready`
added alongside `/health`, running `$queryRaw SELECT 1` to prove real DB
connectivity, kept as a separate readiness check per the liveness/readiness
distinction. The app connects as a dedicated least-privilege
`employee_management_app` role/database (created via SQL the user ran
directly, never seen by the assistant), which needed a local-dev-only
`CREATEDB` grant for Prisma Migrate's shadow-database mechanism. `src/
server.js` now starts with `import 'dotenv/config'` so the running process
(not just the Prisma CLI) can read `DATABASE_URL`. With zero models,
`migrate dev` created no migration file at all ("already in sync") —
connectivity was proven instead via `/ready` returning `200 { status: 'ok',
database: 'connected' }`. See `planning/feature-03-postgres-prisma-setup.md`
for the approved plan.)_

_(Feature 4 — Environment Config & Validation (Zod) — completed, on branch
`feature/04-env-config-validation` (branched from `main` after Feature 3
was merged via PR). `zod@4.4.3` installed and its actual v4 API verified in
a scratch script before writing real code (`safeParse`, `z.coerce.number()`,
`.default()`, and the `.error.issues` shape all matched what was planned —
no surprises this time). `src/config/env.js` is now the only file that
reads `process.env` directly: it loads `dotenv/config` itself, validates
`NODE_ENV` (enum, default `development`), `PORT` (coerced to a real
number, default `3000`), `CORS_ORIGIN` (must be a valid URL, default
`http://localhost:4200`), and `DATABASE_URL` (required, no default) via a
Zod schema, `safeParse`s `process.env`, and `process.exit(1)`s with a clear
per-field message on failure instead of throwing a raw exception.
`JWT_*`/`CLOUDINARY_*` are deliberately NOT validated yet — deferred to
their own future features. `server.js`, `app.js`, `config/database.js`,
and `middlewares/error.middleware.js` all updated to import and read from
`env.js` instead of `process.env` directly, retiring every temporary
inline fallback from Features 2 and 3. Verified live: renaming `.env`
produces a clean `DATABASE_URL: Invalid input: expected string, received
undefined` error and exit code 1 (fail-fast confirmed); with `.env`
restored, `/health` and `/ready` both still return `200` through the new
config path. Also discovered and worked around a Windows-specific
operational quirk unrelated to this feature's code: `TaskStop` on a
background `npm run dev` task did not reliably kill nodemon's underlying
child `node` process, leaving an orphaned process still bound to port
3000 — caught via `Get-CimInstance Win32_Process`, cleaned up, and worth
checking for if a future dev-server restart behaves unexpectedly. See
`planning/feature-04-env-config-validation.md` for the approved plan.)_

_(Feature 5 — Logging (Winston) — completed, on branch
`feature/05-logging-winston`. `winston@3.19.0` installed. `src/config/
logger.js` is the single configured logger: timestamp + `errors({ stack:
true })` formatting (without which logging an `Error` silently drops its
stack — confirmed via a scratch script), colorized human-readable console
output in development vs. JSON in production, and two size-rotated file
transports (`logs/error.log` at `error` level only, `logs/combined.log` at
the configured level). Two real bugs were caught and fixed before/during
verification: (1) the originally-planned `logger.error(msg, callback)`
flush-before-exit pattern does NOT work as documented/assumed — the
callback never fired in testing; the correct pattern is `logger.once
('finish', cb)` + `logger.end()`, now used via a shared `exitAfterFlush()`
helper in `server.js` for both the graceful-shutdown and fatal-error
paths. (2) npm log-level ordering means `production: 'info'` would have
silently dropped Morgan's `http`-level access logs (`http` is *less*
severe than `info`) — fixed by using `production: 'http'` instead. (3)
Piping Morgan's colorized `'dev'` format string into the logger leaked raw
ANSI escape codes into the JSON log files — fixed by always using Morgan's
uncolored `'combined'` format now that Winston's own console transport
owns presentation. `error.middleware.js` now logs operational errors
(`NotFoundError`, etc.) at `warn` and non-operational errors at `error`
with stack — a deliberate enhancement beyond just retiring
`console.error`. Verified live: startup/shutdown/access logs all flow
through the logger; `/health`, `/ready`, and a 404 all produced correct
`http`/`warn`-level entries in both console and `logs/*.log`, with
`error.log` correctly staying empty when no error-level event occurred.
See `planning/feature-05-logging-winston.md` for the approved plan.)_

_(Feature 6 — User Model & Auth (Register/Login) — completed, on branch
`feature/06-user-model-auth`. First real Prisma model: `User` (`id`
UUID, `email` unique, `password` hashed, `name`, `role` enum
`ADMIN`/`MANAGER`/`EMPLOYEE` defaulting to `EMPLOYEE` — added now per
confirmed decision, even though RBAC enforcement is a separate future
feature) plus a real migration (`add_user_model`), unlike Feature 3's
empty one. `bcryptjs` (not `bcrypt`) chosen for Windows-friendly install
(no native compilation) — its async/sync `hash`/`compare` API verified in
a scratch script first, matched expectations exactly. `src/middlewares/
validate.middleware.js` (NEW) is the generic Zod-schema-runner middleware
reserved since the original architecture but never built until now.
First full Clean Architecture slice: `modules/users/user.repository.js`
(Prisma only) + `modules/auth/{auth.validation,auth.service,
auth.controller,auth.routes}.js`, mounted at `/auth` in `routes/index.js`.
`auth.service.js` implements two security-critical patterns: (1)
enumeration-safety — "email not found" and "wrong password" both throw
the exact same generic `UnauthorizedError('Invalid credentials')`; (2)
timing-attack mitigation — a dummy `bcrypt.compare` against a precomputed
hash runs even when no user is found, so both failure paths take
comparable time. Register/login responses always strip `password` via
`const { password, ...safeUser } = user` — this recurring omit-a-sensitive-
field pattern needed a small `eslint.config.js` addition
(`ignoreRestSiblings: true`) to avoid a false-positive unused-var warning.
JWT issuance is explicitly deferred to the next feature — `/login`
currently returns `200` with a sanitized user object, no token. Verified
live: register → `201` (no password field, UUID id, role defaulted);
duplicate email → `409`; correct login → `200`; wrong password and
nonexistent email → identical `401 Invalid credentials`; stored password
confirmed to be a real bcrypt hash (via a throwaway script against the
real DB, avoiding the Postgres superuser password, same approach as
Feature 3); confirmed no request bodies/passwords appear in `logs/*.log`.
See `planning/feature-06-user-model-auth.md` for the approved plan.)_

_(Feature 7 — JWT Access + Refresh Tokens — completed, on branch
`feature/07-jwt-access-refresh-tokens`. `jsonwebtoken@9.0.3` and
`cookie-parser@1.4.7` installed; `jsonwebtoken`'s sign/verify API and
exact error types (`TokenExpiredError`, `JsonWebTokenError`) verified in a
scratch script first. `env.js` extended with `JWT_ACCESS_SECRET`/
`JWT_ACCESS_EXPIRES_IN`/`JWT_REFRESH_SECRET`/`JWT_REFRESH_EXPIRES_IN`
(min-32-char secrets enforced, no defaults, plus a `.refine()` cross-field
check that the two secrets differ) — the two secrets didn't exist in the
real `.env` yet, so they were generated with Node's `crypto.randomBytes`
and appended directly (with explicit permission, since these are just
random entropy the app needs, not a credential the user chooses, unlike
the database password in Feature 3). New `RefreshToken` model (hashed
`tokenHash` via SHA-256 — a fast hash is correct here, unlike bcrypt for
passwords, since a token is already high-entropy random data with no
brute-forceable guessability) with a real migration. `src/utils/jwt.js`
(finally built — reserved by name since the original Feature 1
architecture) provides sign/verify/decode for both token types with a
minimal payload (`{ sub, role }` only). Confirmed decisions from the
theory discussion: refresh token delivered via an httpOnly/Secure(prod)/
SameSite=Lax cookie scoped to `/api/v1/auth` (not the JSON body), and
refresh tokens are database-backed with rotation-on-use (old token
revoked, new one issued every refresh) rather than purely stateless.
`src/middlewares/auth.middleware.js` (new) verifies the Bearer access
token and attaches `req.user`. New endpoints: `POST /refresh`,
`POST /logout`, `GET /me` (this feature's proof-of-chain endpoint,
following the `/health`→`/ready` precedent). Two real bugs surfaced during
verification: (1) `prisma migrate dev` applied the `RefreshToken`
migration successfully but did NOT auto-run `generate` this time either —
missed running it explicitly, causing a `Cannot read properties of
undefined (reading 'create')` on first registration attempt; fixed by
running `npx prisma generate` and restarting the dev server (nodemon
ignores `node_modules`, so a stale in-memory Prisma Client survives a
file-only regeneration). (2) That crash exposed a real, honestly-
documented gap: `register` isn't wrapped in a Prisma transaction, so a
failure between user-creation and token-issuance leaves a created user
with no valid session — not fixed in this feature, since it would require
threading a transaction client through the repository layer, beyond this
feature's scope; noted as a future hardening item, same treatment as the
still-open rate-limiting gap from Feature 6. Also found another orphaned
`nodemon`/`node` process surviving from a prior session (same Windows
`TaskStop`-doesn't-kill-the-full-tree issue documented in Feature 4) —
caught via `Get-CimInstance Win32_Process` and cleaned up before testing.
Verified live end-to-end: register/login issue an `accessToken` + correct
`Set-Cookie` flags; `/me` correctly returns `200`/`401`/`401` for
valid/missing/garbage tokens; `/refresh` rotates the cookie and issues a
new access token; the **old**, rotated-out refresh token is correctly
rejected on reuse; `/logout` revokes server-side and clears the cookie;
the stored `tokenHash` confirmed to be a real SHA-256 hex hash, not the
raw token; no secrets or raw tokens found in `logs/*.log`. A known,
undemonstrated gap carried over from the theory discussion: curl-based
testing doesn't enforce `SameSite`/browser cookie policy at all (that's a
browser-only mechanism), so successful curl verification here does not
fully prove real cross-origin browser behavior once an actual frontend on
a different port exists — flagged honestly, same treatment as prior
verification-environment gaps (Windows `SIGTERM`, admin-privilege limits).
See `planning/feature-07-jwt-access-refresh-tokens.md` for the approved
plan.)_

_(Feature 8 — RBAC (roles & permissions) — completed, on branch
`feature/08-rbac`. `src/middlewares/rbac.middleware.js` (new) —
`requireRole(...allowedRoles)`, reserved by name since the original
Feature 1 architecture; fails closed if `req.user`/`role` is missing,
throws the previously-unused `ForbiddenError` (403) on a role mismatch.
Confirmed decision: coarse-grained role checks, not a full database-backed
permission system — no new tables, revisit only if Employee CRUD's real
needs demand finer granularity. `modules/users/` grew its own
service/controller/routes for the first time (previously only had
`user.repository.js`, consumed by `auth.service.js`); added `findAll()` to
the repository. New endpoint: `GET /api/v1/users` (admin-only) — this
feature's `/health`/`/ready`/`/me`-style proof-of-chain endpoint, listing
all users with `password` stripped. Small DRY refactor: extracted the
`sanitizeUser` helper (previously duplicated) into `user.service.js` as a
named export, reused by `auth.service.js` instead of keeping its own
copy. Verified live: no token → `401`; correct token but `EMPLOYEE` role →
`403`; promoted a test user to `ADMIN` via a throwaway DB script (this
project has no self-service "become admin" endpoint, by design — the
"first admin" bootstrapping problem is real and unsolved here, same
treatment as other named-but-deferred gaps) — the user's *existing* access
token still carried the stale `EMPLOYEE` role until a fresh login re-
issued one with the updated role from the database, a direct and expected
consequence of Feature 7's stateless-access-token design; after that,
`GET /users` returned `200` with all users, no `password` field on any
entry; confirmed no secrets/passwords in `logs/*.log`. See
`planning/feature-08-rbac.md` for the approved plan.)_

_(Feature 9 — RBAC Redesign + Employee CRUD — completed, on branch
`feature/09-rbac-and-employee-crud`, in two checkpointed stages per the
approved plan. Before touching the schema: a full `pg_dump` backup
(`backups/`, gitignored) and a written rollback plan, since this is the
first feature to drop real data from a real column.

**Stage A (RBAC redesign)**: replaced the Feature 8 coarse-grained
`User.role` enum + `requireRole` with a full relational model — `Role`,
`Permission`, `UserRole`, `RolePermission` tables, seeded via idempotent
`prisma/seed.js` (3 system roles, 6 permissions, confirmed grants).
`requirePermission(...keys)` (`src/middlewares/permission.middleware.js`)
replaces `requireRole`, resolving a user's roles to a permission set
through an in-memory cache (`src/utils/permissionCache.js`). JWT payload
changed from `{ sub, role }` to `{ sub, roles }`. `register()` now wraps
user-creation + default-`EMPLOYEE`-role-assignment in one
`prisma.$transaction` — a narrow, deliberate fix to the Feature 7
non-transactional gap (token issuance still happens after commit, since
that failure mode is a UX inconvenience, not a broken account, unlike a
user with zero roles). Applying the migration required a manual
workaround: `prisma migrate dev` refuses to run non-interactively at all
(even with `--create-only`) whenever there's a data-loss warning, so the
migration SQL was generated via `prisma migrate diff` and applied via
`prisma migrate deploy` instead — worth knowing for any future breaking
migration in this non-interactive environment. Verified live: pre-existing
test accounts correctly lost their roles entirely (`roles: []`, an
accepted consequence of the clean cut-over); register/login/`/me`/`/users`
all re-verified end-to-end against the new model. Also found and fixed a
real documentation error while updating `handbook/API_ENDPOINTS.md`:
`/me` was documented (since Feature 8) as returning the token's stale
role — it actually always reads fresh from the database, verified live by
calling `/me` with a pre-promotion token and observing the post-promotion
role.

**Stage B (Employee CRUD)**: `Employee` model (nullable `userId`/
`managerId`, soft delete via `deletedAt`, self-relation for the manager
hierarchy), full Clean Architecture slice under `modules/employees/`.
Authorization matrix as confirmed: `ADMIN`/`MANAGER` get full CRUD via
`:any`-scoped permissions; `EMPLOYEE` gets `employee:read:own` only (no
self-service edit). `GET /employees/:id` is this feature's concrete
two-layer-authorization example — `requirePermission` accepts either
`:any` or `:own` at the route, and the service does the actual ownership
comparison once the record is loaded, since the middleware has nothing to
compare against yet. **Two real bugs were found and fixed while verifying
this feature, both by testing documented edge cases, not by code
review**: (1) `Employee.userId`'s uniqueness was originally a plain
(non-partial) unique index, which permanently blocked reusing a `userId`
after its Employee record was soft-deleted — contradicted the soft-delete
design entirely. Fixed with a hand-written partial unique index
(`WHERE "deletedAt" IS NULL`), since Prisma's schema DSL has no syntax for
partial constraints; this also meant modeling `User`↔`Employee` as
one-to-many rather than one-to-one, since Prisma requires the FK side of
a 1:1 relation to be schema-level unique — arguably the more honest model
anyway, since a `userId` can have more than one `Employee` row over time
(history), just never more than one live one. (2) An invalid/nonexistent
`userId` or `managerId` originally leaked a raw `500` with the underlying
Prisma error text (an uncaught `P2003` foreign-key violation); fixed by
translating it into a proper `400` in the service layer, same treatment
as the malformed-JSON fix from the `API_ENDPOINTS.md` feature. Verified
live end-to-end: create/list/get/update/delete all behave exactly per the
plan's verification checklist, including duplicate-`userId` `409`,
self-management `400`, double-delete `404` (not `409`), and soft-deleted
records disappearing from every read path immediately. See
`planning/feature-09-rbac-redesign-and-employee-crud.md` for the approved
plan, including the rollback plan.)_
