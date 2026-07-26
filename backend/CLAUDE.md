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
