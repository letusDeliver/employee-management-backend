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
- [ ] JWT Access + Refresh Tokens
- [ ] RBAC (roles & permissions)
- [ ] Employee CRUD (Clean Architecture: controller/service/repository)
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
