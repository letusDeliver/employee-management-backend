# Chapter 3: PostgreSQL + Prisma Setup

## 1. Introduction

This feature wires up Prisma as the ORM/migration toolchain against a real
local PostgreSQL database, proves the connection works end to end via a new
`/ready` readiness endpoint, and establishes the single shared
`PrismaClient` pattern every future repository will depend on. **No domain
models exist yet** — this feature proves the plumbing works, the same way
Chapter 2 proved the HTTP plumbing worked before any real route existed.

It exists because every feature from here on (User model, Employee CRUD,
RBAC) needs a database connection that's already known to work. Building
and verifying it first means those features can focus entirely on their
own models and business rules, not on "does Prisma even talk to Postgres."

In the overall architecture, this is the layer directly beneath every
future repository: `src/config/database.js` is the one file every
`*.repository.js` will eventually import from.

---

## 2. Theory

**What Prisma is**: a schema-first toolkit with three parts. `schema.prisma`
declares the datasource and data model — the single source of truth.
Prisma Migrate reads it, diffs it against the real database, and generates
versioned SQL migration files. Prisma Client is a JS query API **generated**
from the schema. Nothing about the data model lives only in JavaScript —
unlike ORMs where you define a class and the tool infers the table, Prisma
inverts it: the schema file drives both the database and the generated
client.

**Why PostgreSQL fits this domain**: an Employee Management system is
inherently relational — employees belong to departments, have roles,
request leave that needs approval. These are foreign-key relationships
with real referential-integrity and transactional requirements. A
relational database with ACID guarantees enforces that at the data layer;
a document store would push that work into application code instead.

**Migrations vs. `db push`**: `migrate dev` generates a real, timestamped
SQL migration for every schema change and keeps permanent history in
`prisma/migrations/`. `db push` directly syncs the database with no history
at all — meant only for early prototyping. We use `migrate dev` from the
very first schema change, even with zero models, to build the habit before
there's anything real at stake.

**A real surprise this feature ran into**: my working assumption going in
(reflected in the original plan) was "classic Prisma" behavior — the CLI
auto-loads `.env`, and `new PrismaClient()` reads the datasource URL
implicitly via `env("DATABASE_URL")` in the schema. **Prisma 7 (installed
here) changed both of these.** This chapter documents what's actually true
for the version we're running, not what older tutorials assume — a useful
reminder that "I know how Prisma works" needs re-verifying against the
exact installed version, the same lesson Chapter 2 learned with Express 5.

**Liveness vs. readiness**: these are genuinely different questions.
Liveness ("is the process alive") doesn't depend on the database; readiness
("can this instance currently serve real requests") does. Conflating them
means a database hiccup makes an otherwise-healthy process look dead and
get needlessly restarted by an orchestrator — which is why `/health` (from
Chapter 2) and the new `/ready` are two separate endpoints, not one.

---

## 3. Architecture

### What Changed Structurally, and Why

Prisma 7's runtime model is meaningfully different from "classic" Prisma:

```
OLDER PRISMA MODEL                    PRISMA 7 (installed here)
───────────────────                   ─────────────────────────
schema.prisma                         schema.prisma
  datasource db {                       datasource db {
    url = env("DATABASE_URL")             (no url here)
  }                                     }
        ↓                              prisma.config.js  ← NEW
new PrismaClient()                       datasource: { url: ... }
  (reads env implicitly)                       ↓
                                       new PrismaClient({ adapter })
                                         (adapter carries the URL;
                                          construction fails without one)
```

- `prisma.config.js` is read only by **CLI tooling** (`migrate`, `generate`,
  `studio`) — it has no bearing on how our own running app connects.
- The **runtime** `PrismaClient`, instantiated inside our own code, now
  requires an explicit **driver adapter** (`@prisma/adapter-pg`'s
  `PrismaPg`, wrapping a `node-postgres` connection) passed to its
  constructor. `new PrismaClient()` with no arguments throws immediately.

### Request/Data Flow for the New `/ready` Check

```
GET /api/v1/ready
    ↓
helmet → cors → morgan → express.json()   (unchanged from Chapter 2)
    ↓
routes/index.js  →  GET /ready handler (wrapped in asyncHandler)
    ↓
src/config/database.js's shared `prisma` instance
    ↓
prisma.$queryRaw`SELECT 1`   ← needs no model at all
    ↓
   [success] → 200 { status: 'ok', database: 'connected' }
   [failure] → throw ServiceUnavailableError → errorMiddleware → 503
```

### Layer Responsibilities

| Layer                            | Responsibility                                                        | Must NOT do                                                                         |
| -------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `prisma/schema.prisma`           | Declare datasource provider + generator; (later) models               | Contain connection credentials directly                                             |
| `prisma.config.js`               | Tell CLI tooling where the schema/migrations live and what URL to use | Get imported by application runtime code                                            |
| `src/config/database.js`         | Construct the _one_ shared `PrismaClient`, wired to a driver adapter  | Be imported anywhere except repositories (once they exist) and this readiness check |
| `src/routes/index.js` (`/ready`) | Prove the database dependency is reachable, right now                 | Perform any real business query                                                     |

### Where This Sits in the Full Clean Architecture

```
HTTP Request
    ↓
Route            ← /ready added here (routes/index.js)
    ↓
Middleware chain ← unchanged from Chapter 2
    ↓
Controller       ← still not built (Employee CRUD feature)
    ↓
Service          ← still not built
    ↓
Repository       ← still not built — but now has somewhere to import a
                    working PrismaClient from, once it exists
    ↓
PostgreSQL       ← now a real, verified, reachable dependency
```

---

## 4. Folder Structure

```
prisma/
├── schema.prisma        (new) — datasource + generator, zero models
└── migrations/           NOT created this feature — see section 6

prisma.config.js          (new, project root) — CLI-only config

src/
├── config/
│   └── database.js       (new) — the one shared PrismaClient
├── errors/
│   └── ServiceUnavailableError.js  (new) — 503
└── routes/
    └── index.js           (modified) — GET /ready added
```

**Why `prisma.config.js` lives at the project root, not inside `prisma/`**:
Prisma's CLI looks for it at the root by convention — same reasoning as
`package.json` living at the root rather than inside `src/`.

**Why it's `.js`, not the `.ts` Prisma generates by default**: verified
directly — the generated file had zero actual TypeScript syntax (no type
annotations), so renaming it to `.js` and keeping identical content loads
correctly. Keeping it `.js` preserves the project's "no TypeScript" rule
without losing any functionality.

---

## 5. File-by-File Explanation

### `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}
```

- **Responsibility**: declares the datasource provider and which generator
  produces the JS client — deliberately zero models.
- **Why `provider = "prisma-client-js"` instead of the new default
  `prisma-client`**: verified directly that the new default generator emits
  `.ts` files with `@ts-nocheck`, importing other `.ts` files by extension
  — fundamentally incompatible with a plain-JavaScript project. The classic
  generator still ships in Prisma 7 and produces plain `.js` in
  `node_modules/@prisma/client`, exactly as older documentation describes.
- **Why no `url = env("DATABASE_URL")` line**: in Prisma 7, the runtime
  client no longer reads this at all (see the driver-adapter requirement
  below) — the URL lives in `prisma.config.js` for the CLI and is passed
  explicitly to the adapter for runtime use. Leaving a `url` line in the
  datasource block would be harmless but misleading, since nothing
  actually reads it anymore for our setup.
- **Interview question**: _"Why keep the datasource block at all if it
  doesn't carry the URL?"_ — It still declares the **provider** (which
  database engine), which affects what SQL dialect migrations generate and
  what features/types are available — a genuinely separate concern from
  _where_ the database lives.

### `prisma.config.js`

```js
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
```

- **Responsibility**: tells every Prisma CLI command (`generate`,
  `migrate dev`, `studio`) where the schema and migrations live, and what
  connection string to use.
- **Its own `import 'dotenv/config'`**: this file is loaded directly by the
  Prisma CLI process, which is a _separate_ process invocation from our
  running app — it needs its own `.env` loading, independent of
  `server.js`'s.
- **Interview question**: _"If both `prisma.config.js` and `server.js` call
  `import 'dotenv/config'`, is that a problem?"_ — No; `dotenv.config()` is
  idempotent per-process, and these run in entirely separate Node
  processes (`npx prisma ...` vs. `node src/server.js`) — there's no
  shared state to duplicate.

### `src/config/database.js`

```js
import prismaClientPkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const { PrismaClient } = prismaClientPkg;

const createPrismaClient = () => {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
};

const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
```

- **Responsibility**: the single shared `PrismaClient` instance — the only
  file in the codebase permitted to import `@prisma/client` directly.
- **The `import prismaClientPkg from '@prisma/client'; const { PrismaClient
} = prismaClientPkg;` pattern, instead of a direct named import**: hit
  this as a real bug during implementation — `import { PrismaClient } from
'@prisma/client'` failed with `Named export 'PrismaClient' not found`.
  Node's interop layer for importing CommonJS modules from ESM uses static
  analysis (via `cjs-module-lexer`) to guess which named exports exist; that
  guess isn't 100% reliable for every package's export pattern. The
  default-import-then-destructure form always works, because it doesn't
  depend on that static guess at all — it just takes whatever the CJS
  module's `module.exports` object is and destructures it at runtime.
- **The driver adapter (`PrismaPg`)**: wraps a `node-postgres` connection
  using the given connection string. Passing an adapter is now _mandatory_
  in Prisma 7 — `new PrismaClient()` with no arguments throws
  `PrismaClientConstructorValidationError`, and even `new PrismaClient({})`
  throws `Using engine type "client" requires either "adapter" or
"accelerateUrl" to be provided`.
- **`globalForPrisma` caching**: `nodemon` re-executes this module on every
  file-change restart during development. Without caching the instance on
  `globalThis`, each restart would construct a fresh adapter (and its
  underlying connection pool) while the previous one might not be garbage
  collected yet — gradually leaking connections over a dev session.
  Production (a real process, not endlessly hot-reloaded) always
  constructs fresh, which is why the cache is skipped when
  `NODE_ENV === 'production'`.
- **Interview question**: _"Why does Prisma require an explicit adapter now
  instead of just reading the schema's datasource URL?"_ — This reflects a
  broader industry direction of decoupling the query layer from a specific
  runtime and letting the caller supply the actual connection mechanism
  explicitly — the same instinct dependency injection follows generally: a
  component should be handed its dependency, not reach out and construct it
  implicitly from ambient state.

### `src/errors/ServiceUnavailableError.js`

```js
import AppError from './AppError.js';

class ServiceUnavailableError extends AppError {
  constructor(message = 'Service Unavailable') {
    super(message, 503);
  }
}

export default ServiceUnavailableError;
```

- **Responsibility**: the sixth error class, representing "the process is
  up, but a dependency it needs isn't" — distinct from every other error in
  the hierarchy, which represent request-specific problems (bad input, not
  found, etc.) rather than infrastructure problems.
- **Interview question**: _"What's the practical difference between
  returning a 500 and a 503 when the database is down?"_ — A 503 is a
  signal to the caller (and to load balancers/orchestrators) that the
  failure is likely _transient_ and infrastructure-related — appropriate
  for automated retry logic — whereas a bare 500 doesn't distinguish "this
  specific request has a bug" from "nothing is working right now."

### `src/routes/index.js` (modified)

```js
import { Router } from 'express';

import prisma from '../config/database.js';
import asyncHandler from '../utils/asyncHandler.js';
import ServiceUnavailableError from '../errors/ServiceUnavailableError.js';

const router = Router();

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

router.get(
  '/ready',
  asyncHandler(async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableError('Database connection is not available');
    }

    res.status(200).json({ status: 'ok', database: 'connected' });
  }),
);

export default router;
```

- **`$queryRaw\`SELECT 1\``**: the simplest possible round-trip to the
  database — needs no model, no table, nothing beyond a live connection.
  This is exactly why the readiness check can exist _before_ any domain
  model does.
- **The `try/catch` around just the query, not the whole handler**: keeps
  the failure translation localized — any error from the database call
  becomes a `ServiceUnavailableError` specifically, rather than
  accidentally reclassifying some unrelated bug in this handler as a
  database problem.
- **`asyncHandler` wraps the whole thing**: consistent with every other
  route, even though Express 5 would forward the rejection natively either
  way — style consistency, as established in Chapter 2.

---

## 6. Request Lifecycle

The full trace for `GET /api/v1/ready`, and — just as importantly — what
actually happened when we ran the migration tooling for the first time.

**Running `npx prisma migrate dev --name init` (twice)**:

1. First attempt failed with `P3014`: _"Prisma Migrate could not create the
   shadow database... permission denied to create database."_ `migrate dev`
   needs a temporary **shadow database** to compute an accurate schema
   diff, which requires the `CREATEDB` privilege — something our
   least-privilege `employee_management_app` role deliberately didn't have.
2. This is a **development-only** requirement. `prisma migrate deploy` (the
   command used in CI/production) never creates a shadow database — it
   only applies already-generated, already-committed migration files
   directly. So granting `CREATEDB` locally doesn't compromise the
   least-privilege principle in production; it only affects the local dev
   role.
3. After granting `CREATEDB` (`ALTER USER employee_management_app
CREATEDB;`, run directly by the project owner against their own local
   Postgres), the second attempt reported: `"Already in sync, no schema
change or pending migration was found."` — **and created no
   `prisma/migrations/` folder at all.** With truly zero models, there's
   nothing to diff against an empty database, so Prisma didn't generate
   even an empty placeholder migration. This is a real, verified behavior
   of an empty schema — different from what a "there will at least be a
   tracking migration" assumption would predict.
4. Because no migration was ever applied, `prisma generate` (which
   `migrate dev` normally triggers as a side effect of applying a
   migration) also never ran — meaning the actual generated client
   (`node_modules/.prisma/client`, which `node_modules/@prisma/client`
   re-exports from) didn't exist yet, even though the `@prisma/client`
   _package_ was installed. Running `npx prisma generate` explicitly fixed
   this.

**The successful `GET /api/v1/ready` trace, once everything above was
resolved**:

1. Request passes through the same middleware chain as Chapter 2
   (`helmet → cors → morgan → express.json()`).
2. Matches `GET /ready` in `routes/index.js`.
3. `asyncHandler` invokes the handler; it calls `prisma.$queryRaw`SELECT
   1`\` against the shared client from `database.js`.
4. The `PrismaPg` adapter, constructed with `connectionString:
process.env.DATABASE_URL`, executes the query against the real,
   dedicated `employee_management_db`/`employee_management_app` role.
5. On success, the handler responds `200 { status: 'ok', database:
'connected' }` — verified live via `curl`.
6. `GET /api/v1/health` was also re-verified immediately after, still
   returning a plain `200` with no database involvement at all — confirming
   the liveness/readiness separation actually holds in practice, not just
   in the design.

---

## 7. Best Practices

- **One shared `PrismaClient`, never one per request/repository** — a
  connection pool per instantiation is expensive and can exhaust the
  database's connection limit under load.
- **Least-privilege database roles** — the app connects as a dedicated
  role scoped to its own database, not the Postgres superuser, even in
  local development, so the habit is never something to "remember to do
  later" in production.
- **`migrate dev` locally, `migrate deploy` in CI/production** — the
  former is interactive and can create/generate; the latter only applies
  what's already been reviewed and committed, and needs no shadow database
  or elevated privileges at all.
- **Commit `prisma/migrations/` once it exists** — it's part of the
  deployable history, not a build artifact.
- **Verify your assumptions against the exact installed version.** This
  entire feature is a case study in why: the plan's original description of
  "classic Prisma" behavior (implicit env loading, no adapter needed) was
  wrong for the actual installed version, caught only by testing in a
  disposable scratch directory before touching the real project.

---

## 8. Security Considerations

- **Dedicated, least-privilege role** (`employee_management_app`), never
  the superuser — limits blast radius if the application's credentials
  were ever compromised.
- **`CREATEDB` granted locally is a deliberate, scoped trade-off** — it
  exists only to let `migrate dev`'s shadow-database mechanism work on a
  personal development machine; it is not something the production role
  would ever need, since production uses `migrate deploy`.
- **`DATABASE_URL` never leaves the local `.env`** — created directly by
  the project owner, never seen in this conversation or committed to git.
- **Prisma Client's generated methods parameterize queries automatically**,
  preventing SQL injection; this protection only extends to those
  generated methods and `$queryRaw` used with tagged-template syntax (as
  done here) — never to `$queryRawUnsafe` with string concatenation.
- **`sslmode` on the connection string** remains irrelevant for now (local
  traffic never leaves the machine) but becomes a real requirement the
  moment `DATABASE_URL` points at any network-accessible instance.

---

## 9. Performance Considerations

- **Connection pooling is handled per-adapter instance** — because
  `database.js` constructs exactly one `PrismaPg` adapter for the entire
  process lifetime (outside of dev hot-reloads), there's exactly one
  connection pool, not one per request.
- **`$queryRaw\`SELECT 1\``is about as cheap as a readiness probe can be**
— no table scan, no lock contention, negligible latency added to
whatever polls`/ready` (a load balancer or orchestrator, typically every
  few seconds).
- **Future scaling note**: once multiple app instances run concurrently
  behind a load balancer, each instance's own connection pool adds up
  against Postgres's total connection limit — this is exactly where a
  pooler like PgBouncer becomes relevant, as flagged in the original
  architecture-planning discussion. Not a concern yet at a single local
  instance.

---

## 10. Common Mistakes

| Mistake                                                                                 | Why it happens                                                               | How senior engineers avoid it                                                                                                |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Assuming `new PrismaClient()` "just works" on any Prisma version                        | Following older tutorials/muscle memory                                      | Check the installed major version's actual constructor requirements before writing the singleton                             |
| Connecting as the Postgres superuser "to keep things simple"                            | Avoids the extra `CREATE USER`/`GRANT` ceremony                              | Recognize that local-dev laziness here becomes a production security habit later — do it right from the first connection     |
| Assuming `migrate dev` always creates a migration file                                  | Reasonable assumption from "it's supposed to track history"                  | Understand it only creates one when there's an actual diff — an empty schema against an empty database has nothing to record |
| Forgetting `prisma generate` after a schema change that didn't trigger a real migration | `migrate dev` usually runs generate as a side effect, masking the dependency | Know that `generate` and `migrate` are separate steps that happen to often run together, not one operation                   |
| Relying on named ESM imports from any CJS package without a fallback plan               | Works most of the time, so the failure mode is a surprise                    | Default to `import pkg from 'x'; const { Named } = pkg;` for any CJS interop, since it can't fail the way named imports can  |

---

## 11. Interview Preparation

**Q: Why does Prisma need a "shadow database," and why did that fail in
this setup?**

- _Concise answer_: `migrate dev` creates a temporary shadow database to
  compute an accurate diff between the current schema state and the target
  schema; it requires `CREATEDB`, which our least-privilege role didn't
  have until granted.
- _Detailed answer_: without a shadow database, Prisma would have to infer
  the diff from its own migration history file, which can drift from
  reality (e.g., if someone manually altered the database). Creating a
  disposable database, replaying all migrations into it, and diffing
  against _that_ gives an authoritative answer. This is why it's
  privilege-hungry, and why it's explicitly a _development_ mechanism —
  `migrate deploy` in production skips this entirely, applying
  pre-generated SQL directly with no diffing step needed.
- _What interviewers are evaluating_: whether you understand a tool's
  internal mechanism well enough to explain _why_ a permission error
  occurred, not just that granting a broader privilege fixed it.

**Q: Why does this project use a raw `$queryRaw` call for the readiness
check instead of a real model query?**

- _Concise answer_: no domain model exists yet in this feature, and a
  readiness check doesn't need one — it only needs to prove the connection
  is alive.
- _Detailed answer_: introducing a throwaway model purely to have something
  to query would violate the principle of not building speculative
  abstractions ahead of need, and would blur this feature's actual scope
  (proving the toolchain works) with a future feature's scope (defining
  real domain models). `SELECT 1` is the industry-standard trivial
  liveness-of-connection probe for exactly this reason.
- _What interviewers are evaluating_: whether you can scope a health/
  readiness check correctly instead of over-engineering it.

**Q: What's the risk of using named imports for CommonJS packages from
ESM code, and how do you avoid it?**

- _Concise answer_: Node's static analysis for auto-detecting a CJS
  module's named exports isn't 100% reliable, so a named import can fail
  even when the export genuinely exists at runtime; the safe pattern is a
  default import followed by destructuring.
- _Detailed answer_: `cjs-module-lexer` parses the CJS module's source
  looking for recognizable export-assignment patterns (`exports.x = ...`,
  `module.exports.x = ...`); some packages construct their exports object
  in ways this static parser can't fully resolve, especially with
  re-exports or conditional assignment. The default-import-then-destructure
  form sidesteps this entirely because it just imports the whole
  `module.exports` object as a single default value and destructures it at
  runtime — a dynamic operation, not a static one.
- _What interviewers are evaluating_: real hands-on experience with ESM/CJS
  interop pain points, not just textbook knowledge of "ESM and CJS can be
  mixed."

---

## 12. Summary

### Key Takeaways

- Prisma 7 requires an explicit driver adapter for the runtime client —
  verify version-specific behavior rather than trusting older muscle
  memory.
- Liveness (`/health`) and readiness (`/ready`) are different questions
  with different failure implications — kept as separate endpoints.
- `migrate dev`'s shadow-database requirement is a development-only
  privilege need; production's `migrate deploy` never needs it.

### Important Terminology

- **Driver adapter** — the object (`PrismaPg`, here) that gives
  `PrismaClient` an actual database connection mechanism, now mandatory in
  Prisma 7.
- **Shadow database** — a temporary database Prisma Migrate creates to
  compute an authoritative schema diff during `migrate dev`.
- **Liveness check vs. readiness check** — is the process alive, versus can
  it currently serve real traffic (including its dependencies).

### Design Principles

- One shared, long-lived client instance instead of one per use.
- Least privilege for every database role, even in local development.
- Prove infrastructure works with the smallest possible probe (`SELECT 1`)
  before any real domain logic depends on it.

### Best Practices

- Default-import-and-destructure for any CommonJS package imported from
  ESM.
- Cache the Prisma client on `globalThis` outside production to survive
  `nodemon` reloads cleanly.
- Keep `/health` and `/ready` as genuinely separate concerns.

---

## 13. Revision Notes (5-minute read)

- Prisma 7's default generator (`prisma-client`) emits TypeScript — we use
  the classic `prisma-client-js` provider to stay pure JS.
- `prisma.config.js` (plain JS) configures CLI tooling; it is **not** read
  by our running app.
- `new PrismaClient()` with no arguments throws in Prisma 7 — a driver
  adapter (`@prisma/adapter-pg`'s `PrismaPg`) is mandatory.
- `import { PrismaClient } from '@prisma/client'` can fail
  (`Named export not found`) — use `import pkg from '@prisma/client'; const
{ PrismaClient } = pkg;` instead, always.
- The shared client lives in `src/config/database.js`, cached on
  `globalThis` outside production.
- `migrate dev` needs `CREATEDB` for its shadow database — dev-only;
  `migrate deploy` in production never needs it.
- With zero models, `migrate dev` creates no migration file at all
  ("already in sync") — this is correct behavior, not a bug.
- `prisma generate` must run explicitly if `migrate dev` didn't actually
  apply anything.
- `GET /ready` (new) checks real DB connectivity via `$queryRaw`SELECT 1`\`;
  `GET /health` (Chapter 2) stays a pure liveness check with no DB
  involvement.
- The dedicated app database role follows least privilege — never the
  Postgres superuser.

---

## 14. One-Line Interview Answers

**Q: Why does Prisma 7 require a driver adapter?**
A: It decouples the query client from any implicit connection mechanism,
requiring the caller to supply the actual database connection explicitly.

**Q: Why is `/ready` a separate endpoint from `/health`?**
A: Liveness (is the process alive) and readiness (can it serve real
traffic, including reaching its dependencies) are different questions with
different consequences if conflated.

**Q: Why does `migrate dev` need `CREATEDB` but `migrate deploy` doesn't?**
A: `migrate dev` computes diffs using a temporary shadow database;
`migrate deploy` only applies already-generated migrations directly, with
no diffing step.

**Q: Why use `SELECT 1` for the readiness check instead of a real query?**
A: It proves the connection is alive with the cheapest possible round-trip,
and needs no domain model to exist.

**Q: Why default-import-and-destructure `@prisma/client` instead of a
named import?**
A: Node's static CJS-export detection isn't 100% reliable; the default-
import form always works because it destructures at runtime instead.

---

## 15. Practical Examples From Our Codebase

Verified live behavior:

```
$ curl -i http://localhost:3000/api/v1/ready
HTTP/1.1 200 OK
...(Helmet headers, same as Chapter 2)...
Content-Type: application/json; charset=utf-8

{"status":"ok","database":"connected"}
```

```
$ curl -i http://localhost:3000/api/v1/health
HTTP/1.1 200 OK
...
{"status":"ok"}
```

The actual migration attempt sequence from this feature, in order:

```
$ npx prisma migrate dev --name init
Error: P3014
Prisma Migrate could not create the shadow database. Please make sure the
database user has permission to create databases.

# (ALTER USER employee_management_app CREATEDB; run by the project owner)

$ npx prisma migrate dev --name init
Already in sync, no schema change or pending migration was found.
# (no prisma/migrations/ folder was created)

$ npx prisma generate
✔ Generated Prisma Client (v7.8.0) to .\node_modules\@prisma\client
```

A known limitation, honestly documented rather than glossed over: the
optional verification step of temporarily stopping the PostgreSQL Windows
service (to confirm `/ready` returns `503` while `/health` stays `200`)
could not be completed in this environment — `Stop-Service` requires
administrator privileges this session doesn't have. The positive case
(`/ready` succeeding against a live database) is fully verified; the
negative case is correct by code inspection (the two routes are
independent handlers, only one of which touches Prisma) but not proven
live, exactly the same kind of honest gap Chapter 2 documented for
`SIGTERM` on native Windows.
