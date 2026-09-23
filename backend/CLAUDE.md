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
17. **Maintain `../handbook/API_ENDPOINTS.md` as a living, implementation-accurate API reference.** (The `handbook/` directory lives at the repository root, shared with the frontend — see the root `README.md`.) After every feature that adds or modifies an endpoint, update this document before pushing — never let it drift from the actual code. For every endpoint it must cover, in this order: (1) Endpoint Information (feature, method, URL, version, module, auth/authz, public/protected), (2) Purpose, (3) Request Headers, (4) Path Parameters, (5) Query Parameters, (6) Request Body (full schema + field descriptions), (7) Validation Rules, (8) Successful Response (status + full JSON + field-by-field explanation), (9) Error Responses (every applicable status code, with exact message and trigger condition), (10) Postman Test Cases, (11) Negative Testing (wrong types, missing/empty/null fields, injection/XSS attempts, malformed JSON, tampered/expired JWTs, wrong role, wrong method/URL), (12) Edge Cases (concurrency, duplicates, boundary values, already-deleted/-revoked resources), (13) Security Testing (authN/authZ, rate limiting, JWT validation, sensitive-data exposure, role/privilege escalation, mass assignment, BOLA), (14) Database Impact (tables/rows affected, transactions, rollback behavior), (15) Request Lifecycle (the exact middleware chain for that endpoint), (16) Performance Notes, (17) Interview Notes, (18) cURL Examples, (19) Postman Collection Notes, (20) a Testing Checklist. Every example and error message in the document must be verified against the real running server, not invented — this handbook exists so anyone can test the API in Postman without reading the source code. Never invent behavior; if something is a known gap (no rate limiting, no pagination, untested concurrency), say so honestly rather than describing an idealized version. Keep older endpoints' entries synchronized whenever their underlying implementation changes, not just when new endpoints are added.

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
- [x] Employee search, pagination, filtering, sorting
- [x] Audit logs
- [x] File uploads (Multer + Cloudinary)
- [x] Swagger API docs
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

_(Feature 10 — Employee Search, Pagination, Filtering, Sorting —
completed, on branch
`feature/10-employee-search-pagination-filtering-sorting`. Only
`GET /employees` changed — no new endpoints, no new permissions, still
gated by `employee:read:any`. Confirmed decision: `search` matches both
`Employee`'s own fields (`department`, `jobTitle`) and the linked
`User`'s `name`/`email` via a Prisma relation filter, not just Employee's
own columns — otherwise "find this person" wouldn't work for anyone
whose HR record is linked to a login account. `src/middlewares/
validate.middleware.js` generalized to `validateMiddleware(schema,
target = 'body')` — the first query-parameter validation in this API. A
real finding changed its design: `req.query = {...}` **throws** under
Express 5 in this project's strict-mode ES modules (`req.query` is a
getter-only accessor, confirmed by direct test), so validated query
results land on a new `req.validatedQuery` property instead of
overwriting `req.query`. `employee.repository.js` gained a paired
`count()` alongside `findAll()`, run via `Promise.all` (not a
`$transaction`) — a deliberate, documented trade-off for an HR
application, not an oversight. Every query gets an unconditional
secondary `ORDER BY id ASC` after whatever `sortBy`/`order` was
requested, for deterministic ordering when rows tie on the primary sort
column. `sortBy` is whitelisted to five known columns; `limit` is capped
at 100, both enforced by Zod, never passed through to Prisma unvalidated.
Verified live: pagination math, empty-`search=`-equals-no-search,
case-insensitive exact filters, search matching via the `User` join,
sort-order reversal, and repeat-call ordering stability all confirmed
against the real running server. See
`planning/feature-10-employee-search-pagination-filtering-sorting.md`
for the approved plan.)_

_(Feature 11 — Audit Logs — completed, on branch `feature/11-audit-logs`.
Scope confirmed narrower than the original design sketch: `Employee`
mutations only (`create`/`update`/soft-`delete`), write-only (no
`GET /audit-logs` endpoint) — both explicitly confirmed decisions, not
defaults. New `AuditLog` model (`actorId` nullable FK → `User.id`,
`ON DELETE SET NULL` so audit history survives even a removed actor;
`action`/`entityType`/`entityId`/`beforeData`/`afterData`/`ipAddress`;
indexed on `[entityType, entityId]` and `[actorId, createdAt]`). New
`src/modules/audit/` (`auditLog.constants.js` — `AUDIT_ACTIONS`/
`AUDIT_ENTITY_TYPES` as frozen objects, not magic strings, per your
suggestion; `auditLog.repository.js` — Prisma-only, same optional-
transaction-client pattern as `rbac.repository.js`). `employee.repository.js`'s
`create`/`update`/`softDelete` gained an optional `client = prisma`
parameter; `employee.service.js`'s three mutating functions now take an
`actor: { id, ipAddress }` and wrap their mutation + one audit-log write
in a single `prisma.$transaction` — a mutation can never succeed without
a matching audit entry, or vice versa. A real, verified-before-relying-on-
it finding shaped the implementation: a raw Prisma `Employee` record
contains a `Decimal` (`salary`) and `Date` instances, neither safe to
pass directly into a `Json` column — confirmed live, fixed with a small
`normalizeForAudit()` helper (`JSON.parse(JSON.stringify(record))`),
producing the same plain shape the API's own JSON responses already
render. Verified live end-to-end: create → one `AuditLog` row
(`beforeData: null`, `afterData` the new record); update → a second row
(`beforeData`/`afterData` correctly reflecting the pre/post state);
soft-delete → a third row (`beforeData` populated, `afterData: null`);
forcing a `409` (duplicate `userId`), a `400` (self-management), and a
`400` (invalid FK) all produced **zero** new `AuditLog` rows — confirming
the transaction rolls back correctly on failure. `actorId`'s `SET NULL`
survival was verified by schema/constraint inspection rather than a live
request, honestly noted as such (no user hard-delete path exists to
trigger it for real). See `planning/feature-11-audit-logs.md` for the
approved plan.)_

_(Feature 12 — File Uploads (Multer + Cloudinary) — completed, on branch
`feature/12-file-uploads`. Two upload surfaces, combined into one
feature per your explicit call: `User` profile pictures (two new nullable
columns, `profileImageUrl`/`profileImagePublicId` — self-service, no
permission check, always operates on the caller's own record) and a new
`EmployeeDocument` table (real FK to `Employee.id`, HR/manager-controlled
via the existing `employee:update:any`/`employee:read:any`/`:own`
permissions — no new permission keys). A dedicated pre-implementation
design review (12 dimensions: Cloudinary failure recovery, replacement
ordering, delete ordering, folder structure, public-id strategy, file
naming, security, performance, error handling, transactions, verification
plan, documentation) caught and fixed two real operation-ordering bugs
*before* any code was written: profile-picture replace/delete and
document delete all originally sequenced "Cloudinary first, DB second" —
reversed to "DB commit first, Cloudinary cleanup after, best-effort" so
any failure produces a harmless orphan, never a dangling reference. Also
adopted, per that review: a **fixed, deterministic** Cloudinary
`public_id` + `overwrite`/`invalidate` for the single-slot profile
picture (removing the separate old-asset-delete step for that flow
entirely), and a fresh server-generated UUID per document (never derived
from the original filename, closing off path traversal on the Cloudinary
side). `multer`/`cloudinary` APIs verified in scratch scripts before real
code, per the established habit — confirmed live that `fileFilter` can
reject with our own `BadRequestError` directly (skipping Multer's generic
`LIMIT_UNEXPECTED_FILE`), that Multer does **not** reject a request with
no file field on its own (needed an explicit check), and that
`cloudinary.uploader.upload_stream` uses a standard error-first callback.
`env.js` now validates `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/
`CLOUDINARY_API_SECRET` (closing a gap deferred since Feature 4).
Audit logging (Feature 11) extended to `User` (profile-picture events
only — not register/login/role-assignment) and the new
`EmployeeDocument` entity type — with one critical safety rule found
during the theory discussion itself, before any code existed: `User` has
a `password` field `Employee` never had, so every `User`-entity audit
snapshot goes through the existing `sanitizeUser()`, never a raw record
dump, verified live across every profile-picture replacement with zero
password leakage. **Two further real bugs were found live during this
feature's own verification, not by code review**: (1)
`cloudinary.uploader.destroy()` defaults to `resource_type: "image"` and
**silently no-ops** (`{result: "not found"}`, not a thrown error) for any
other type — a PDF document (Cloudinary's own classification: `"raw"`)
appeared to delete successfully but the asset was still live, caught by
actually re-fetching its URL after "deletion" rather than trusting the
absence of a thrown error. Fixed by storing Cloudinary's own
`resourceType` on the `EmployeeDocument` row at upload time and passing
it explicitly to every `destroy()` call — required a small additional
migration (table was empty, so no backfill needed) and a real code fix,
not just documentation. (2) Even after that fix, a re-fetch of a
just-deleted asset's URL still returned `200` — the origin copy was
genuinely gone (confirmed via Cloudinary's own Admin API), but the CDN
kept serving a stale cached copy; fixed by adding `invalidate: true` to
every `destroy()` call, not just uploads. Verified live end-to-end: real
Cloudinary uploads/deletes/replacements (not mocked), profile picture
replaced 3× with exactly one asset at the fixed path throughout, document
upload/list/delete across `ADMIN`/`MANAGER`/owning-`EMPLOYEE`/different-
`EMPLOYEE` (BOLA confirmed), all negative cases (missing file, bad MIME,
oversized, unauthenticated, wrong permission, nonexistent employee/
document), and — after both fixes — real Cloudinary-side deletion
confirmed via direct CDN fetch and the Admin API, not just a non-error
API response. See `planning/feature-12-file-uploads.md` for the approved
plan, including the full pre-implementation design review.)_

_(Feature 13 — Swagger / OpenAPI Docs — completed, on branch
`feature/13-swagger-api-docs`. `@asteasolutions/zod-to-openapi@8.5.0` and
`swagger-ui-express@5.0.1` installed — both compatibility-checked against
the live npm registry before installing (`zod-to-openapi@8` requires
`zod: ^4.0.0`, matching this project's `zod@4.4.3`; `swagger-ui-express@5`
supports Express 5). Confirmed decision: request schemas are generated
directly from the **existing Zod validation schemas** via a light,
non-invasive `.meta({ id, description, example })` annotation on the same
schema objects (verified in a scratch script first, per the established
habit) — the validation schema stays the single source of truth, never a
hand-written duplicate. Response schemas have no Zod counterpart in this
API (no output-validation library exists), so `src/docs/components/
schemas.js` hand-mirrors the real Prisma models — two easy-to-miss fields
were caught and pinned during the pre-implementation review before any
schema code was written: `Employee.salary` documents as a **string**
(Prisma `Decimal` serializes to a JSON string, not a number — the same
fact `normalizeForAudit()` from Feature 11 was built around) and
`UserPublicSchema` includes `roles` (attached by `sanitizeUser()`, not a
raw Prisma column). Went through the same review rhythm as Feature 12: a
full pre-implementation design review across 10 dimensions (architecture,
Zod integration, response docs, auth, organization, environment/security,
DX, doc synchronization, scalability, verification plan), producing a
4-item checklist (explicit `*.docs.js` import ordering, the two pinned
field types above, cross-checking each path's `security` against its real
`*.routes.js` middleware chain rather than authoring from memory, and a
second verification case for the **query**-validated branch of
`validateMiddleware`, not just the body-validated one) — folded into
`planning/feature-13-swagger-api-docs.md` before implementation began.

New `src/docs/` (registry, generator, security schemes `bearerAuth`/
`cookieAuth`, reusable `ErrorResponseSchema`/response-builders, hand-
written response schemas) plus one `<module>.docs.js` file per module
(`auth`, `users`, `employees`, `employeeDocument`) registering that
module's paths — mirrors the existing feature-first `src/modules/`
organization, so a future module adds one file, not a change to the
shared docs machinery. `env.js` gained `ENABLE_SWAGGER`, off by default in
every environment; when disabled, `/api-docs`/`/api-docs.json` don't exist
at all and 404 exactly like any other unmapped route.

**Two real bugs were found live during this feature's own verification,
not by code review or the design review** (the same honest-disclosure
treatment as every prior feature's live-testing findings): (1)
`z.coerce.boolean()` — the originally-planned implementation for
`ENABLE_SWAGGER` — is a genuine footgun for environment variables: it
calls JavaScript's `Boolean()` constructor internally, which treats **any
non-empty string, including the literal `"false"`, as `true`**. Setting
`ENABLE_SWAGGER=false` was silently still enabling Swagger UI until this
was caught by actually testing that exact case rather than trusting the
schema; fixed with an explicit `z.string().optional().default('false')
.transform((val) => val.toLowerCase() === 'true')`, so only the literal
string `"true"` (case-insensitive) is ever treated as enabled. (2) Helmet's
default Content-Security-Policy — already applied globally since Feature
2 — blocks Swagger UI's inline `<script>`/`<style>` tags outright (a
well-documented Helmet/`swagger-ui-express` conflict); fixed by relaxing
CSP only for requests under `/api-docs`, and only when `ENABLE_SWAGGER` is
actually true, leaving every other route's CSP header completely
untouched — confirmed live by diffing response headers on `/api-docs` vs.
`/health` in the same running server. Verified live end-to-end:
`ENABLE_SWAGGER=false` (and fully unset) both correctly 404 `/api-docs`
with the exact same shape/stack-trace pattern as any other unmapped
route; with it enabled, `/api-docs.json` produces a valid OpenAPI 3.0
document (13 paths, all 9 named schema components, both security
schemes); a real body-validation failure (`POST /auth/register`) and a
real query-validation failure (`GET /employees?limit=999`, exercising the
Express-5-specific `req.validatedQuery` branch from Feature 10) both
produced the exact `{status:'error', message}` shape documented; a fresh
test account promoted to `ADMIN` via a throwaway DB script (same
established pattern as Features 8/9) proved the Authorize-flow
equivalent (login → Bearer token → previously-`401` `/auth/me` now
succeeds) and the permission-gated `403` path, both against the real
running server. Honestly noted: this environment has no browser-
automation tool available, so the Swagger UI's Authorize button itself
was verified via the equivalent direct HTTP calls it performs, not by
driving an actual browser — the same class of verification-environment
gap already disclosed for Windows `SIGTERM` delivery and browser-only
`SameSite` cookie enforcement in earlier features. See
`planning/feature-13-swagger-api-docs.md` for the approved plan,
including the pre-implementation design review and checklist.)_

_(Repository Restructuring — Monorepo Layout — 2026-07-22. Not a numbered
backend feature; a one-time, repo-wide structural change ahead of
starting the Angular frontend. Everything that previously lived at the
repo root (`src/`, `prisma/`, `package.json`, `CLAUDE.md`, `README.md`,
`.env`, `planning/`, etc.) moved down one level into `backend/`, in-place
— same git repo, same GitHub remote
(`github.com/letusDeliver/employee-management-backend`), same commit
history, no new repo created. `handbook/` moved up to the repository
root, now shared between backend and frontend feature write-ups; a new
top-level `docs/` was created (reserved for architecture diagrams,
screenshots, ADRs, and deployment notes — developer guides stay in
`handbook/`). `planning/` stayed inside `backend/` (backend-specific
per-feature plans; frontend will get its own `frontend/planning/` the
same way once frontend feature work starts). A new root-level
`README.md` now indexes `backend/README.md`, `frontend/README.md`
(pending), and `handbook/`. This file's own Rule 17 and this repo's
`README.md` had their `handbook/...` references corrected to
`../handbook/...` to match the new location — `planning/...` references
were left untouched since that folder didn't move. A real, Windows-
specific blocker surfaced during the move itself: `mv` failed with
`Permission denied` on `prisma/` and `src/` because a leftover
`npm run dev` → `nodemon` parent/child process pair (from the session's
background dev server) still held file handles open inside those
folders — the same class of orphaned-process issue first documented in
Feature 4, just triggered by a directory move instead of a port
conflict this time; found via `Get-CimInstance Win32_Process` (command
line inspection, not just process name) and resolved by force-killing
both PIDs before retrying. Verified live after the move: `npm run dev`
from inside `backend/` boots cleanly (`.env`, `node_modules`, and
`prisma/` all resolve correctly relative to the new location), and
`/api/v1/health` / `/api/v1/ready` both still return `200`. No commits
were pushed to the remote as part of this restructuring — local commit
only, pending your go-ahead to push.)_

_(Permission Resolution Enhancement — 2026-07-22. Not a numbered
feature; a small, surgically-scoped RBAC enhancement, built specifically
because the approved `docs/frontend-architecture-blueprint.md` requires
it before any frontend auth code is written — the frontend must not
maintain its own copy of `prisma/seed.js`'s `ROLE_PERMISSIONS` map (a
duplication/drift risk the blueprint explicitly rejected). `POST
/auth/register`, `POST /auth/login`, and `GET /auth/me` now additionally
return `user.permissions: string[]` — the caller's role(s) resolved to
concrete permission keys via `permissionCache.getPermissionKeysForRoles`,
the **same** cache `permission.middleware.js`'s `requirePermission`
already uses server-side; this exposes existing resolution logic, it
does not add new logic. New `attachPermissions(sanitizedUser, roles)`
in `user.service.js`, deliberately **not** folded into `sanitizeUser()`
itself — `sanitizeUser()` is also used by `listUsers()` (`GET /users`)
and by the `AuditLog` before/after snapshots in the profile-picture
flows, neither of which should carry a resolved permission set.
`GET /users` and both `/users/me/profile-picture` endpoints are
therefore unchanged — still `roles`-only. The JWT payload itself is
unchanged (`{ sub, roles }`) — permissions travel only in the JSON
response body, refreshed on every register/login/`/auth/me` call, the
exact same "can go stale until the next login" trade-off already
accepted for `roles` since Feature 8. Swagger docs updated to match:
`src/docs/components/schemas.js` gained a new `AuthenticatedUserSchema`
(`UserPublicSchema` + `permissions`), used only by `auth.docs.js`'s
three affected paths — `UserPublicSchema` itself is untouched, so
`GET /users`'s Swagger schema doesn't lie about a field that endpoint
never returns. Verified live end-to-end: a fresh registration's
response includes `permissions: ["employee:read:own"]`; login and
`/auth/me` match; after promoting the same test user to `ADMIN` via the
established direct-DB-script pattern, `/auth/me` **with the same
pre-promotion access token** immediately showed the full ADMIN
permission set (since `getCurrentUser` re-resolves roles/permissions
from the database on every call, not from the token) while `GET /users`
with that same stale token still correctly `403`'d (since
`authMiddleware`/`requirePermission` still check the token's own frozen
`roles` claim) — a fresh login then produced a token whose `GET /users`
call succeeded (`200`); `/api-docs.json` regenerated cleanly with the
new `AuthenticatedUserSchema` correctly referenced by register/login/me
and correctly absent from `GET /users`'s schema. `handbook/
API_ENDPOINTS.md` updated for all three affected endpoints (response
JSON, field tables, and the document's own "last synchronized" header).
See `docs/frontend-architecture-blueprint.md` §19 for what this
unblocks next: `frontend/CLAUDE.md`'s `SessionStore` can now be written
against the real field from day one instead of a temporary assumption.)_

_(`PATCH /employees/:id` — allow explicit `null` to clear `userId`/
`managerId` — 2026-07-26. Not a numbered feature; a small, surgically-
scoped correction found while building the frontend's Employees edit
form (`frontend/CLAUDE.md`, Feature 6). `updateEmployeeSchema`
(`employee.validation.js`) is `createEmployeeSchema.partial()`, and
`createEmployeeSchema`'s `userId`/`managerId` are `.optional()` only —
no way to express "clear this link" over PATCH, since an omitted key
means "leave it as-is" and a JSON body can't send "the key that isn't
there." Fixed by widening just these two fields on the update schema
to `.nullable().optional()` (via `.extend()`, not touching
`createEmployeeSchema` itself, since creation has no existing link to
clear). No repository/service change was needed — `employee.repository.js`'s
`update()` already just spreads `data` into `prisma.employee.update()`,
and both columns are already nullable scalars in `schema.prisma`.
Verified live: linked a real `Employee` to a `User`, sent
`{"userId": null}`, confirmed both the response and a fresh `GET` show
`userId: null`; confirmed omitting the key instead (a normal partial
update touching only other fields) leaves the previous value untouched
— the two are not equivalent, which is the whole point. `handbook/
API_ENDPOINTS.md`'s `PATCH /employees/:id` entry updated (Request Body
and Edge Cases sections); Swagger regenerates correctly from the schema
change with no manual doc edit needed there.)_

_(Employee create/update — trim department/jobTitle, cap salary — 2026-07-26.
Not a numbered feature; two more small validation corrections found
during the same frontend edge-case hardening pass as the entry above
(`frontend/CLAUDE.md`, Feature 6 enhancement round). `createEmployeeSchema`'s
`department`/`jobTitle` gained `.trim()` before `.min(1, ...)` — a
whitespace-only value ("   ") previously passed validation (it has
length, just no meaningful content) and would have been stored as-is;
now rejected with the same "is required" message an empty string gets,
and any accepted value is stored trimmed (verified live: `"  Engineering  "`
saves as `"Engineering"`). `salary` gained `.max(100_000_000, 'Salary
seems unreasonably high')` — a sanity ceiling, not a real business
constraint, meant to catch garbled/mistyped input (an extra digit, a
misplaced decimal) rather than ever constrain a genuine salary; mirrored
on the frontend's own validator so this is caught inline before a
request even fires. Verified live: a whitespace-only `department` and a
salary of `999999999` both now `400` with the expected messages; a
`department` sent with leading/trailing spaces round-trips as the
trimmed value. `handbook/API_ENDPOINTS.md`'s `POST /employees` entry
updated (Request Body, Validation Rules, Error Responses sections) —
`PATCH /employees/:id` inherits both rules via `createEmployeeSchema.partial()`
with no separate doc changes needed there.)_

_(Multi-tab logout gap — access-token invalidation — 2026-07-26. Not a
numbered feature; a real security/functionality bug reported by the user
from live manual testing: log in, open a second tab (already
authenticated via the shared refresh cookie), log out in that second
tab, then go back to the first tab **without refreshing it** — it could
still successfully call `DELETE /employees/:id`. Only refreshing the
first tab afterward redirected to `/login`.

Root-caused by reading the actual auth code before writing anything (not
assumed): `authMiddleware` (`src/middlewares/auth.middleware.js`) verifies
an access token by signature + expiry only — fully stateless, no DB/
session check of any kind. `logout()` (`auth.service.js`) only ever
revoked the one `RefreshToken` row matching the cookie sent on that
specific request. Since the first tab's access token was issued at its
own earlier login and is a completely separate artifact from the second
tab's refresh-token cookie, revoking the second tab's refresh token had
zero effect on the first tab's still-valid, unexpired access token —
which stayed accepted for authenticated requests (including deletes)
until its own natural `JWT_ACCESS_EXPIRES_IN` (15m) expiry. Refreshing
the first tab was the first moment its session was ever actually
re-checked against the server (`authGuard`'s `restoreSession()`), which
is why *that* correctly failed and redirected to login — the reload, not
the delete, was what finally asked the server anything.

Presented three remediation options (shorten access-token lifetime only,
frontend-only cross-tab logout sync, or real server-side access-token
invalidation) with their trade-offs; the user chose server-side
invalidation as the only one that actually closes the gap rather than
narrowing or cosmetically hiding it.

**Fix**: `User` gained a nullable `tokensValidAfter` column (migration
`add_user_tokens_valid_after`) — stamped to `now()` inside
`auth.service.js`'s `logout()`, in the same `prisma.$transaction` as the
existing refresh-token revocation (mirrors Feature 11's mutation +
dependent-write transaction pattern — logout can never revoke the
refresh token without also stamping this, or the reverse).
`authMiddleware` now does one narrow, `select`-scoped lookup
(`userRepository.getTokensValidAfter`, deliberately not a full
`findById` — this runs on every authenticated request, so it should
never pull the password hash or any other column into memory just to
check one timestamp) and rejects any access token whose `iat` claim
predates that timestamp, replaced with the same generic "Invalid or
expired token" message the existing catch-all already used — no new
message that would reveal *why* a given request was rejected.
Deliberately not cached (the user picked the "add real invalidation"
option, not the caching layer mentioned as a future optimization in the
options presented) — a straightforward `WHERE id = $1` lookup, revisit
only if this measurably matters at real scale.

Also surfaced, but **not fixed** (out of scope of the reported bug, and a
rare edge case): if two token-issuing calls for the same user land
within the exact same wall-clock second (e.g. register immediately
followed by `/auth/refresh`), `issueTokenPair` can produce a **byte-
identical** refresh JWT (same `sub`/`roles` payload, same `iat`, same
`exp`, same HMAC secret ⇒ same signature), which collides with
`RefreshToken.tokenHash`'s unique constraint and surfaces as a raw `500`
instead of a handled error. Found only because the verification script
below happened to fire two calls that fast; worth a real fix later
(e.g. a low-entropy nonce/jti in the payload) but not implicated in the
reported multi-tab issue at all — noted here so it isn't lost, same
honest-disclosure treatment as every other known-but-deferred gap in
this log.

Verified live end-to-end (register = Tab A login; `/auth/refresh` reusing
the same cookie jar = Tab B bootstrapping its own access token, 1+
second apart to sidestep the collision above): before logout, both tabs'
tokens returned `200` on `/auth/me`; Tab B's `/auth/logout` succeeded;
Tab A's still-unexpired, pre-logout access token then correctly got
`401` on its very next request — both `GET /auth/me` and `GET /users`
confirmed, proving this isn't special-cased to one route but applies to
every route behind `authMiddleware`, `DELETE /employees/:id` included.
Re-verified logout's existing idempotency (calling it twice with an
already-revoked cookie still returns `200` both times) still holds.
`npm run lint` clean. One real environment snag hit and resolved during
verification, not the bug itself: the running dev server's in-memory
Prisma Client was stale relative to the new migration (an explicit
`npx prisma generate` was required — `migrate dev`'s own auto-generate
step apparently didn't take for this run), compounded by this project's
already-documented Windows orphaned-node-process quirk (a stale process
was still bound to port 3000 from an earlier `npm run dev`); both were
identified and killed via `Get-CimInstance`/`Get-NetTCPConnection` before
re-testing against a genuinely fresh process. `handbook/API_ENDPOINTS.md`'s
`POST /auth/logout` entry updated (Purpose, Database Impact, Request
Lifecycle, Testing Checklist sections).)_

_(Token-validity edge-case pass — deleted-user access tokens — 2026-07-26.
Not a numbered feature; a follow-up token-hardening request made
alongside a matching frontend pass (see `frontend/CLAUDE.md`'s entry of
the same date) to work through every "is this token actually still
valid?" edge case, not just the multi-tab-logout one above.

One real gap found by re-reading `authMiddleware` and
`userRepository.getTokensValidAfter` line by line rather than assuming
the previous fix was complete: `getTokensValidAfter` returned `null`
both when a user has no `tokensValidAfter` stamped *and* when the user
row doesn't exist at all — the two cases were indistinguishable, so a
still-unexpired access token for a since-deleted user sailed straight
through `authMiddleware` (no existence check anywhere in that path) and
reached the controller/service layer, which only happens to reject it
today because every current route ends up doing its own
`req.user.id`-keyed DB lookup somewhere downstream. That's incidental,
not a guarantee — any future route that trusts `req.user` without its
own re-lookup (e.g. a list endpoint scoped by role/permission only,
exactly like `GET /employees`) would have silently served a deleted
user real data.

**Fix**: `getTokensValidAfter` now returns `undefined` (not `null`) when
the user no longer exists, and `authMiddleware` rejects with the same
generic `"Invalid or expired token"` on `undefined` — no new message, no
information disclosure about *why*.

Verified live against a fresh dev server (the same orphaned-process
quirk from the entry above recurred — five more stale `nodemon`
processes plus the bare `node src/server.js` bound to port 3000 had
accumulated from earlier sessions; all killed via `Get-CimInstance`
before retesting): registered a throwaway user, promoted it to `ADMIN`
directly via Prisma (no promote endpoint exists), logged in for a fresh
token, confirmed `GET /employees` returned `200`, deleted the user row
directly, then replayed the *same still-unexpired* token against
`GET /employees` again — now a genuine `401` from `authMiddleware`
itself (confirmed via the stack trace), not a downstream 403/404 from
unrelated logic. `npm run lint` clean throughout.

Deliberately left out of scope, surfaced to the user rather than
silently fixed or silently skipped: refresh-token **reuse detection**.
Today, replaying an already-rotated (used) refresh token just gets the
same generic `401` `findValidByHash` already produces for any invalid
token — there's no reuse-specific alarm that revokes the rest of that
user's sessions, which is the standard mitigation against a stolen
refresh token being replayed after the legitimate rotation already
happened. No evidence this has ever fired in practice; flagged as a
real, known gap for a future pass, not treated as in-scope of "the
token stuff" the way the deleted-user gap was.)_

_(Users — Server-Side Pagination, Sorting, Search, Role Filtering —
2026-07-26, on branch `feature/14-users-pagination-sorting-filtering`
(merged to `main`). Not a numbered feature; brings `GET /users` up to
the same maturity `GET /employees` reached in Feature 10 — this endpoint
had been a bare, unpaginated `findMany()` since Feature 9, a known,
named gap explicitly called out in `handbook/API_ENDPOINTS.md` at the
time ("no pagination — fine at current scale"). Full Theory →
Architecture → Action Plan discussion held with the user first,
including an explicit fork decision on the one real cross-cutting risk
this change introduces: the frontend's `UserDirectoryService` calls this
same endpoint bare (no params) expecting *every* user back, for its
name-resolution cache. Always-paginating `GET /users` would have
silently truncated that cache to 10 users. Presented three options
(always paginate + have the directory service request the max page
size; keep pagination opt-in; split into two endpoints) — the user chose
the first: one uniform endpoint contract, with the directory service
explicitly requesting `limit=100` (the server's own max) since it needs
"the whole directory," not a paginated admin view. Documented as a
named, revisit-if-it-matters cap, not treated as fully solved.

New `user.validation.js` (`listUsersQuerySchema`) mirrors
`employee.validation.js`'s `listEmployeesQuerySchema` exactly — `page`/
`limit` (defaults `1`/`10`, capped at `100`), `search` (across `name`/
`email`, no join needed since both live directly on `User`, unlike
Employees' search which reaches through a relation), a new `role` filter
(exact match against a role **name** via the `userRoles`/`Role`
relation — one `EXISTS` subquery, no N+1, and a deliberate choice over
denormalizing a role column onto `User`, since the relation is genuinely
many-to-many), and a `sortBy` allowlist (`name`/`email`/`createdAt` —
roles are multi-valued and deliberately not sortable). `user.repository.js`
gained a paired `count()` alongside a `findAll()` that now accepts
`{ where, orderBy, skip, take }` instead of a bare no-arg call.
`user.service.js`'s `listUsers()` runs the page query and count query in
parallel via `Promise.all` (not a `$transaction`) — the identical,
already-accepted trade-off from Feature 10, and now also resolves
`rbacRepository.getRoleNamesForUsers` scoped to just the current page's
user ids, a strict improvement over the old behavior (which resolved
roles for the entire table on every call). The same unconditional
secondary `id ASC` tiebreaker as Feature 10 keeps ordering deterministic
across repeated/paged calls.

**One real bug was found and fixed after this shipped, via the user's
own live browser testing, not code review**: the `role` filter used
Prisma's plain `equals`, which is case-sensitive — `role=admin` or
`role=Employee` silently matched nothing even though `role=ADMIN`/
`role=EMPLOYEE` worked, since the seeded role names are uppercase. Fixed
by switching to `{ equals: role, mode: 'insensitive' }`, the same
case-insensitivity `search` already had. Verified live: `admin`,
`Admin`, and `ADMIN` all now return the identical, correct total.

Verified live end-to-end against the real running server (a throwaway
test account registered, promoted to `ADMIN` via the established direct-
Prisma-script pattern, and deleted again afterward, per this project's
standing convention): default pagination, explicit page/limit, search
across name/email, role filter (including case variations and an
unmatched value correctly returning zero rows, not an error), sort in
both directions with the deterministic tiebreaker confirmed via repeated
identical calls, and `400`s on out-of-bounds `limit`/invalid `sortBy`.
`npm run lint` clean throughout. `handbook/API_ENDPOINTS.md` and
`backend/README.md` updated to match — see the frontend's matching entry
in `frontend/CLAUDE.md` for the client-side half of this pass, including
the new shared `list-query-state` pattern this established as reusable
for future list screens.)_

_(Branch Domain — 2026-09-13, on branch `feature/15-branch-domain`. Not a
numbered feature from the original roadmap; the first domain implemented
from the separately-maintained Enterprise HRMS/ERP Business Architecture
Review (`docs/architecture-index.md`), which had already produced a full
business-architecture sign-off (`docs/domain-branch.md`) before any code
existed. Closes a named gap that sign-off itself identified: `Employee.
department`/`jobTitle` were plain free-text strings with no location
concept anywhere in the schema.

New `Branch` model (`id`, `name` unique, `code` unique-when-present,
`status: BranchStatus` default `ACTIVE`) plus `Employee.branchId`
(nullable, `onDelete: Restrict` — deliberately not `SetNull` like
`userId`/`managerId`, since the domain's own invariant is "never
hard-deleted while referenced," and this is the DB-level backstop for
that rule, not just an app-level check). New module
`src/modules/branches/` mirrors the Employee module's file shape exactly
(repository/service/controller/routes/validation/docs). Full CRUD:
`POST`/`GET`/`GET :id`/`PATCH`/`DELETE /branches`, all under
`authMiddleware` + `requirePermission`.

Two scoping questions the architecture review had explicitly left open
(ADR-B07, ADR-B08) were resolved at the start of implementation, per that
document's own instruction not to leave them for later — done
unilaterally per the user's standing direction-authority delegation for
this initiative, not asked as a blocking question: **ADR-B07**, Branch
mutations (`create`/`update`/`delete`) are `ADMIN`-only, deliberately
tighter than `employee:*` (where `MANAGER` has full parity with `ADMIN`)
since Branch is foundational org-structure data; `branch:read` is granted
to all three seeded roles, since it's non-sensitive reference data with
no ownership dimension. **ADR-B08**, yes — Branch mutations extend the
existing generic `AuditLog` model via a new `AUDIT_ENTITY_TYPES.BRANCH`,
identical in shape to Employee's pattern, no schema change required.

`employee.service.js`'s `createEmployee`/`updateEmployee` gained a
branch-assignability check (`branchService.assertBranchAssignable`) — a
synchronous cross-module read, the same shape ADR-006 (offboarding
revocation, separate branch) used for Employee→User. Enforces the
domain's positive-allowlist rule: a branch must exist **and** be
`ACTIVE` to be assignable, never the inverse (`!== INACTIVE`), so a
future third status value defaults to not-assignable. Deactivating a
branch never touches existing `Employee.branchId` references — only
blocks *future* assignment.

Extended the `node:test` foundation seeded by the ADR-006 branch:
`branch.service.test.js` (6 integration tests against the real dev
database — create/duplicate-rejection, list/search, deactivate-blocks-
future-assignment-but-keeps-existing-links, assignability-check against a
nonexistent branch, Employee creation honoring the check end-to-end, and
delete-blocked-when-referenced vs. delete-allowed-when-unreferenced).

Verified live end-to-end against the real running server (a throwaway
test account registered, promoted to `ADMIN` via the established direct-
Prisma-script pattern): full create → duplicate 409 → list/search → get →
deactivate → assignability 400s (both nonexistent and inactive branch) →
delete-blocked-409 → delete-allowed-200 sequence, plus explicit
permission checks confirming `EMPLOYEE` gets `403` on mutations but `200`
on reads. All test/live fixtures cleaned up afterward. `npm run lint` and
`npx prettier --check` clean throughout. `docs/domain-branch.md` (ADR-B07/
B08 resolution, confidence 88%→92%), `docs/adr-index.md`, and
`docs/deferred-decisions-register.md` updated to reflect implementation.
`handbook/API_ENDPOINTS.md` gained 5 new endpoint entries (19-23) plus
updates to endpoints 9 and 12's `branchId` field documentation.

Deliberately **backend-only** — no frontend changes on this branch, kept
separate to avoid mixing an unrelated feature area; a Branch admin
screen and a branch picker in the Employee form are the natural frontend
follow-up, tracked as a separate future initiative, not started here.)_

_(Department Domain — 2026-09-13, on branch `feature/16-department-domain`
(based on `feature/15-branch-domain`). Second domain implemented from the
HRMS/ERP Business Architecture Review (`docs/domain-department.md`).
Structurally the sibling of Branch, but with one materially bigger,
genuinely riskier decision: `Employee.departmentId` is **mandatory**
(ADR-D07), not nullable like `branchId` — the schema's original
`department` column had always been a required `String`, and the domain
sign-off deliberately preserved that mandatoriness rather than loosening
it. This flag was raised to the user explicitly before implementation
(not decided silently) since it meant a real breaking change to
`POST`/`PATCH /employees`'s contract, not an additive one; the user chose
the full breaking migration over a deferred additive-only alternative.

Executed as a real expand → backfill → contract migration sequence
against live dev data, not a toy example: **expand** (migration
`add_department_expand`) added the `Department` table and a *nullable*
`departmentId` alongside the still-live `department` string column;
**backfill** (`prisma/backfill-department.js`, a new permanent script,
same category as `prisma/seed.js`) inspected the real dev database and
found exactly the free-text mess this domain exists to fix — 30 Employee
rows, 12 distinct values, including test-data noise (`"wefswedf"`, `"A"`,
`"Eng"` kept as a value distinct from `"Engineering"`) — created one
`Department` row per distinct value, backfilled every Employee row
(soft-deleted ones included, since the coming NOT NULL constraint applies
to every row regardless of `deletedAt`), and asserted zero remaining
nulls before allowing the next step; **contract**
(`add_department_contract`, generated via `prisma migrate diff` since
`prisma migrate dev` refuses destructive changes non-interactively, then
applied via `prisma migrate deploy`) dropped the old `department` column
and made `departmentId` `NOT NULL`. Zero data loss, verified by inspecting
every row's `department`/`departmentId` pair pre- and post-migration.

New module `src/modules/departments/` mirrors Branch's file shape exactly.
One real divergence from Branch's `findByNameOrCode`: Department's name
uniqueness check is **case-insensitive** (`docs/domain-department.md §3`
makes this an explicit business rule, unlike Branch's sign-off), verified
live (`"engineering"` after `"Engineering"` already exists → `409`).
ADR-D08 (permission scoping) and ADR-D09 (audit logging) resolved
identically to Branch's ADR-B07/B08 — `ADMIN`-only mutations, `department:
read` for all three roles, `AuditLog` extended via
`AUDIT_ENTITY_TYPES.DEPARTMENT`.

`employee.service.js` changes were more invasive than Branch's: `department`
removed from `createEmployeeSchema`/`updateEmployeeSchema` entirely,
replaced by a required `departmentId` (present in `createEmployeeSchema`,
`.partial()`'d into `updateEmployeeSchema` like every other field but
deliberately **not** added to the nullable-widening `.extend()` block
there, since — unlike `userId`/`managerId`/`branchId` — there is no valid
"clear the department" state; verified live that `{"departmentId": null}`
is rejected by Zod, not silently accepted). `buildEmployeeWhere`'s
`search` clause and the `department` filter both moved from a direct
string comparison to a relation traversal (`department: { name: {
contains: ... } }` / `where.departmentId`); a new `buildEmployeeOrderBy`
helper handles `sortBy=department` as a nested one-hop relation sort
(`orderBy: { department: { name: order } } }`) since 'department' is no
longer a scalar column — the query-string value itself was kept as
`department` for API stability even though the underlying field is now
`departmentId`.

Extended the `node:test` suite: `department.service.test.js` (6 tests,
mirroring Branch's) plus a fix to the earlier `branch.service.test.js`
(its fixtures created raw `Employee` rows with a `department` string that
no longer exists — updated to create a real test `Department` first).
All 12 tests across both domains pass together. Verified live end-to-end
against the real running server: create → case-insensitive-duplicate-409
→ list/search → get → deactivate → assignability 400s (nonexistent,
inactive, **and missing entirely** — confirming the mandatory-field
rejection) → delete-blocked-409, plus `sortBy=department`/`search` against
real pre-existing Employee data (not just fresh fixtures) and explicit
`EMPLOYEE`-role permission checks. All test/live fixtures cleaned up
afterward, including one orphaned throwaway user left over from an
earlier aborted verification attempt in this same session (a Windows/
Git-Bash `/tmp`-path gotcha, not a code defect — see
`handbook/TESTING_GUIDE.md`'s existing note on this exact issue).
`npm run lint` and `npx prettier --check` clean throughout.

`docs/domain-department.md` (ADR-D08/D09 resolution, confidence 87%→91%,
Weakness 1 updated with the real backfill outcome), `docs/adr-index.md`,
`docs/deferred-decisions-register.md` updated. `handbook/API_ENDPOINTS.md`
gained 5 new endpoint entries (24-28) plus extensive updates throughout
endpoints 9/10/12 (request/response examples, query params, error
tables, Postman cases, cURL examples) reflecting the breaking
`department` → `departmentId` change — not just additive documentation,
since the old field genuinely no longer exists. `backend/README.md`
updated to match.

**Process note, not a code issue**: this work was initially started
directly on `feature/15-branch-domain` instead of a fresh branch — caught
and corrected (via `git checkout -b feature/16-department-domain` before
anything was committed) once noticed, rather than left as a mixed-concern
branch. Recorded here so it isn't repeated silently.

Deliberately **backend-only**, same as Branch — a Department admin
screen and picker in the Employee form are frontend follow-up work, not
started here.)_

_(Designation Domain — 2026-09-13, on branch `feature/17-designation-domain`
(based on `feature/16-department-domain`). Third domain implemented from
the HRMS/ERP Business Architecture Review (`docs/domain-designation.md`).
Structurally identical to Department in every respect — the domain
sign-off itself designs it that way deliberately, rather than by
accident — including the same materially bigger decision Department
carried: `Employee.designationId` is **mandatory** (ADR-DS07), because
the schema's original `jobTitle` column had always been a required
`String`. One open item the domain doc left unresolved, ADR-DS06
(permission scoping), was resolved without asking — per the user's
standing delegation of roadmap-direction authority — as `ADMIN`-only
mutations / `designation:read` for all roles, identical to Branch's
ADR-B07 and Department's ADR-D08, since the doc itself names that as the
expected default and nothing about Designation justifies diverging.

Executed the same expand → backfill → contract migration sequence as
Department, against the same live dev database: **expand**
(`add_designation_expand`) added the `Designation` table and a *nullable*
`designationId` alongside the still-live `jobTitle` string column;
**backfill** (`prisma/backfill-designation.js`, new permanent script)
found 30 Employee rows, **17** distinct free-text `jobTitle` values
(more fragmentation than Department's 12, including junk like
`"sderwf"` and a bare `"B"`), created one `Designation` row per distinct
value, backfilled every row (soft-deleted included), and asserted zero
remaining nulls; **contract** (`add_designation_contract`, generated via
`prisma migrate diff` + applied via `prisma migrate deploy`, same
non-interactive-destructive-migration workaround as Department) dropped
`jobTitle` and made `designationId` `NOT NULL`. Zero data loss.

New module `src/modules/designations/` mirrors Department's file shape
exactly, including the case-insensitive `findByNameOrCode` (this domain's
own doc makes the same explicit case-insensitive-uniqueness business
rule Department's did). `employee.service.js`'s `buildEmployeeWhere`/
`buildEmployeeOrderBy` extended for `designationId`/`designation` the
same way they already handle `departmentId`/`department` — the
`RELATION_SORT_FIELDS` set now covers both relation-backed sort keys
instead of a single `if` check. `designationId` follows `departmentId`'s
precedent exactly on the nullability question: present and required in
`createEmployeeSchema`, `.partial()`'d but deliberately **not** added to
`updateEmployeeSchema`'s nullable-widening `.extend()` block, since there
is no valid "clear the designation" state.

Extended the `node:test` suite: `designation.service.test.js` (6 tests,
mirroring Department's) plus fixes to both `branch.service.test.js` and
`department.service.test.js` (their fixtures created raw `Employee` rows
with a `jobTitle` string that no longer exists — both updated to create a
real test `Designation` first, same fix class as Branch's break after the
Department migration). All 18 tests across all three domains pass
together. Verified live end-to-end against the real running server:
create → case-insensitive-duplicate-409 → list/search → get → deactivate
→ assignability 400s (nonexistent, inactive, and missing entirely) →
delete-blocked-409, plus `sortBy=designation`/`search` against real
pre-existing Employee data and explicit `EMPLOYEE`-role permission checks
(read allowed, create forbidden). All live-verification fixtures cleaned
up afterward, including the now-familiar `RefreshToken`-before-`User`
deletion order for a scratch login-tested user.

`docs/domain-designation.md` (ADR-DS06 resolved, ADR-DS07 implementation
confirmed, confidence 86%→91%), `docs/adr-index.md`,
`docs/deferred-decisions-register.md` updated. `handbook/API_ENDPOINTS.md`
gained 5 new endpoint entries (29-33) plus updates throughout endpoints
9/10/12 reflecting the breaking `jobTitle` → `designationId` change.
`backend/README.md` updated to match.

Deliberately **backend-only**, same as Branch/Department — a Designation
admin screen and picker in the Employee form are frontend follow-up work,
not started here.)_

_(Employment Type Domain — 2026-09-13, on branch
`feature/18-employment-type-domain` (based on
`feature/17-designation-domain`). Fourth domain from the HRMS/ERP Business
Architecture Review (`docs/domain-employment-type.md`), and the first one
architected deliberately differently from the last three: per ADR-ET01,
Employment Type is a **closed, code-defined enum** (`FULL_TIME |
PART_TIME | CONTRACT | INTERN`), not an admin-manageable master-data
table like Branch/Department/Designation, because each value carries real
downstream-behavior significance (future Leave accrual, Payroll
calculation basis) that an admin-creatable row could never safely carry
on its own. Consequence: no new module, no repository, no CRUD service,
no new endpoints, no new permissions, no new AuditLog entity type - just
a required enum field on `Employee` and the corresponding
validation/query changes.

Genuinely new ground, unlike Branch/Department/Designation: **verified
fact**, no `employmentType`-shaped column existed anywhere before this,
so there was no free-text precursor to derive real historical values
from. This required a real judgment call flagged to the user before
implementing (not decided silently): all 30 pre-existing Employee rows
needed *some* value to satisfy the incoming `NOT NULL` constraint, so
every one was assigned `FULL_TIME` via a temporary `DEFAULT 'FULL_TIME'`
in the migration SQL itself (a single-step migration, no separate
expand/backfill/contract sequence needed since there was nothing to
preserve) - the default was dropped immediately after
(`ALTER COLUMN ... DROP DEFAULT`) so every future `POST`/`PATCH` must
specify `employmentType` explicitly (ADR-ET02: no unknown state).

`employmentType` added to `createEmployeeSchema` (required), `.partial()`'d
into `updateEmployeeSchema` but deliberately not added to the
nullable-widening `.extend()` block - same non-nullable treatment as
`departmentId`/`designationId`, verified live that `{"employmentType":
null}` is rejected by Zod, not silently accepted. `buildEmployeeWhere`
gained a plain scalar `employmentType` filter (no relation - unlike
`departmentId`/`designationId`, there's no FK or existence/status check
to perform, since it's a value, not a reference to another aggregate's
identity); `employmentType` was added to `SORTABLE_FIELDS` and correctly
falls through `buildEmployeeOrderBy`'s default branch as a plain column
sort, since `RELATION_SORT_FIELDS` only lists `department`/`designation`.

New `employee.employmentType.test.js` (3 tests: all four values accepted,
an invalid value rejected, a conversion overwrites the current value on
update) - no service-level test file since there's no service to test.
Existing `branch/department/designation.service.test.js` fixtures needed
`employmentType: 'FULL_TIME'` added to their raw `Employee` creates, same
fix class as every previous domain's break. All 21 tests across all four
domains pass together. Verified live end-to-end: missing-field 400,
invalid-value 400 (same Zod message, since enum validation doesn't
distinguish the two cases), valid creation with each value, filter by
`employmentType`, sort by `employmentType` (confirmed genuinely a plain
scalar sort against real data), a real `INTERN` → `FULL_TIME` conversion
via `PATCH`, null-rejection on `PATCH`, and confirmed the conversion was
captured by Employee's *existing* audit logging with zero new code -
exactly as the domain doc's own architecture predicted (§5: "no new
architectural mechanism" needed).

`docs/domain-employment-type.md` (ADR-ET01/ET02 implementation confirmed,
the AuditLog open question resolved as "not applicable", confidence
90%→92%), `docs/adr-index.md` updated. `handbook/API_ENDPOINTS.md` updated
in place across endpoints 9/10/12 (a new required field, not a
renamed/removed one like Department's/Designation's breaking changes -
framed accordingly) plus a new Endpoint Index note - no new endpoint
sections needed, since there are no new endpoints. `backend/README.md`
updated to match.

Deliberately **backend-only**, same as the prior three domains.)_

_(Holiday Calendar Domain — 2026-09-13, on branch
`feature/19-holiday-calendar-domain` (based on
`feature/18-employment-type-domain`). Fifth domain from the HRMS/ERP
Business Architecture Review (`docs/domain-holiday-calendar.md`), and
structurally the most complex one yet - the first **parent-child
aggregate** (`HolidayCalendar` owns cascade-deleted `Holiday` entries,
mirroring the existing `Employee` → `EmployeeDocument` shape), the first
domain where the **FK direction reverses** (`Branch.holidayCalendarId`,
optional - Branch becomes a consumer of another axis instead of only
Employee consuming Branch/Department/Designation), and the first
**multi-hop cross-domain read chain** (Employee→Branch→HolidayCalendar→
Holiday).

Resolved the one open item this domain's own sign-off left open
(permission scoping, now ADR-HC06) identically to
Branch/Department/Designation: `ADMIN`-only mutations (calendar CRUD and
holiday-entry CRUD, since entries are aggregate-internal - no separate
`holiday:*` permission set), `holidayCalendar:read` for all roles.

Deliberately did **not** over-build ADR-HC04's resolution-query
recommendation: implemented only the calendar-level primitive
(`holidayCalendarService.isDateHolidayInCalendar(holidayCalendarId,
date)`), which is genuinely this domain's own service responsibility per
its architecture section (§5: "provide the query 'is date X a holiday
for calendar Y'"). Did not build the fuller Employee→Branch→
HolidayCalendar orchestration chain, since no Attendance/Leave consumer
exists yet to call it and the domain doc itself explicitly assigns that
job to "whichever of Attendance/Leave is designed next" - building it
now would have been speculative infrastructure with zero callers.

New module `src/modules/holidayCalendars/` - two repositories
(`holidayCalendar.repository.js` for the aggregate root,
`holiday.repository.js` for the child entity), one service exposing both
calendar CRUD and nested holiday-entry CRUD, one controller, one routes
file with nested `/:id/holidays[/:holidayId]` routes mirroring
`employee.routes.js`'s existing `/:id/documents` nesting exactly. No
`code` field on `HolidayCalendar`, unlike Branch/Department/Designation -
this domain's own sign-off never names one as useful here, so none was
added speculatively. Holiday's date-uniqueness-within-calendar invariant
(§4) is enforced at the DB level via `@@unique([holidayCalendarId,
date])`, not just in the service layer.

`branch.service.js` gained a new optional `holidayCalendarId` on
create/update, with an `assertHolidayCalendarAssignable` check (must
exist, must be `ACTIVE`) - the same positive-allowlist shape every prior
assignability check uses, just consumed by Branch this time instead of
Employee. `updateBranchSchema` widens `holidayCalendarId` to nullable
(unlike `createBranchSchema`'s plain `.optional()`), matching the
established "PATCH needs a way to express unassignment" pattern already
used for Employee's `userId`/`managerId`/`branchId`.

Two new `AuditLog` entity types (`HOLIDAY_CALENDAR`, `HOLIDAY`) - each
holiday-entry mutation gets its own audit record keyed by the Holiday's
own id, the same own-entity audit pattern already established by
`EmployeeDocument` (a child entity that also gets independent audit
entries rather than being folded into its parent's).

New `holidayCalendar.service.test.js` (8 tests: calendar CRUD,
duplicate-name rejection, duplicate-date-within-calendar rejection via
the DB unique constraint, the `isDateHolidayInCalendar` resolution query
resolving both true and false correctly, holiday entry edit/remove with
no reference restriction, calendar deactivation blocking future Branch
assignment while preserving existing links, and delete-blocked-when-
referenced-by-Branch) plus a new test in `branch.service.test.js` for the
holidayCalendarId assignability check. All 30 tests across all five
domains pass together. One test-writing gotcha hit and fixed: calling
`holidayCalendarService.addHoliday` directly from a test (bypassing the
route layer's Zod `z.coerce.date()`) requires passing real `Date` objects,
not date strings - Prisma's client validates `DateTime` input strictly
and rejects a bare `"2026-08-15"` string with "premature end of input."

Verified live end-to-end against the running server: calendar CRUD,
duplicate-name/duplicate-date 409s, holiday add/list/edit/remove, Branch
assignment (valid, nonexistent-400, inactive-400), unassignment via
explicit `null` on `PATCH /branches/:id`, delete-blocked-409 while
referenced then successful delete after unassignment, and EMPLOYEE-role
permission checks (read allowed, create forbidden). All live-verification
fixtures cleaned up afterward, respecting the dependency order this
domain adds: Branch must be deleted/unassigned before its HolidayCalendar
can be deleted (`onDelete: Restrict`), the reverse of every prior
domain's cleanup order.

`docs/domain-holiday-calendar.md` (ADR-HC06 added and implemented, ADR-HC04
implementation-scoped explicitly, confidence 84%→89%), `docs/adr-index.md`,
`docs/deferred-decisions-register.md` updated. `handbook/API_ENDPOINTS.md`
gained new endpoint docs for the calendar and nested holiday routes plus
updates to the Branch section for `holidayCalendarId` (delegated to a
background agent given the expected size, then verified). `backend/README.md`
updated to match.

Deliberately **backend-only**, same as every prior domain.)_

_(Shift Domain — 2026-09-15, on branch `feature/20-shift-domain` (based on
`feature/19-holiday-calendar-domain`). Sixth domain from the HRMS/ERP
Business Architecture Review (`docs/domain-shift.md`), and the second
domain of HRMS Phase 2. Structurally the simplest domain since
Designation - a single flat aggregate (`Shift`), no parent-child shape, no
reversed FK direction - but the first to introduce a genuinely new field
type: `startTime`/`endTime` as `"HH:mm"` strings rather than `DateTime`,
a deliberate choice (not in the domain doc, made here) since Postgres/
Prisma have no first-class time-only type in this stack and a `DateTime`
would force an arbitrary date component onto what's semantically
time-of-day only.

`Employee.shiftId` is nullable (ADR-SH02), mirroring `branchId`'s optional
pattern rather than `departmentId`/`designationId`/`employmentType`'s
mandatory one - not every employee necessarily operates under a
fixed-hours expectation. `onDelete: Restrict`, same "never hard-deleted
while referenced" invariant as every governed-master-data FK.

Resolved the one open item this domain's own sign-off left open
(permission scoping, now ADR-SH05) identically to every prior domain:
`ADMIN`-only mutations (`shift:create/update/delete`), `shift:read` for
all roles.

Implemented ADR-SH03's overnight-shift semantics as a single exported
pure function, `shiftService.isOvernightShift({ startTime, endTime })`,
comparing the two zero-padded `"HH:mm"` strings directly (lexicographic
order agrees with chronological order for this format, so no date
parsing is needed) - the "encoded once, here" primitive §4 asks for, not
a full day-attribution resolver, since no consumer (Attendance) exists
yet. Same scoping discipline as Holiday Calendar's `isDateHolidayInCalendar`
(ADR-HC04): build the primitive a future consumer will need, not the
orchestration around it that only that consumer can actually specify.

New module `src/modules/shifts/` - repository, validation (24-hour
`"HH:mm"` regex on `startTime`/`endTime`, `workingDays` as a non-empty
array of a dedicated `Weekday` enum, mirrored 1:1 against the Prisma
enum), service, controller, routes, docs - same flat single-aggregate
shape as `designations/`. Migration was purely additive (new `ShiftStatus`/
`Weekday` enums, new `Shift` table, new nullable `Employee.shiftId` +
index) - no expand/backfill/contract needed since the field is optional.

`employee.validation.js`/`employee.service.js` extended the same way as
every prior optional-FK axis: `shiftId` added to both employee schemas
(`.optional()` on create, `.nullable().optional()` on update for explicit
unassignment), `assertShiftAssignable` called only when a `shiftId` is
actually provided (unconditional call, unlike `departmentId`/
`designationId`, since this field can legitimately be absent),
`buildEmployeeWhere` gained a plain `shiftId` filter, `shift` added to
`RELATION_SORT_FIELDS` (sorts by the linked Shift's `name`, same one-hop
nested-orderBy shape as `department`/`designation`), and the FK-violation
handler extended to recognize a `shiftId` constraint name.

New `shift.service.test.js` (7 tests: create + duplicate-name rejection,
list/search/pagination, deactivation blocks future assignment but
preserves existing links, `assertShiftAssignable` rejects a nonexistent
id, Employee creation both without a `shiftId` (confirms genuinely
optional) and with a valid one plus a nonexistent-id rejection,
delete-blocked-while-referenced then successful after unassignment, and
`isOvernightShift` correctness for both a midnight-crossing and a
same-day shift). All 37 tests across all six domains pass together.

Verified live end-to-end against the running server: shift creation
(day and overnight), duplicate-name 409, invalid-time-format 400,
empty-`workingDays` 400, EMPLOYEE-role permission checks (read allowed,
create forbidden with 403), Employee creation with a real `shiftId`,
delete-blocked-409 while referenced, and successful delete after
unassigning via `PATCH /employees/:id` with `{"shiftId": null}`. All
live-verification fixtures cleaned up afterward.

`docs/domain-shift.md` (ADR-SH05 added and implemented, ADR-SH01-03
implementation confirmed, confidence 85%→90%), `docs/adr-index.md`,
`docs/deferred-decisions-register.md` updated. `handbook/API_ENDPOINTS.md`
gained new endpoint docs for `/shifts` plus updates to the Employee
section for `shiftId` (delegated to a background agent given the
expected size, then verified). `backend/README.md` updated to match.

Deliberately **backend-only**, same as every prior domain.)_

_(Attendance Domain — 2026-09-15, on branch `feature/21-attendance-domain`
(based on `feature/20-shift-domain`). Seventh domain from the HRMS/ERP
Business Architecture Review (`docs/domain-attendance.md`), and the first
domain that genuinely breaks the mold every prior domain (Branch through
Shift) followed - no status/archive lifecycle, no hard-delete-if-
referenced rule (`AttendanceRecord` is a raw-fact historical ledger per
ADR-AT01, closer in nature to `AuditLog` than to master data), and the
first domain to need a **coordinating read service** that cross-
references two other domains' data (Holiday Calendar + Shift) to produce
a value that is never itself persisted (ADR-AT03: effective status
computed on read).

`attendanceService.getEffectiveStatus(employeeId, date, requester)` is
that coordinating service - the concrete point where ADR-HC04's
Holiday-Calendar resolution-query recommendation and ADR-SH03's Shift
overnight-semantics primitive actually get consumed together, rather
than remaining hypothetical for "whoever designs Attendance next" (as
both domains' own sign-offs anticipated). It resolves, in order: Employee
→ Branch → HolidayCalendar → `isDateHolidayInCalendar` (`HOLIDAY`);
Employee → Shift → `workingDays` exclusion (`WEEK_OFF`); no
`AttendanceRecord` (`ABSENT`); `record.isHalfDay` (`HALF_DAY`); Shift
assigned and non-overnight and `checkIn` later than `shift.startTime`
(`LATE`); otherwise `PRESENT`. Does **not** resolve `ON_LEAVE` - the
Leave domain that leg of ADR-AT03 depends on doesn't exist yet; a
currently-on-leave date resolves as `ABSENT` today, a named gap (§9 of
the domain doc), not a silent one.

Two judgment calls made and documented rather than left implicit, since
the domain doc names the resulting status values but doesn't fully
specify either: **`isHalfDay` is a stored fact, not a derived time-
threshold** (mirrors `Holiday.isOptional`'s shape - inventing a minimum-
hours rule with no verified requirement would have been a fabricated
assumption, not an architecture decision). **Lateness is only computed
for non-overnight shifts** - comparing a real check-in timestamp's HH:mm
against an overnight shift's `startTime` string is ambiguous once the
calendar day rolls over, and Shift's own ADR-SH03 risk row already
flagged this exact edge case as something "Attendance's own sign-off
should re-verify" - scoped out explicitly as a named entry in
`docs/domain-attendance.md`'s Deferred Decisions table, rather than
guessing at fragile date arithmetic.

`AttendanceRecord.employeeId` uses `onDelete: Cascade`, not `Restrict`
like every governed-master-data FK on Employee (`branchId`/
`departmentId`/`designationId`/`shiftId`) - this is owned-by-Employee
history, mirroring `EmployeeDocument`'s own Cascade, not referenced
master data that must outlive its owner. `date` is truncated to UTC
midnight by the service layer before every write/query
(`attendanceService`'s `toDateOnly`), enforcing ADR-AT02's one-record-
per-(employee,date) invariant regardless of what time-of-day component an
input carried.

**Permission model deliberately breaks from the ADMIN-only-mutation shape
every master-data domain (Branch through Shift) converged on** (new
ADR-AT06): `attendance:checkin` (self-service check-in/check-out, every
role), `attendance:read:own`/`:read:any`, `attendance:create:any`/
`:update:any`/`:delete:any` (ADMIN + MANAGER, mirroring `employee:*:any`'s
existing MANAGER grant - the closest existing precedent for a domain
that's inherently self-service-plus-admin-correction, not pure master
data). `GET /attendance` (list) stayed `:any`-only with no auto-scoped
`:own` listing, matching `GET /employees`'s existing shape rather than
inventing a new one; single-record `GET /attendance/:id` and
`GET /attendance/effective-status` both got the own-vs-any split,
mirroring `GET /employees/:id`'s existing ownership-check pattern (service
layer checks `req.grantedPermissions` post-fetch, since the permission
middleware has no record yet to compare against).

New module `src/modules/attendance/` - repository, validation, service,
controller, routes, docs. Two self-service endpoints with no request body
(`POST /attendance/check-in`, `PATCH /attendance/check-out` - the
timestamp is always the server's current time, never client-supplied) plus
the standard create/list/get/update/delete set for admin/manager use, plus
the dedicated `GET /attendance/effective-status?employeeId=&date=` read
(registered before `/:id` in the route file, otherwise Express would try
to match "effective-status" as an `:id` value). Self-check-in/check-out
resolve "my own Employee record" via `employeeRepository.findByUserId`,
the same lookup `employee.service.js`'s `createEmployee` already uses to
detect an existing link - reused here since there's no `:id` in the URL to
derive ownership from. Migration was purely additive (new `AttendanceRecord`
table, new FK to Employee) - no expand/backfill/contract needed since this
is a wholly new aggregate, not a column replacement.

New `attendance.service.test.js` (15 tests: check-in/check-out flows
including duplicate-in/duplicate-out/no-employee-record rejections, admin
manual creation plus duplicate-(employeeId,date) and future-date
rejection, single-record ownership checks for owner/non-owner/`:any`,
list filtering by employeeId and date range, correction with AuditLog
verification, deletion with no reference-count restriction, and all six
`getEffectiveStatus` branches - `HOLIDAY`, `WEEK_OFF`, `ABSENT`,
`PRESENT`, `LATE`, `HALF_DAY` - plus the overnight-shift limitation and
the cross-employee ownership rejection). All 52 tests across all seven
domains pass together.

Verified live end-to-end against the running server: self check-in/
check-out (including both duplicate-action 409s), EMPLOYEE-role 403 on
list and on admin-create, admin manual creation plus duplicate-409 and
future-date-400, filtered list, a real correction via `PATCH`, effective-
status for both an explicit `employeeId` (ADMIN) and the caller's own
default (EMPLOYEE), a 403 when EMPLOYEE queried another employee's
effective status, and delete-then-404. All live-verification fixtures
cleaned up afterward.

`docs/domain-attendance.md` (ADR-AT01-05 implementation confirmed, new
ADR-AT06 added for permission scoping, the Leave-dependent gap in AT03
named explicitly rather than silently narrowed, confidence 82%→85%),
`docs/adr-index.md`, `docs/deferred-decisions-register.md` updated.
`handbook/API_ENDPOINTS.md` gained new endpoint docs for `/attendance`
(delegated to a background agent given the expected size, then verified).
`backend/README.md` updated to match.

Deliberately **backend-only**, same as every prior domain.)_

_(Leave Domain — 2026-09-15, on branch `feature/22-leave-domain` (based on
`feature/21-attendance-domain`). Eighth domain from the HRMS/ERP Business
Architecture Review (`docs/domain-leave.md`), and by far the largest yet -
three aggregates (`LeaveType`, `LeaveRequest`, `LeaveBalance`) instead of
one, this review's first genuine multi-party approval workflow
(Pending → Approved | Rejected, Approved → Cancelled), and the domain
that finally closes the `ON_LEAVE` gap Attendance's own ADR-AT03 named as
a requirement one domain ago.

Two genuinely open business questions the domain doc itself flags and
explicitly asks be confirmed with real stakeholders (Final Sign-off: "confirm
entitlement-proration formula ... before implementation") - concrete,
flagged recommendations were implemented rather than blocking, the same
treatment Employment Type's FULL_TIME-default migration and Attendance's
Half-Day/overnight-lateness scoping got: **entitlement proration** is a
concrete hire-year formula (`defaultAnnualEntitlement × daysRemainingInHireYear
/ totalDaysInHireYear`, full entitlement every subsequent year, zero
before hire), literally domain-doc §4's own recommendation made concrete
- not a fresh assumption. **No employment-type-based entitlement
adjustment** was added - the domain doc explicitly warns against
hard-coding an unverified percentage (§3), so only the hire-date leg of
its recommendation was implemented, deliberately leaving the rest as a
named, open deferred item rather than inventing numbers.

`LeaveBalance` is computed **lazily**, not via a scheduled annual grant
job - this project has no scheduler/cron infrastructure anywhere, so
`leaveService.getOrCreateLeaveBalance()` computes-and-persists a balance
row the first time one is actually needed (on read or on request
approval), the pragmatic implementation of "annual lump sum" (§4) without
introducing new cross-cutting scheduling infrastructure for one domain.

The employee-request/manager-approval overlap invariant ("no two
Pending/Approved requests with overlapping dates," §4) is enforced in the
**service layer**, not a DB exclusion constraint - a real range-overlap
check needs Postgres's `btree_gist` extension, a heavier migration lift
than anything else in this review; app-layer checking against the small
per-employee active-request set is the simpler option this project has
consistently favored absent a demonstrated need.

**Approval authority refined during implementation, flagged explicitly
rather than left ambiguous:** the domain doc describes `ADMIN` as a
fallback only when `managerId` is null (§2). Implemented instead as two
distinct permissions - `leaveRequest:decide:any` (`ADMIN`, unconditional
on every request, not just the null-manager case) and
`leaveRequest:decide:reports` (`MANAGER`, scoped in the service to the
caller's own direct reports via `Employee.managerId`) - widening ADMIN's
authority slightly beyond the doc's literal wording, consistent with the
"audit-logged manual override as escape hatch" philosophy already applied
to `LeaveBalance` elsewhere in this same domain doc (§10).

Holiday/week-off-excluded duration (ADR-LV04) reuses the exact primitives
Holiday Calendar and Shift already built for Attendance -
`isDateHolidayInCalendar` and a `Weekday`-array membership check -
computed once per request at approval time via
`leave.service.js`'s internal `computeLeaveDuration`, iterating the
requested date range. This is the second consumer of
`isDateHolidayInCalendar` ADR-HC04 anticipated, exactly as planned.

**Closes Attendance's own named gap (new ADR-LV08):**
`leaveService.hasApprovedLeaveOnDate(employeeId, date)` is the query
ADR-AT03/§12 asked Leave to expose. `attendanceService.getEffectiveStatus()`
was extended with one new leg, inserted as
`HOLIDAY → WEEK_OFF → ON_LEAVE → ABSENT → HALF_DAY → LATE → PRESENT` -
a pure read of Leave's approved-request data, Attendance's own schema and
write paths completely untouched, honoring ADR-AT03's read-only contract
from both sides.

**Permission model breaks in two different directions depending on
aggregate shape (new ADR-LV07)** - the largest permission surface of any
domain in this review, 14 new keys: `LeaveType` follows the ADMIN-only-
mutation/read-for-all pattern every master-data domain since Branch
converged on; `LeaveRequest`/`LeaveBalance` instead mirror `Employee`'s
own/any split (`leaveRequest:create:own`, `:read:own`/`:read:any`,
`:cancel:own`/`:cancel:any`, `:decide:any`/`:decide:reports`;
`leaveBalance:read:own`/`:read:any`/`:adjust:any`), the same divergence
Attendance's own ADR-AT06 already established for self-service-plus-
admin-correction domains.

New modules: `src/modules/leaveTypes/` (flat master-data aggregate,
identical shape to `designations/`) and `src/modules/leave/` (two
repositories - `leaveRequest.repository.js`, `leaveBalance.repository.js`
- one orchestrating `leave.service.js`, mirroring Holiday Calendar's
two-repositories-one-service shape). 15 new endpoints total: 5 for
`/leave-types` (full CRUD), 6 for `/leave-requests`
(create/list/get/approve/reject/cancel), 3 for `/leave-balances`
(list/get/adjust) plus `GET /leave-requests` and `GET /leave-balances`
diverging from Attendance's any-only list precedent - auto-scoped to the
caller's own `employeeId` without `:read:any`, since viewing your own
leave history is a core self-service need, not a nice-to-have. Migration
was purely additive (three new tables, two new FKs onto `Employee`,
`onDelete: Cascade` on both, mirroring `EmployeeDocument`/
`AttendanceRecord`'s precedent) - no expand/backfill/contract needed
since this is wholly new ground.

New `leaveType.service.test.js` (5 tests) and `leave.service.test.js` (12
tests: request creation + overlap rejection, inactive-leaveTypeId
rejection, manager-approves-own-report-only authorization, holiday/
week-off-excluded duration computed against a real 7-day range verified
programmatically rather than assuming calendar alignment, insufficient-
balance rejection, reject-only-when-pending, the full cancel matrix
(pending/future-approved/already-started), both list/get ownership
scoping, the hire-year proration formula across before/during/after the
hire year, the admin balance-adjustment escape hatch, and the new
Attendance `ON_LEAVE` integration end-to-end). All 69 tests across all
eight domains pass together.

Verified live end-to-end against the running server with four scratch
users (ADMIN, MANAGER, EMPLOYEE, and a second unrelated EMPLOYEE) and a
real manager-report relationship: LeaveType CRUD and its EMPLOYEE-403,
leave application and overlap-409, a MANAGER correctly blocked from
approving a non-report's request then correctly approving their own
report's (duration computed as 3 chargeable days, no branch/shift
assigned), the balance reflecting the deduction, `GET /attendance/
effective-status` resolving `ON_LEAVE` for a covered date, cancellation
restoring both the balance and the effective status back to `ABSENT`,
the ADMIN manual balance-adjustment escape hatch, and delete-blocked-
while-referenced on the LeaveType. All live-verification fixtures cleaned
up afterward.

`docs/domain-leave.md` (ADR-LV01-06 implementation confirmed, new
ADR-LV07/LV08 added, confidence 83%→87%), `docs/domain-attendance.md`
(ADR-AT03 marked fully implemented, confidence 85%→88%),
`docs/adr-index.md`, `docs/deferred-decisions-register.md` updated.
`handbook/API_ENDPOINTS.md` gained new endpoint docs for `/leave-types`,
`/leave-requests`, and `/leave-balances` (delegated to a background agent
given the expected size, then verified). `backend/README.md` updated to
match.

Deliberately **backend-only**, same as every prior domain.)_

_(Payroll Domain — 2026-09-15, on branch `feature/23-payroll-domain` (based
on `feature/22-leave-domain`). Ninth domain from the HRMS/ERP Business
Architecture Review (`docs/domain-payroll.md`) - the domain every prior
domain in this review was building toward: given an employee's base
salary, attendance record, and approved leave, what did they actually
earn this period, and what is the permanent record of that calculation.

**One genuinely blocking open question, resolved with the user as
stakeholder before writing any code:** the domain doc's own ADR-PR05
named the salary-period-unit assumption (monthly vs. annual vs. other) as
requiring real stakeholder confirmation, not an architectural judgment
call - unlike Leave's proration formula, the doc deliberately declined to
recommend an answer. Confirmed: monthly. `PayrollRun` is keyed on
`(periodMonth, periodYear)`.

**Two aggregates, `PayrollRun` and `Payslip`, plus a generic
`PayslipLineItem` child (ADR-PR01/PR03):** `DRAFT → PROCESSING →
FINALIZED → PAID`. Processing generates exactly one `Payslip` per active
Employee in the same step (`docs/domain-payroll.md` §2's own wording) -
there is no separate "generate" action. A `Payslip` has no edit endpoint
at any status, not just once `FINALIZED` - the domain's central
immutability rule (ADR-PR01) is enforced by the absence of a `PATCH`
route entirely, not a guarded one.

**Every input is snapshotted at generation time (ADR-PR02)** - salary,
department/designation/branch names, employment type, and the computed
attendance/leave outcome for the period. This is the direct, concrete
cost of Branch/Department/Designation's earlier "single current value, no
history" decisions (ADR-B03/ADR-D03/ADR-DS03) finally surfacing, exactly
as those domains' own docs anticipated three domains ago - a January
Payslip must not silently show February's department if an employee
transferred mid-month. `employeeName` comes from `Employee.user.name` and
is nullable, since `Employee.userId` is itself optional - a pre-existing
identity-model gap, not something this domain introduces.

**The calculation reuses Attendance's own coordinating service directly,
not a third re-derivation of Shift/Holiday-Calendar logic:** for every
calendar day in the period, `payrollService` calls
`attendanceService.getEffectiveStatus()` - the same function Attendance's
own endpoints and Leave's `ON_LEAVE` integration already call.
`HOLIDAY`/`WEEK_OFF` are excluded from the working-day denominator
entirely; `PRESENT`/`LATE` are paid (no lateness-pay deduction rule
exists anywhere in this project, so none was invented); `HALF_DAY` is
half paid, half unpaid; `ABSENT` is fully unpaid; `ON_LEAVE` is paid or
unpaid per that request's `LeaveType.isPaid`. No overtime line item -
`AttendanceRecord` has no overtime field or verified overtime-rate
concept anywhere in this project (only `checkIn`/`checkOut` timestamps),
so despite the domain doc's own passing mention of "overtime" as an
input, there was nothing verified to calculate it from.

**One small, additive touch to the already-shipped Leave domain,
flagged transparently:** Leave's own sign-off explicitly declined to
decide whether any leave types are unpaid, naming it "not decided here"
and handing the decision to Payroll (`docs/domain-leave.md` §2/§12).
Added `LeaveType.isPaid` (`Boolean @default(true)`, new ADR-LV09) - no
existing `LeaveType` rows existed to migrate, so this was a pure
forward-looking addition, not a data-migration decision. `leave.service.js`'s
`hasApprovedLeaveOnDate` now includes the `leaveType` relation so Payroll
can read `.isPaid` without a second query; Attendance's own consumer of
the same function is unaffected, since it only ever checked truthiness.

**A real race condition surfaced by testing, fixed as a genuine
production hardening, not a test workaround:** `processPayrollRun`
snapshots every active Employee once, then processes each one through
several slow, awaited cross-domain reads (up to 31 calendar days ×
Attendance + Leave lookups per employee). That snapshot-then-slowly-
process shape leaves a real window in which an employee could be
offboarded between the snapshot and their own turn - discovered when
running the full test suite (where `node --test`'s default cross-file
concurrency raced this exact scenario against other domains' test
cleanup). Fixed by skipping a since-deleted employee rather than failing
the entire run, and by moving the slow read/compute phase entirely
outside the database transaction that follows - only the actual writes
(run status, Payslips, line items, audit logs) are transactional, which
also sidesteps a real risk of exceeding Prisma's interactive-transaction
timeout for any realistic employee count.

**A real gap caught by the handbook-documentation agent's own source
verification, not by review:** `createPayrollRun` initially checked for
an existing period via a plain `findByPeriod` lookup before creating,
with no `try/catch` around the create transaction - unlike every other
create-with-uniqueness endpoint in this codebase (Branch, Department,
Designation, Shift, Holiday Calendar, LeaveType, Employee, Attendance all
wrap their create in a `P2002` catch as the defense-in-depth backstop
against the check-then-create race). Fixed to match that established
pattern before committing.

**Permission scoping (new ADR-PR06):** no dedicated Finance/Payroll role
exists in this system, so `PayrollRun` (create/read/process/finalize/
markPaid/delete) follows the `ADMIN`-only master-data pattern rather than
inventing a fourth system role without a verified requirement. `Payslip`
reads split own/any, mirroring Leave/Attendance - but `MANAGER` gets only
`payslip:read:own`, not `:read:any` over their reports, a deliberate
divergence from Leave's manager-visibility pattern since no verified
requirement extends pay visibility to managers and pay is materially more
sensitive than leave status. 8 new permissions (46 → 54 total).

New module `src/modules/payroll/` (two repositories -
`payrollRun.repository.js`, `payslip.repository.js` - one orchestrating
`payroll.service.js`, the same two-repositories-one-service shape as
Holiday Calendar and Leave). 9 new endpoints: 7 for `/payroll-runs`
(create/list/get/process/finalize/mark-paid/delete) and 2 for `/payslips`
(list/get). Migration was purely additive (2 enums, 3 tables, one new
additive column on the existing `LeaveType` table) - applied cleanly on
the first attempt.

New `payroll.service.test.js` (6 tests: run creation and period-
uniqueness, the full pay calculation across present/absent/half-day/
paid-leave/unpaid-leave in one deterministic scenario, the complete
lifecycle-guard matrix, DRAFT deletion, and both list/get Payslip
ownership scoping). All 75 tests across all nine domains pass together,
confirmed stable across three consecutive full-suite runs after the race
fix.

Verified live end-to-end against the running server with scratch ADMIN
and EMPLOYEE users: run creation and duplicate-period 409, EMPLOYEE
blocked from creating a run (403), processing generated a real Payslip
for every one of the 18 active employees in the dev database at the
time, the employee's own self-service payslip view, cross-employee
ownership enforcement (403), the full DRAFT→PROCESSING→FINALIZED→PAID
transition sequence with every out-of-order transition correctly
rejected (409), DRAFT-only deletion succeeding and a subsequent 404, and
`LeaveType.isPaid` both explicit and defaulted via `POST /leave-types`.
Audit log entries confirmed for every PayrollRun transition and all 18
generated Payslips. All live-verification fixtures cleaned up afterward.

`docs/domain-payroll.md` (ADR-PR01-06, salary-unit question resolved,
confidence 78%→90%), `docs/domain-leave.md` (new ADR-LV09, confidence
87%→88%), `docs/adr-index.md`, `docs/deferred-decisions-register.md`
updated. `handbook/API_ENDPOINTS.md` gained new endpoint docs for
`/payroll-runs` and `/payslips` (delegated to a background agent, then
verified). `backend/README.md` updated to match.

Deliberately **backend-only**, same as every prior domain.)_

_(Performance Domain — 2026-09-15, on branch `feature/24-performance-domain`
(based on `feature/23-payroll-domain`). Tenth domain from the HRMS/ERP
Business Architecture Review (`docs/domain-performance.md`). Unlike
Payroll, this domain's own sign-off named no genuinely blocking open
question - "Ready. No structural blockers," confidence 88% - so
implementation proceeded straight from recon to a plan, no stakeholder
question needed.

**Two aggregates, `ReviewCycle` (master data) and `PerformanceReview`
(this review's second explicit multi-party workflow after Leave), plus a
`ReviewAddendum` child (ADR-PF01):** `DRAFT → SUBMITTED → ACKNOWLEDGED`.
`reviewerId` is resolved from `Employee.managerId` and stored at creation
time (ADR-PF02) - not a live join, so a later manager change never
retroactively rewrites who authored a past review. When the target
employee has no manager, `ADMIN` must supply `reviewerId` explicitly,
since (unlike Leave's `decide:any`) it's a stored, mandatory column, not
a pure authorization check.

**Org-context snapshot taken at Submit specifically, per the domain doc's
own explicit wording (ADR-PF03)** - not at creation, since a Draft
review's organizational context isn't yet meaningful. Same underlying
insight as Payroll's ADR-PR02, calibrated to a lower enforcement level
appropriate to a personnel record, not a financial one.

**Judgment call, flagged:** `PATCH` (editing rating/comments) is
restricted to `DRAFT` only, not also `SUBMITTED` - a deliberately
stricter, simpler-to-reason-about checkpoint than the domain doc's own
looser wording technically permits. Once `SUBMITTED`, further correction
goes through addenda instead, giving "Submitted" real meaning.

**Judgment call, flagged:** `rating` is a closed 5-value categorical enum
(`OUTSTANDING` down to `UNSATISFACTORY`) rather than numeric - the domain
doc allows either without mandating one; a closed enum needs no separate
range-validation logic, mirroring `EmploymentType`'s precedent.

**Both `employeeId` and `reviewerId` on `PerformanceReview` use
`Restrict`, not Attendance/Leave's `Cascade`** - the domain doc itself
analogizes Acknowledgement to Payroll's finalization rule ("a
lighter-weight echo"), so this is treated as a personnel record with
retention value, like a Payslip, not a pure operational fact.

**Permission model (new ADR-PF05) splits three ways, the most granular
authority shape in this review yet:** authoring (`performanceReview:
create:reports`/`:create:any`, extending Leave's manager-plus-admin-
fallback shape from creation itself, not just a decision on an existing
record), lifecycle management (`manage:reports`/`manage:any`, covering
edit-while-Draft/submit/delete-while-Draft together, rather than a
separate permission per verb), and the reviewed employee's own actions
(`read:own`, `acknowledge:own`, `selfAssess:own`). 12 new permissions
(54 → 66 total). Addenda need no dedicated permission at all (new
ADR-PF06) - gated by whichever read/manage permission already grants
access to that specific review, avoiding a 13th key for a lightweight,
always-available action.

New modules `src/modules/reviewCycles/` (identical shape to
`leaveTypes/`) and `src/modules/performance/` (one repository, one
orchestrating service, mirroring Holiday Calendar/Leave/Payroll's shape).
13 new endpoints: 5 for `/review-cycles` (full CRUD) and 9 for
`/performance-reviews` (create/list/get/update/submit/self-assessment/
acknowledge/delete/addenda). List/get scoping extends Leave's own/any
shape with a third OR-branch for a manager's reports. Migration was
purely additive (3 enums, 3 tables) - applied cleanly on the first
attempt.

New `reviewCycle.service.test.js` (5 tests) and `performance.service.test.js`
(8 tests: manager-vs-non-report authoring authority, duplicate/closed-
cycle rejection, the no-manager explicit-reviewerId requirement, the
Draft-only PATCH guard plus the submit validation gate and org-context
snapshot verified against real Branch/Department/Designation names,
the self-assessment window and the employee-only acknowledge action,
addenda appendable by reviewer/employee/ADMIN but not a stranger, and
own/reports-scoped listing). All 88 tests across all ten domains pass
together, confirmed stable across repeated runs.

Verified live end-to-end against the running server with four scratch
users (ADMIN, MANAGER, their real report, and an unrelated EMPLOYEE):
cycle creation and MANAGER correctly blocked (403), a MANAGER creating a
review for their own report but blocked from an unrelated employee
(403), the submit-validation 400 before rating/comments are set, the
org-context snapshot appearing only after submit (verified against the
real Department/Designation names), self-assessment, the stranger-
blocked/employee-succeeds acknowledge action, PATCH and self-assessment
both correctly rejected (409) once Acknowledged, addenda from the
reviewer and the reviewed employee succeeding while a stranger's is
rejected (403), addenda embedded in `GET .../:id`, list correctly
returning empty for an uninvolved employee, and the referenced-cycle
delete-block (409). Audit log entries confirmed for every mutation. All
scratch data cleaned up afterward.

`docs/domain-performance.md` (ADR-PF01-06, confidence 88%→92%),
`docs/adr-index.md`, `docs/deferred-decisions-register.md` updated.
`handbook/API_ENDPOINTS.md` gained new endpoint docs for `/review-cycles`
and `/performance-reviews` (delegated to a background agent, then
verified). `backend/README.md` updated to match.

Deliberately **backend-only**, same as every prior domain.)_

_(Recruitment Domain — 2026-09-16, on branch `feature/25-recruitment-domain`
(based on `feature/24-performance-domain`). Eleventh domain from the
HRMS/ERP Business Architecture Review (`docs/domain-recruitment.md`), and
by far the largest yet: five coordinated aggregates (`JobRequisition`,
`Candidate`, `Application`, `Interview`, `Offer`) plus a real cross-domain
infrastructure gap closed along the way.

**Critical recon finding, not invented by this domain:** `docs/domain-
recruitment.md`'s own ADR-RC03 assumed Recruitment could invoke "Identity's
existing, unmodified employee-creation process" for the Hire step. That
process - as Identity's own sign-off describes it (§2's Onboarding diagram:
search-by-email → reuse-or-create User → link) - did not exist in code.
`docs/domain-identity-employee-lifecycle.md` itself recorded this as "a new
module, not yet built" (ADR-004). Recruitment's Hire Orchestration Service
had no real target to call. Built it: new module
`src/modules/employeeOnboarding/employeeOnboarding.service.js`, narrowly
scoped to onboarding only (the "one service or two, covering onboarding
*and* offboarding" question, ADR-004 §5, stays genuinely open - offboarding
was not touched, it stays exactly where ADR-006 already put it in
`employee.service.js`). Every invariant from Identity's §3 is honored:
search-by-email first, access provisioning optional and explicit
(`provisionAccess` defaults to `false`, matching the asymmetric-defaults
principle), and the User reuse/creation plus Employee creation run inside
one transaction so a partial failure can never leave a half-linked state.
No invite-email mechanism exists anywhere in this project (still verified
true), so a genuinely new hire's initial credential is an admin-supplied
`initialPassword` at hire time - required only when no existing User
matches the candidate's email, never when reusing one (the Rehire Strategy
path). `employeeService.createEmployee` gained an additive optional
trailing `tx` parameter so it can participate in a caller-supplied
transaction; every existing caller is unaffected. Both
`docs/domain-identity-employee-lifecycle.md` (ADR-004) and
`docs/domain-recruitment.md` (ADR-RC03) were updated to record this as a
real implementation, not a redesign of either domain's already-accepted
decisions.

**Schema:** `JobRequisition` mirrors Employee's own four axes
(department/designation mandatory, branch optional, reusing the existing
`EmploymentType` enum rather than inventing one) with a guarded
`OPEN→ON_HOLD→CLOSED|CANCELLED` state machine - `CLOSED` is deliberately
unreachable through the manual status endpoint, set only by the system
when `remainingOpenings` hits zero via a single atomic guarded `UPDATE`
(`WHERE status='OPEN' AND remainingOpenings>0`), not a read-then-write a
race could slip between. `Candidate` is explicitly not a `User` (ADR-RC02,
already-accepted) - no email uniqueness constraint (a recruiter, not the
schema, prevents accidental duplicates) and a real *hard* delete, unlike
Employee's soft-delete, gated on zero Application references - this does
not resolve the still-genuinely-open Candidate PII-retention question
(ADR-RC04), which remains deferred to legal/compliance input, not decided
unilaterally here. `Application` carries a guarded state machine too:
`APPLIED→SCREENING→INTERVIEW→OFFER` strictly sequential (no skipping),
`REJECTED`/`WITHDRAWN` reachable from any non-terminal stage, `HIRED`
deliberately unreachable except through the dedicated hire action so its
onboarding side-effect always fires. `Offer`'s one-Pending-per-Application
invariant is enforced by a partial unique index (`WHERE status='PENDING'`)
- the same mechanism as Employee's own `userId` uniqueness and Payroll's
duplicate-period guard, not a service-layer-only check.

**Judgment call, flagged:** `hireApplication` derives the new Employee's
`dateOfJoining` from the Accepted Offer's own `startDate`, never a second
caller-supplied value that could disagree with what the candidate actually
accepted.

**Judgment call, flagged:** permission scoping (new ADR-RC05) resolved
`ADMIN`-only across every aggregate, not an own/any split - unlike Leave/
Payroll/Performance, no Recruitment aggregate has a natural "own" concept
(Candidate isn't even a `User`). Inventing a dedicated Recruiter/HR role
was rejected as speculative - no verified requirement demands one. 12 new
permission keys (66→78 total); `application:hire` deliberately kept
distinct from `application:update` since it triggers real Employee/User
creation, a materially bigger consequence than a status PATCH.

New module `src/modules/recruitment/` (`jobRequisition.*`, `candidate.*`,
`candidateDocument.*` mirroring `employeeDocument.*`'s exact Cloudinary
shape, and `application.*` hosting Application/Interview/Offer/Hire
together, the same multi-aggregate-per-file shape Payroll used for
PayrollRun/Payslip) plus the new `employeeOnboarding/` module. 27
endpoints across 17 paths - the largest single domain in this review by a
wide margin, matching the doc's own five-aggregate scope.

New `jobRequisition.service.test.js` (5 tests), `candidate.service.test.js`
(4 tests), and `application.service.test.js` (7 tests, including the full
hire flow: no-access-provisioning creating an unlinked Employee, openings
decrement and auto-close, a second hire correctly blocked once exhausted,
the new-User-creation path with role assignment verified, and the
reuse-existing-User rehire path). 104 tests total across all eleven
domains pass together, confirmed stable across three consecutive runs.

Verified live end-to-end against the running server: the full pipeline
(requisition → candidate → application → status transitions, including the
skip-a-stage 409 guard → interview scheduling and feedback → offer
creation, the duplicate-Pending 409 guard, acceptance → hire), confirming
the requisition auto-closed at zero openings, and - the strongest possible
verification - the newly onboarded hire successfully logging in via the
real `/auth/login` endpoint with the admin-supplied initial password,
proving the onboarding path works through the actual auth system, not just
directly against the database. Permission enforcement confirmed (403 for
a non-ADMIN role). Audit log entries confirmed for every mutation across
all five entity types. All scratch data cleaned up afterward.

`docs/domain-recruitment.md` (ADR-RC01-05, confidence 85%→92%),
`docs/domain-identity-employee-lifecycle.md` (ADR-004 onboarding half
marked Implemented, confidence 87%→90%), `docs/adr-index.md`,
`docs/deferred-decisions-register.md` updated. `handbook/API_ENDPOINTS.md`
gained new endpoint docs for `/job-requisitions`, `/candidates`, and
`/applications` (delegated to a background agent, then verified).
`backend/README.md` updated to match.

Deliberately **backend-only**, same as every prior domain.)_

_(Training Domain — 2026-09-16, on branch `feature/26-training-domain`
(based on `feature/25-recruitment-domain`). Twelfth domain from the
HRMS/ERP Business Architecture Review (`docs/domain-training.md`) - a
smaller, two-aggregate domain after Recruitment's five, with no genuinely
blocking open question ("Ready. No structural blockers," confidence 87%).

`TrainingProgram` (master data, same `ACTIVE`/`INACTIVE` lifecycle shape as
Branch/Department/LeaveType) and `Enrollment` (a per-attempt historical
record, deliberately **repeatable** - unlike Branch/Department/
Designation/Shift's single-current-value axes, retaking or renewing
training is normal and expected, so no uniqueness constraint exists on
`(employeeId, trainingProgramId)`, a deliberate divergence the domain doc
itself calls out and argues for explicitly). `Enrollment.status` is a
guarded state machine (`ENROLLED → IN_PROGRESS → COMPLETED | FAILED`
strictly sequential, no skipping, the same convention as every other
workflow aggregate in this review) with `WITHDRAWN` reachable from either
non-terminal stage.

**Judgment call, flagged:** the domain doc's own lifecycle diagram doesn't
fully specify whether `WITHDRAWN` branches only off `IN_PROGRESS` or off
`ENROLLED` too - implemented as reachable from either, the more realistic
reading ("you can withdraw before ever starting").

**A real business rule, not a judgment call - directly from the domain
doc's own wording (§2):** self-enrollment (`enrollment:create:own`) is
rejected (400) against a `mandatory: true` program. Mandatory-program
enrollment must go through `enrollment:create:any` (`ADMIN`/HR).

**Compliance status is computed on read, never stored (ADR-TR02)** -
reuses Attendance's ADR-AT03 principle exactly. `enrollmentService.
getComplianceStatus(employeeId, trainingProgramId)` finds the most recent
`COMPLETED` enrollment and checks `completedAt + renewalPeriodDays`
against now; absent `renewalPeriodDays` means compliant indefinitely once
completed once. A bulk variant composes this across every mandatory,
`ACTIVE` program for one employee - the minimal shape the domain doc's own
"who consumes: compliance reporting" line implies, exposed via a single
`GET /training-compliance` endpoint (single-program via a query param, or
a bulk report when omitted) rather than two separate endpoints.

**Permission model (new ADR-TR04):** `TrainingProgram` follows the
`ADMIN`-only-mutation master-data pattern; `Enrollment` splits authoring
(`create:own`/`create:any`), visibility (`read:own`/`read:any`, the same
auto-scoped-list pattern `GET /leave-requests` established), lifecycle
management (`manage:any` - the *only* path to `IN_PROGRESS`/`COMPLETED`/
`FAILED`, since self-attested completion would undermine compliance
tracking's whole point), and self-service withdrawal (`withdraw:own`).
Deliberately **no `MANAGER` reports-visibility** - a real divergence from
Leave/Performance, since the domain doc's own "who performs" text never
mentions managers at all, only `ADMIN`/HR and self-enrollment; not
invented with no textual basis. `Enrollment.delete` (`manage:any`,
unrestricted by status) mirrors Attendance's own unrestricted-delete
precedent - compliance data that sometimes needs outright correction, not
just a workflow-transition-only model. 10 new permissions (78 → 88 total).

New module `src/modules/training/` (`trainingProgram.*` mirroring Shift/
LeaveType exactly, `enrollment.*` hosting the workflow/compliance logic,
`enrollmentDocument.*` mirroring Employee/Candidate document uploads
exactly, including the own/any ownership check `EmployeeDocument`'s own
upload/list/delete already established). 14 endpoints across 8 paths.

New `trainingProgram.service.test.js` (5 tests) and `enrollment.service.
test.js` (4 tests, covering the mandatory-program self-enroll rejection,
the full sequential-transition guard including the manage:any-vs-
withdraw:own split, own/any list and get scoping, and all four compliance
calculation cases - never-completed, completed-and-current, completed-
but-expired, and no-expiry). 113 tests total across all twelve domains
pass together, confirmed stable across three consecutive runs.

Verified live end-to-end against the running server: an employee
self-enrolling in an optional program (succeeds) and being blocked from
self-enrolling in a mandatory one (400), an ADMIN enrolling that employee
in the mandatory program, the employee correctly blocked (403) from
self-marking it `COMPLETED`, ADMIN progressing it through
`IN_PROGRESS → COMPLETED` with a score, the employee's own compliance
query correctly showing compliant with a computed `expiresAt` (both the
single-program and bulk-report shapes), a stranger employee correctly
blocked (403) from viewing someone else's compliance, and self-withdrawal
of the optional enrollment succeeding. Audit log entries confirmed for
every mutation across both entity types. All scratch data cleaned up
afterward.

`docs/domain-training.md` (ADR-TR01-04, confidence 87%→92%),
`docs/adr-index.md`, `docs/deferred-decisions-register.md` updated.
`handbook/API_ENDPOINTS.md` gained new endpoint docs for
`/training-programs`, `/enrollments`, and `/training-compliance`
(delegated to a background agent, then verified). `backend/README.md`
updated to match.

Deliberately **backend-only**, same as every prior domain.)_

_(Asset Management Domain — 2026-09-22, on branch `feature/27-asset-management-domain` (based on `main`, which by then contained all twelve prior domains). `docs/domain-asset-management.md` (ADR-AM01-06) implemented as two aggregates. `Asset` is minimal — tag (case-insensitively unique), type, description, status `AVAILABLE`/`ASSIGNED`/`UNDER_REPAIR`/`RETIRED` — with no financial fields (ADR-AM04, still deferred). `AssetAssignment` is an **append-only custody ledger**, built now unlike Branch/Department/Designation's deferred history: rows are never deleted, and the only update is closing one (`returnedAt`/`returnedBy`/`returnCondition`/`returnNotes`, via a `returnedAt IS NULL`-guarded `updateMany`). Both FKs are `onDelete: Restrict`.

No missing infrastructure this time — assignment only needs `employeeRepository` (existence) and the Prisma client.

The one-active-assignment-per-asset invariant (ADR-AM02) is enforced in three layers: `assertAssetAssignable` (positive allowlist, only `AVAILABLE`, ADR-AM03), a compare-and-set on `Asset.status` (`updateMany where { id, status }`, count 0 means another request won), and a **hand-added partial unique index** `AssetAssignment_assetId_active_key ON "AssetAssignment"("assetId") WHERE "returnedAt" IS NULL` in the migration SQL (same mechanism as `Employee.userId`), with a `P2002` catch as the backstop. An asset with any assignment history cannot be hard-deleted (`countAssignmentsForAsset` counts returned rows too) — retire it instead.

Judgment calls, flagged. **Permissions (ADR-AM05):** the doc's "IT role vs. `ADMIN`" question resolves to flat `ADMIN`-only for `Asset` CRUD and assign/return (no IT role exists and no aggregate has a natural "own" concept for mutations), with one deliberate exception, `assetAssignment:read:own` (ADMIN/MANAGER/EMPLOYEE), so people can see the assets they hold; `GET /asset-assignments` auto-scopes a caller lacking `:read:any` to their own employee record, and reads include the `Asset` row. Deliberately no `MANAGER` reports-visibility (the doc never mentions managers). 8 new permissions (88 → 96). **Return condition and transitions (ADR-AM06):** the doc says where a returned asset goes is "a judgment call made at return time, not automatic", so `POST /assets/:id/return` takes a required `condition` (`GOOD` → `AVAILABLE`, `DAMAGED` → `UNDER_REPAIR`) plus optional notes; direct `PATCH` status changes are limited to `AVAILABLE`↔`UNDER_REPAIR` and either → `RETIRED`, `ASSIGNED` is entered only by assigning and left only by returning, `RETIRED` is terminal; `assignedAt` may be back-dated but never future. Assign and return each write the ledger change, the asset status change and two `AuditLog` rows in one transaction. `assetAssignmentService.getCurrentHolder`/`getActiveAssignmentsForEmployee` are the two reusable queries Exit Management is expected to consume. The `active` list filter is a `'true'|'false'` string enum rather than `z.coerce.boolean()`, which would treat the string `'false'` as `true`.

New module `src/modules/assets/` (`asset.*` and `assetAssignment.*`, mirroring Training's shape; assign/return/current-holder/history routes live on the `/assets` router, custody reads on `/asset-assignments`). 11 endpoints across 2 paths (handbook numbers 133-143). `asset.service.test.js` adds 11 tests (duplicate-tag, list filters, status-transition guards, assign/non-`AVAILABLE` rejections, the DB partial unique index rejecting a second active row directly, two concurrent assigns yielding exactly one, return `GOOD`/`DAMAGED` with history kept and reassignment, the two Exit-Management queries, delete-only-if-never-assigned, own/any read scoping, audit rows). 124 tests total across all thirteen domains pass together, confirmed stable across repeated consecutive runs.

**Bugs found and fixed.** (1) *Live verification* caught a real defect the service-level tests could not: the new list controllers read `req.query`, but `validateMiddleware` puts the coerced result on `req.validatedQuery` (Express 5's `req.query` has no setter), so every list endpoint returned 500 in the running server while the service tests passed. Fixed to `req.validatedQuery`. (2) *The handbook verification pass* found two real defects in the new code, both fixed: `PATCH /assets/:id` read the asset outside the transaction and wrote status with a plain `update`, so a concurrent `assign` could be silently overwritten (leaving an active ledger row on a non-`ASSIGNED` asset that a later return would 409 on) — status changes are now a compare-and-set inside the transaction (`409 "This asset was modified concurrently - reload it and retry"`); and `DELETE /assets/:id` could surface an uncaught Prisma `P2003` as a 500 if an assignment landed between the count and the delete — now caught and mapped to the same 409 as the guard. The handbook's endpoint 136/137 sections were corrected to match. Minor findings deliberately left as-is: `Asset_assetTag_key` is case-sensitive at the DB level (the service check is case-insensitive, same convention as prior domains), an empty/same-status `PATCH` writes a no-op audit row, and `afterData` in assign/return audit snapshots carries a stale `updatedAt`.

**Pre-existing issue surfaced, NOT fixed here (outside this domain):** the same `req.query`-vs-`req.validatedQuery` mistake exists in the already-merged Recruitment and Training controllers — `GET /job-requisitions`, `/candidates`, `/applications`, `/training-programs` and `/enrollments` return 500 against the running server (confirmed live 2026-09-22), and `GET /training-compliance` reads `req.query` directly, skipping validation. Their service tests pass because they call the service directly. Recommended as a small follow-up fix.

Verified live end-to-end against the running server: asset registration and duplicate-tag rejection, assignment, re-assignment of an `ASSIGNED` asset correctly refused (400), current-holder lookup, an employee correctly denied (403) on create/assign/history but seeing only their own assignments (and still scoped when passing another employee's `employeeId`), `PATCH`-while-assigned and delete-with-history both refused (409), return `DAMAGED` moving the asset to `UNDER_REPAIR`, double-return refused (409), `UNDER_REPAIR` → `AVAILABLE` → `RETIRED`, assignment of a `RETIRED` asset refused, full history, and `active=true|false` list filters. `AuditLog` rows confirmed for every mutation (`Asset` CREATE ×1 and UPDATE ×4; `AssetAssignment` CREATE ×1 and UPDATE ×1). All scratch data cleaned up afterward.

`docs/domain-asset-management.md` (ADR-AM01-04 implemented, new ADR-AM05/AM06, confidence 89%→94%), `docs/adr-index.md`, `docs/deferred-decisions-register.md` updated. `handbook/API_ENDPOINTS.md` gained endpoints 133-143 (delegated to a background agent, then verified and corrected). `backend/README.md` updated to match.

Deliberately **backend-only**, same as every prior domain.)_

_(Follow-up fix — 2026-09-22, same branch. The pre-existing `req.query` vs `req.validatedQuery` defect noted at the end of the Asset Management entry above is fixed: `application`, `candidate`, `jobRequisition`, `trainingProgram` and `enrollment` controllers (list endpoints, plus `GET /training-compliance`'s read of its validated params) now read `req.validatedQuery`, matching every earlier domain. `grep req.query` over all controllers is now empty. Verified live against the running server — every affected list endpoint returns 200 with the correct `pagination` shape (defaults and explicit `limit`/`sortBy`/`order`), and `/training-compliance` returns 200; scratch user cleaned up. 124 tests pass across repeated runs, lint silent. No service-test coverage existed for this class of bug because tests call services directly and bypass controllers — live verification of list endpoints remains the only guard.)_

_(Offboarding Revokes Access by Default (ADR-006) — 2026-09-13, on branch
`security/offboarding-access-revocation`. Not a numbered feature; closes a
real, named security gap surfaced by the separately-maintained
`docs/domain-identity-employee-lifecycle.md` business-architecture review:
`softDeleteEmployee` soft-deleted the `Employee` row and wrote its audit
log, but made zero calls into `User`-related logic, so an offboarded
employee's existing access token and refresh token both remained fully
valid. Full reconnaissance → plan → approval cycle held with the user
first, including one flagged-and-resolved fork: the plan's one open
question (immediate session-kill vs. refresh-token-only revocation)
turned out not to need the user's input at all — investigating the
existing token code first revealed `User.tokensValidAfter` and
`authMiddleware`'s `iat` check (added for `logout()`'s multi-tab gap)
already give exactly the "kill everything outstanding, right now"
guarantee; the only real gap was that `RefreshToken` had no bulk revoke,
only revoke-by-id.

Implementation: `refreshToken.repository.js` gained
`revokeAllForUser(userId)` (an `updateMany` scoped to that user's
non-revoked tokens). `employee.service.js`'s `softDeleteEmployee`, inside
its existing transaction, now calls
`userRepository.invalidateTokensIssuedBefore` and the new
`revokeAllForUser` whenever the employee has a linked `userId` — a no-op,
by design, for employees with none. No schema migration was needed; both
underlying columns already existed. Deliberately scoped to revoking
*existing* access only, not preventing a *fresh* re-login — that half
requires resurrecting the still-deferred ADR-007 (`User` account status),
which this pass intentionally left alone since nothing here created a new
verified requirement for it.

This also seeded the project's first automated test: `package.json`'s
`test` script had been the default `npm init` stub since day one (verified
— no test framework was installed at all). Rather than pick a framework
mid-feature, this was raised to the user explicitly; the user chose
Node's built-in `node:test` runner (zero new dependencies) over adding
Jest. `employee.service.test.js` is a real integration test — it runs
against the actual dev database (no test-DB isolation infra exists yet,
so fixtures are created with unique emails and fully cleaned up in an
`after()` hook, the same discipline `handbook/TESTING_GUIDE.md` already
uses for manual runs) and proves, end-to-end: a pre-offboarding access
token is rejected by the real `authMiddleware` on its next request; a
pre-offboarding refresh token is rejected by the real `authService.refresh`;
and offboarding an employee with no linked user does not throw. Verified
live: all three tests pass against the real dev database, confirmed zero
leftover rows afterward, `npm run lint` and `prettier --check` clean.

`docs/domain-identity-employee-lifecycle.md`'s ADR-006 (and its Challenge
This Design / Final Sign-off sections), `docs/adr-index.md`, and
`docs/deferred-decisions-register.md` updated to mark ADR-006 implemented
— ADR-007 explicitly left as still deferred in all three, not silently
resolved. No endpoint shape changed, so `handbook/API_ENDPOINTS.md` did
not need an update.)_

_(Exit Management Domain — 2026-09-22, on branch `feature/28-exit-management-domain` (based on `main`, which by then contained the other thirteen domains and the list-endpoint fix). `docs/domain-exit-management.md` (ADR-EM01-05, plus new EM06-08) implemented as the structural mirror of Recruitment: a rich pre-separation process, `ExitCase` with a child `ClearanceItem` checklist, surrounding Identity's minimal offboarding primitive. `ExitCase.status` is a guarded machine — `INITIATED → SEPARATED → COMPLETED`, `WITHDRAWN` only from `INITIATED` (after separation, reversal is a rehire, ADR-EM03). Cases are never deleted; at most one open (`INITIATED`/`SEPARATED`) case per employee via a service check plus a **hand-added partial unique index** `ExitCase_employeeId_open_key` in the migration SQL.

**Missing infrastructure discovered in recon, flagged prominently.** Identity's ADR-006 (offboarding revokes the linked account's access) was documented as "Implemented" but the code lived only on the unmerged local branch `security/offboarding-access-revocation` (commit `9a38bcd`, never pushed) — on `main`, `softDeleteEmployee` only soft-deleted and audited. Exit Management's whole security rationale (ADR-EM02) depends on that revocation, so the commit was **cherry-picked onto this branch as its own commit** (adapting its test fixture, which used the since-removed free-text `department`/`jobTitle` columns; conflicts were purely additive). `softDeleteEmployee` additionally gained an optional trailing `outerTx` parameter (the established trailing-transaction convention) so separation can be atomic; behavior is unchanged when it is omitted. Identity's ADR-007 (block *fresh* login) remains deferred, untouched.

Central decision (ADR-EM02): the primitive runs when `lastWorkingDay` arrives, never because clearance finished. The project has no scheduler (Leave notes the same), so the trigger is `POST /exit-cases/:id/separate` (refuses before the date) plus `POST /exit-cases/process-due`, a system-wide sweep a future cron can call (each due case in its own transaction, one failure never blocks the rest). Separation is one transaction: compare-and-set `INITIATED → SEPARATED` (which makes "exactly once" hold under concurrency), an asset-return sync, the unmodified `softDeleteEmployee` run inside that transaction, the `ACCESS_REVOCATION` item resolved, auto-completion if nothing is pending, and the audit row. If the Employee was already offboarded through the direct `DELETE /employees/:id`, the primitive is not called a second time. `lastWorkingDay` is a UTC calendar date; no per-branch timezone handling.

Judgment calls, flagged. **Permissions (ADR-EM06):** the doc's "narrower than `ADMIN`" question resolves to `ADMIN`-only for terminations and all management, since no HR role exists; employees hold `exitCase:create:own` (their own `RESIGNATION` only — a `TERMINATION` attempt is refused and any `employeeId` in the body is ignored), `exitCase:read:own` (list auto-scopes) and `exitCase:withdraw:own` (only before the last working day); no `MANAGER` reports-visibility. 6 new permissions (96 → 102). `ADMIN` may also withdraw a `TERMINATION` — a small extension of the doc's voluntary-only wording. **Clearance (ADR-EM08):** every case starts with an `ASSET_RETURN` item per asset the employee holds (read through Asset Management's `getActiveAssignmentsForEmployee`, never its ledger), `KNOWLEDGE_TRANSFER`, `FINAL_SETTLEMENT` and `ACCESS_REVOCATION`; an asset item cannot be `DONE` while Asset Management still shows it held (record the return there, or `WAIVED` with a mandatory reason for a lost asset); the last resolved item auto-completes a `SEPARATED` case. `eligibleForRehire`/`rehireNote` are stored as data only — nothing reads them yet, and none was invented. Final settlement is a manual clearance item; **nothing is written into Payroll**, and Leave's encashment policy (ADR-LV06) stays deferred, unresolved.

New module `src/modules/exit/` (`exitCase.*` and `clearanceItem.repository.js`). 9 endpoints under `/exit-cases` (handbook numbers 144-152). `exitCase.service.test.js` adds 15 tests; 142 tests total across all fourteen domains (including the 3 ADR-006 tests) pass together, confirmed stable across three consecutive runs.

**Bugs found and fixed before commit.** Handbook verification pass, all fixed with tests: `updateExitCase`/`addClearanceItem`/`updateClearanceItem` checked case status outside their transaction and two concurrent resolutions of the last two items could each miss the other (a lost completion) — they now row-lock the case (`SELECT ... FOR UPDATE`) and re-validate its current status inside the transaction; `separate` read held assets before its transaction (now inside it, via a new optional client argument on `getActiveAssignmentsForEmployee`); an asset returned then re-issued to the same employee never got a fresh clearance item (now only `PENDING`/`WAIVED` items suppress one, so a waived lost asset is not resurrected); `eligibleForRehire` could become impossible to record once a case auto-completed (a `COMPLETED` case now still accepts its rehire fields); `process-due` returned raw internal error text (now masked to `Internal Server Error` unless the error is operational); default checklist items had no stable order (now by type). Left as documented current behavior: separation fires from 00:00 UTC of the last working day itself (a design question for the user — the doc says the trigger is `lastWorkingDay` "arriving"), UTC-only "today", `PATCH` can move `lastWorkingDay` into the past, a `WAIVED` asset item leaves the asset `ASSIGNED` in Asset Management, no last-admin protection, and a sequential/unbounded sweep.

**Known gap surfaced, NOT fixed (outside this domain):** Payroll has no per-employee generation and `processPayrollRun` excludes soft-deleted employees, so an employee separated before a month's payroll run is processed silently gets no final partial-month Payslip. Recorded in ADR-EM05 and the deferred-decisions register as an additive Payroll follow-up.

Verified live end-to-end against the running server (twice — before and after the review fixes): an employee correctly refused (403) a `TERMINATION`, the past-date (400) and duplicate-open-case (409) refusals, a self-service resignation and withdrawal, withdrawal refused once the last working day arrived, own-scoped list, a stranger denied (403), an employee denied `separate`/`process-due`/`PATCH` (403), separating with no request body, the employee's pre-existing access token rejected (401) and zero live refresh tokens left after separation, the asset item refused `DONE` while held then accepted after the return was recorded in Asset Management, `WAIVED` without a reason refused (400), a concurrent last-two-items resolution completing the case, the rehire-fields-only rule on a `COMPLETED` case, an asset assigned after initiation picked up at separation, and the `process-due` sweep separating exactly the due case. `AuditLog` rows confirmed for every mutation across `ExitCase`, `ClearanceItem` and `Employee`. All scratch data cleaned up afterward.

`docs/domain-exit-management.md` (ADR-EM01-04 implemented, EM05 still deferred with the Payroll gap noted, new EM06-08, confidence 84%→89%), `docs/domain-identity-employee-lifecycle.md` (ADR-006 note corrected), `docs/adr-index.md`, `docs/deferred-decisions-register.md` updated. `handbook/API_ENDPOINTS.md` gained endpoints 144-152 (delegated to a background agent, then verified and corrected). `backend/README.md` updated to match.

Deliberately **backend-only**, same as every prior domain.)_

_(Refresh-Token Rotation Fix — 2026-09-24, directly on `main`. Found during the
frontend Designation work (2026-09-23): a full page load within about a second of
logging in bounced to `/login`. The backend error log showed
`Unique constraint failed on the fields: ("tokenHash")` from
`refreshTokenRepository.create()`, surfacing as `POST /auth/refresh` -> 500 and
then 401.

**Two root causes, both in the refresh path.** (1) A refresh token is a JWT of
`{ sub, roles }` plus `iat`/`exp`, and `iat` has one-second resolution with no
unique claim, so two refresh tokens issued for the same user in the same second
are byte-identical; their SHA-256 hashes collide on `RefreshToken.tokenHash`'s
unique constraint. (2) `refresh()` **revoked the old token first and issued the
new pair afterwards, with no transaction** - so when issuing failed the old token
was already burned and the same cookie then returned 401: the session was
destroyed, not merely interrupted. Reproduced deterministically before touching
code: two `signRefreshToken()` calls for one payload returned identical strings,
and through the API 6 of 6 "login, then refresh immediately" attempts returned
500 with the same cookie then returning 401; after a 1.5s pause it worked.
Beyond a reload right after login this also hit any two refreshes for one user in
the same second (e.g. two tabs).

**Fix (backend-only, no schema change, no API/Swagger change).**
`utils/jwt.js` - `signRefreshToken` adds `jwtid: crypto.randomUUID()`, so every
refresh token is unique (access tokens are never stored and are unchanged).
`refreshToken.repository.js` - `create(data, client)` now accepts a transaction
client, and a new `claimActiveByHash(tokenHash, client)` revokes a token only if
it is still active, in ONE `updateMany`, returning whether this call did it (two
concurrent refreshes race on the row lock and the loser re-evaluates the WHERE
against the winner's committed write, matching zero rows). `auth.service.js` -
`refresh()` now runs claim-then-issue inside one `prisma.$transaction`, so a
failure while issuing rolls the claim back and leaves the caller's session
untouched; `issueTokenPair(user, client = prisma)` threads the client through
(`register`/`login` keep the default, as before). The unique `jti` alone would
have removed an accidental guard - previously the second of two parallel
refreshes failed on the hash collision - which is why the atomic claim ships
with it: rotation is now genuinely single-use. Tokens issued before this change
carry no `jti` and keep verifying and rotating exactly as before, so existing
sessions are unaffected.

**Tests: 13 new** (the auth path had none). `utils/jwt.test.js` (5): consecutive
tokens differ, 200 tokens in one instant are all distinct, a UUID `jti` with the
original claims intact, the caller's payload is not mutated, access tokens
unchanged. `modules/auth/auth.service.test.js` (8, integration against the dev
DB with per-run fixtures cleaned up in `after`, same convention as the other
suites): refresh immediately after register and after login, five rotations in a
row, single-use (a rotated token is rejected), two parallel refreshes -> exactly
one wins and the other is `UnauthorizedError`, **a simulated failure while storing
the new token does not burn the old one** (`mock.method` on
`refreshTokenRepository.create`, then the original token still rotates), garbage
and never-stored tokens rejected, and logout revoking. **Mutation check**: three
deliberate breakages (remove `jwtid`; claim outside the transaction; drop the
`revoked: false` condition from the claim) failed 9 specs, every one an intended
guard; restored. Full backend suite 155/155, `eslint .` clean (it also caught an
unused import in my own new test, fixed).

**Live verification** (real server, temporary accounts): 6 of 6 "login, then
refresh immediately" attempts now return 200 with a new cookie (was 6/6 x 500);
the old cookie then returns 401 (single-use) and the NEW cookie still works (the
session survives); two parallel refreshes of one cookie -> exactly one 200 and
one 401; logout then refresh -> 401. And in a real browser (Playwright), reloading
`/departments`, `/branches` and `/designations` **immediately** after login - no
pause - now renders each page, where it used to bounce to `/login`.

**Considered, deliberately not done:** refresh-token *reuse detection* (revoking a
user's whole token family when a rotated token is replayed) - a legitimate
hardening, but a behaviour change with its own design questions (it would log out
a user whose second tab raced the first); `findValidByHash` is kept (logout still
uses it); no rate limiting was added.

**Separate finding, not fixed:** `attendance/attendance.service.test.js` creates
`Attendance Test Department/Designation <timestamp>` fixtures and never removes
them, so every full-suite run leaves one pair in the dev database - this is the
source of the ~70 leftover "Attendance Test ..." rows visible in the frontend's
Departments and Designations lists. My full-suite run added one pair, which I
deleted (unreferenced, identified by the run timestamp in the name).)_
