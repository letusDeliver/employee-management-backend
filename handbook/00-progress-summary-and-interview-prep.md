# Progress Summary & Interview Preparation (Features 1–7)

A cumulative overview of everything built so far, every real bug or
surprise encountered along the way, and a consolidated interview-prep
sheet spanning all seven completed features. Individual chapters go much
deeper on each topic — this document is the "zoom out" view meant to be
read in one sitting before an interview, or before starting Feature 8.

---

## Part 1: What We've Built So Far

### Feature-by-Feature Summary

| #   | Feature                               | What It Added                                                                                                                                                                                                                                         |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Project Setup & Folder Structure      | Git, ES Modules `package.json`, ESLint (flat config) + Prettier, feature-first `src/` skeleton (`modules/{auth,users,employees}`, `middlewares/`, `errors/`, `utils/`, `routes/`, `docs/`, `config/`), `prisma/` and `logs/` reserved, `.env.example` |
| 2   | Express App Bootstrap                 | `express@5`, `helmet`, `cors`, `morgan`; typed error hierarchy (`AppError` + 5 subclasses); `asyncHandler`; `notFound`/`error` middleware; `GET /health`; `app.js`/`server.js` with graceful shutdown                                                 |
| 3   | PostgreSQL + Prisma Setup             | `prisma@7`, `@prisma/client`, `@prisma/adapter-pg`; `prisma.config.js`; `config/database.js` singleton; `ServiceUnavailableError` (503); `GET /ready`; dedicated least-privilege DB role                                                              |
| 4   | Environment Config & Validation (Zod) | `config/env.js` — single validated, frozen source of truth for `process.env`, fail-fast at boot                                                                                                                                                       |
| 5   | Logging (Winston)                     | `config/logger.js` — leveled, environment-aware logging; Morgan piped through it; retired all remaining `console.*` calls                                                                                                                             |
| 6   | User Model & Auth (Register/Login)    | First real Prisma model (`User`); first full Controller→Service→Repository slice; `validate.middleware.js`; enumeration-safe, timing-attack-resistant login                                                                                           |
| 7   | JWT Access + Refresh Tokens           | `utils/jwt.js`; `RefreshToken` model (hashed, rotating); `auth.middleware.js`; `/refresh`, `/logout`, `/me`                                                                                                                                           |

### Current Architecture, End to End

```
HTTP Request
    ↓
helmet → cors → morgan(→logger.http) → cookieParser → express.json()
    ↓
Route (routes/index.js → modules/auth/auth.routes.js)
    ↓
validateMiddleware (Zod)  /  authMiddleware (JWT, where protected)
    ↓
Controller (auth.controller.js)  — thin, shapes responses, sets cookies
    ↓
Service (auth.service.js)  — hashing, token issuance/rotation, business rules
    ↓
Repository (user.repository.js / refreshToken.repository.js)  — Prisma only
    ↓
PostgreSQL  (User, RefreshToken tables)
```

Every request that fails, at any layer, funnels through the same
`notFoundMiddleware`/`errorMiddleware` pair from Feature 2 — operational
errors (`AppError` subclasses) get their real status/message and a `warn`
log; anything unexpected becomes a generic `500` and an `error` log with
full stack.

### What Currently Exists, Concretely

- **Endpoints**: `GET /health`, `GET /ready`, `POST /auth/register`,
  `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
  `GET /auth/me`.
- **Database tables**: `User` (id, email, password hash, name, role enum,
  timestamps), `RefreshToken` (id, tokenHash, userId, expiresAt, revoked).
- **Config**: `config/env.js` (Zod-validated), `config/database.js`
  (Prisma singleton), `config/logger.js` (Winston singleton).
- **Cross-cutting**: `AppError` hierarchy (6 subclasses), `asyncHandler`,
  `validate.middleware.js`, `auth.middleware.js`.
- **Docs**: this handbook (7 chapters + this summary), a `planning/`
  action-plan doc per feature, `CLAUDE.md`'s running progress log.

### Still To Come (per `CLAUDE.md`'s roadmap)

RBAC (roles & permissions) → Employee CRUD → File uploads (Multer +
Cloudinary) → Swagger docs → Dockerization → Testing strategy.

---

## Part 2: Errors & Issues Encountered

A recurring theme this project: **verify a library's actual behavior in a
disposable scratch script before writing real code against it.** Several
of the entries below were caught _because_ of that habit; a couple were
caught only after they broke something, which is itself the argument for
doing the habit more consistently.

| #   | Feature | Issue                                                                                                         | Root Cause                                                                                                                                        | Resolution                                                                                                                                                              |
| --- | ------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 2       | Installed `express@5`, not the `express@4` the original theory assumed                                        | `npm install express` resolves to latest; Express 5 was a recent major bump                                                                       | Adjusted the plan on the spot: kept `asyncHandler` for style consistency even though Express 5 forwards async rejections natively                                       |
| 2   | 2       | Graceful shutdown (`SIGTERM`) unverifiable                                                                    | Windows does not deliver POSIX signals to arbitrary processes the way Linux does                                                                  | Documented as a known gap; verified `SIGINT` via `Ctrl+C` instead; will verify `SIGTERM` for real once Docker/Linux exists                                              |
| 3   | 3       | `PrismaClient` required an explicit **driver adapter** (`@prisma/adapter-pg`) — `new PrismaClient()` threw    | Prisma 7 made the adapter pattern mandatory; the "classic" implicit-env-loading behavior no longer applies                                        | Installed `@prisma/adapter-pg`, constructed `PrismaPg` explicitly, verified via a scratch script before writing real code                                               |
| 4   | 3       | Prisma 7's _default_ generator (`prisma-client`) emits TypeScript                                             | Conflicted with the project's "no TypeScript" rule                                                                                                | Used the classic `provider = "prisma-client-js"` generator instead — confirmed it still ships plain JS                                                                  |
| 5   | 3       | `import { PrismaClient } from '@prisma/client'` failed: _"Named export not found"_                            | Node's static CJS-export detection (`cjs-module-lexer`) isn't 100% reliable for every package's export shape                                      | Switched to `import pkg from '@prisma/client'; const { PrismaClient } = pkg;` — a pattern that always works                                                             |
| 6   | 3       | `prisma migrate dev` failed: _"could not create the shadow database"_                                         | Our least-privilege DB role didn't have `CREATEDB`, which the shadow-database mechanism needs (dev-only requirement)                              | Granted `CREATEDB` locally; noted that `migrate deploy` (production) never needs this at all                                                                            |
| 7   | 3       | Couldn't fully verify `/ready`'s failure path (stopping Postgres)                                             | `Stop-Service` requires admin privileges this session didn't have                                                                                 | Documented as a known, honest verification gap; the success path was fully verified                                                                                     |
| 8   | 5       | Assumed `logger.error(msg, callback)` would fire only after the log was fully written — it never fired at all | That specific callback usage doesn't behave as commonly assumed for Winston                                                                       | Verified via scratch script; switched to the correct `logger.once('finish', cb)` + `logger.end()` pattern                                                               |
| 9   | 5       | Setting production's log level to `'info'` would have **silently dropped every HTTP access log**              | npm log levels: `http` (3) is _less_ severe than `info` (2) — a level only allows itself and more-severe levels through                           | Changed production's level to `'http'`                                                                                                                                  |
| 10  | 5       | Morgan's colorized `'dev'` format leaked raw ANSI escape codes into the JSON log files                        | Piped Morgan's terminal-formatted string directly into the logger without stripping color codes                                                   | Always use Morgan's uncolored `'combined'` format now; Winston's own console transport owns presentation                                                                |
| 11  | 6/7     | A small ESLint false positive on `const { password, ...safeUser } = user`                                     | `no-unused-vars` didn't recognize the "destructure to omit a field" idiom                                                                         | Added `ignoreRestSiblings: true` to `eslint.config.js`                                                                                                                  |
| 12  | 7       | JWT secrets didn't exist in `.env` yet, and the new schema required them                                      | Never previously needed; Feature 4 deliberately deferred JWT validation to this feature                                                           | Generated with `crypto.randomBytes`, appended to `.env` with explicit permission (a JWT secret is arbitrary entropy, not a user-chosen credential like the DB password) |
| 13  | 7       | First registration attempt crashed: _"Cannot read properties of undefined (reading 'create')"_                | `prisma migrate dev` applied the `RefreshToken` migration but did **not** auto-run `generate` — same finding as Feature 6                         | Ran `npx prisma generate` explicitly                                                                                                                                    |
| 14  | 7       | The fix above didn't take effect immediately                                                                  | The already-running dev server had the stale client cached in memory; `nodemon` ignores `node_modules`, so it never noticed the regenerated files | Manually restarted the dev server                                                                                                                                       |
| 15  | 7       | That crash revealed `register` had already created a real user account before failing at token issuance       | `register` isn't wrapped in a Prisma transaction — two separate writes, no atomicity                                                              | **Not fixed** — documented as a genuine, known gap; closing it needs a transaction client threaded through the repository layer, judged out of scope                    |
| 16  | 4, 5, 7 | A background `npm run dev` task kept running (or left orphaned child processes) after being stopped           | On Windows, stopping the top-level tracked shell doesn't always cascade-kill `nodemon`'s spawned child `node` process                             | Caught via `Get-CimInstance Win32_Process`, cleaned up manually each time; worth checking before every fresh dev-server boot                                            |

### Verified Clean (No Surprises) — Worth Noting Too

Not every library check turned up a bug — several confirmed the
"assumed" behavior was exactly right, which is equally worth recording
since it's what building the _habit_ of verifying looks like in practice:
`zod@4`'s `safeParse`/`z.coerce.number()`/`.default()`/`.error.issues`
(Feature 4), `bcryptjs@3`'s `hash`/`compare`/`hashSync` (Feature 6), and
`jsonwebtoken@9`'s `sign`/`verify`/error types (Feature 7).

---

## Part 3: Interview-Ready Q&A (Consolidated)

Concise answers here; each chapter has the full detailed answer plus
"what interviewers are evaluating" for every question below.

### Architecture & Project Structure

**Q: Why feature-first folders (`modules/auth/`) instead of layer-first
(`controllers/`, `services/`, `repositories/`)?**
A: It keeps everything about one domain concept co-located, so growing the
app doesn't mean jumping across multiple top-level folders to change one
feature. _(Ch. 1)_

**Q: Why keep controllers thin?**
A: Single Responsibility — controllers translate HTTP ⇄ domain; business
logic in a service is testable without any HTTP mocking, and reusable
outside the HTTP context entirely. _(Ch. 1, Ch. 6)_

**Q: Why does the repository live separately from the service, even when
they seem tightly coupled?**
A: The repository can change (different ORM, caching layer, read
replica) without touching business rules, and vice versa — they're
expected to evolve independently. _(Ch. 6, Ch. 7)_

### Express & Middleware

**Q: How does Express know a middleware function is meant to handle
errors?**
A: By counting its parameters — exactly 4 (`err, req, res, next`) marks it
as error-handling middleware; this is checked by `fn.length`, not by name
or position. _(Ch. 2)_

**Q: Why does middleware order matter?**
A: It's a pipeline executed strictly in registration order — body parsing
must precede validation, auth must precede RBAC, and the error handler
must be registered dead last to catch everything above it. _(Ch. 2)_

**Q: Why exit the process on an uncaught exception instead of trying to
recover?**
A: The process may be in an undefined state afterward; exiting and
letting an orchestrator restart it is safer than serving traffic from
unknown state. _(Ch. 2)_

### Database & Prisma

**Q: Why does Prisma 7 require a driver adapter now?**
A: It decouples the query client from any implicit connection mechanism,
requiring the caller to supply the actual database connection explicitly
— part of a broader move toward explicit dependency injection over
ambient configuration. _(Ch. 3)_

**Q: Why does `migrate dev` need a shadow database, and why did that fail
in this project?**
A: It creates a disposable database, replays migration history into it,
and diffs against _that_ for an authoritative answer — which needs
`CREATEDB`, a privilege our least-privilege role didn't have until
granted (a dev-only need; `migrate deploy` never needs it). _(Ch. 3)_

**Q: Why use a UUID instead of an auto-incrementing integer for `User.id`?**
A: A sequential ID leaks information (you can guess neighboring IDs
exist); a UUID carries no ordering information at all. _(Ch. 6)_

### Configuration & Environment

**Q: Why validate environment variables with Zod instead of just reading
`process.env`?**
A: Unvalidated config fails wherever it's _used_, often confusingly and
much later; validated config fails immediately, at boot, with a clear
message naming exactly what's wrong. _(Ch. 4)_

**Q: Why does `PORT` need `z.coerce.number()` instead of `z.number()`?**
A: Every environment variable is a string by nature (there's no such
thing as a numeric OS environment variable); coercion converts it to a
real number as part of validation. _(Ch. 4)_

**Q: Why does `DATABASE_URL` have no default value, while `PORT` does?**
A: There's no safe fallback for a database connection — its absence must
be a hard failure. `PORT` defaulting to `3000` is harmless; a wrong
"convenient" default for a credential-bearing value would not be. _(Ch. 4)_

### Logging

**Q: Why does npm's log-level ordering matter so much here?**
A: A level allows itself and everything _more severe_ (lower number)
through; setting production to `'info'` would have silently dropped every
`http`-level access log, since `http` is a less-severe level than `info`.
_(Ch. 5)_

**Q: Why is `winston.format.errors({ stack: true })` necessary?**
A: Without it, logging an `Error` object keeps only its `.message` and
silently drops the stack trace. _(Ch. 5)_

**Q: Why `logger.once('finish', cb)` + `logger.end()` instead of a
callback argument to `logger.error()`?**
A: Testing showed the callback argument doesn't reliably fire on write
completion; `'finish'` after `.end()` is the pattern that actually works.
_(Ch. 5)_

### Authentication & Passwords

**Q: Why hash passwords instead of encrypting them?**
A: Hashing is one-way by design — the server should never be able to
recover the original password, only verify a match. _(Ch. 6)_

**Q: Why does bcrypt deliberately run slowly?**
A: To make brute-force password cracking computationally expensive, even
if the password database is ever stolen. _(Ch. 6)_

**Q: Why must "user not found" and "wrong password" return the exact same
error?**
A: Differing messages (or differing response _timing_) let an attacker
enumerate which emails have registered accounts. _(Ch. 6)_

**Q: Why run a dummy password comparison when no user is found during
login?**
A: To keep response timing consistent across failure modes — otherwise
timing alone leaks which emails exist, even with an identical error
message. _(Ch. 6)_

### JWT & Sessions

**Q: Why are access tokens stateless but refresh tokens stateful (DB-
backed)?**
A: Access tokens are checked on every request and must stay cheap (no DB
call); refresh tokens are used rarely enough that database-backed
revocability is worth the cost, and revocation genuinely matters for a
token that lives for days. _(Ch. 7)_

**Q: Why SHA-256 for refresh tokens instead of bcrypt?**
A: bcrypt's slowness defends against brute-forcing low-entropy human
passwords; a refresh token is already high-entropy random data, so a fast
hash is correct and faster to verify on every refresh request. _(Ch. 7)_

**Q: What does refresh token rotation actually prevent?**
A: It limits a stolen refresh token to a single use — the legitimate
owner's next refresh invalidates the stolen copy. _(Ch. 7)_

**Q: Why is the refresh token in an httpOnly cookie instead of the
response body?**
A: httpOnly cookies are never readable by JavaScript, closing off
XSS-based theft entirely — something a body-returned token stored in
`localStorage` can't offer. _(Ch. 7)_

**Q: Why does `auth.middleware.js` never touch the database?**
A: Access-token verification runs on every authenticated request, so it
must stay as cheap as possible — the entire point of choosing a stateless
token for that part. _(Ch. 7)_

### General Engineering Judgment

**Q: What's a real bug you found by testing, not by reading
documentation, in this project?**
A: Several — pick any row from Part 2's table above and walk through it:
what was assumed, what testing revealed, and what the actual fix was. The
Winston flush-callback bug (#8) and the Prisma driver-adapter requirement
(#3) are both strong examples with clear before/after code.

**Q: What's a known limitation in this codebase that hasn't been fixed
yet, and why not?**
A: `register` isn't wrapped in a database transaction (#15) — a crash
between creating the user and issuing tokens leaves a real account with
no session. Fixing it needs a transaction client threaded through the
repository layer, which was judged real but out of scope for the feature
that surfaced it — a normal, honest trade-off in shipping incrementally
rather than gold-plating every edge case immediately.

---

## Part 4: Patterns Established (Worth Carrying Forward)

- **Verify a library's actual behavior in a scratch script before writing
  real code against it**, especially after a major-version bump (Express
  5, Prisma 7) or for anything load-bearing (Winston's flush semantics).
- **One shared, centrally-configured instance per cross-cutting concern**:
  `config/env.js`, `config/database.js`, `config/logger.js` — never
  reach for `process.env`, `new PrismaClient()`, or `console.*` directly
  anywhere else.
- **Fail fast and loud at boot** for anything that can't safely have a
  wrong value (env config) rather than failing confusingly later.
- **Document known gaps honestly instead of glossing over them** — the
  Windows `SIGTERM` limitation, the admin-privilege verification gap, and
  the un-transactional `register` are all real, named, and traceable
  rather than silently absent from the record.
- **Security-sensitive code gets the identical-response-and-timing
  treatment** wherever enumeration or timing side-channels are possible,
  not just wherever it's convenient.
