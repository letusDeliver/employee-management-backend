# Feature 3: PostgreSQL + Prisma Setup — Action Plan

Status: **Awaiting review/approval**. Nothing below has been executed yet.

## Scope

Wire up Prisma as the ORM/migration toolchain against your existing local
PostgreSQL 18 installation, prove the connection works end to end via a new
`/ready` readiness endpoint, and establish the one-shared-client pattern
every future repository will depend on. **No domain models (User,
Employee, etc.) are created in this feature** — those belong to their own
upcoming features. This feature only proves the plumbing works.

## Actions

1. **You create a dedicated database + role** (this step touches your local
   Postgres credentials, so it's yours to run, not mine — via `psql` or
   pgAdmin, connected as your existing superuser):

   ```sql
   CREATE DATABASE employee_management_db;
   CREATE USER employee_management_app WITH ENCRYPTED PASSWORD 'choose-a-strong-local-dev-password';
   GRANT ALL PRIVILEGES ON DATABASE employee_management_db TO employee_management_app;
   \c employee_management_db
   GRANT ALL ON SCHEMA public TO employee_management_app;
   ```

   This follows the least-privilege principle from the theory discussion —
   the app connects as a dedicated role scoped to its own database, never
   as the Postgres superuser.

2. **You create the real `.env` file** (gitignored, never seen by me) at
   the project root, based on `.env.example`, with a real
   `DATABASE_URL` pointing at the database/role from step 1:

   ```
   DATABASE_URL=postgresql://employee_management_app:choose-a-strong-local-dev-password@localhost:5432/employee_management_db
   ```

   Once done, just confirm to me it's in place — I never need to see the
   actual password.

3. **Install dependencies**:
   - `prisma` (devDependency) — the CLI (`migrate`, `generate`, `studio`).
   - `@prisma/client` (dependency) — the generated runtime client.
   - `dotenv` (dependency) — needed so our actual running Node process
     (not just the Prisma CLI, which auto-loads `.env` on its own) can read
     `DATABASE_URL` from `.env`. **Flagging this as a small, deliberate
     scope addition**: it's a minimal, temporary bootstrap
     (`import 'dotenv/config'` at the very top of `server.js`), replaced
     wholesale once the "Environment config & validation" (Zod) feature
     lands — same temporary pattern as `PORT`/`CORS_ORIGIN` from Feature 2.

4. **Create `prisma/schema.prisma`** with just the datasource and generator
   blocks — deliberately zero models:

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }

   generator client {
     provider = "prisma-client-js"
   }
   ```

5. **Create `src/config/database.js`** — the single shared `PrismaClient`
   instance. Uses the standard dev-mode-safe pattern (caching the client on
   `globalThis` outside production) so `nodemon` restarts don't leak a new
   connection pool on every reload. This becomes the **only** file in the
   codebase permitted to `import { PrismaClient } from '@prisma/client'`.

6. **Add a new `ServiceUnavailableError` (503)** to `src/errors/`,
   alongside the existing five — needed for the `/ready` endpoint to report
   "the process is up, but its database dependency is not" distinctly from
   a `500`.

7. **Run `npx prisma migrate dev --name init`**.
   With zero models, this still connects to the real database, creates the
   `prisma/migrations/` folder, and creates/applies an initial (essentially
   empty) migration that sets up Prisma's own `_prisma_migrations` tracking
   table — proving write access and connectivity end to end before any
   real model exists.

8. **Add `GET /ready` to `src/routes/index.js`**, alongside the existing
   `GET /health`:
   - Runs `await prisma.$queryRaw\`SELECT 1\`` (needs no model at all).
   - On success → `200 { status: 'ok', database: 'connected' }`.
   - On failure → throws `ServiceUnavailableError`, forwarded through the
     existing error pipeline from Feature 2 → `503`.
   - This deliberately stays a **separate** endpoint from `/health` — a
     liveness check (is the process alive) is not the same question as a
     readiness check (can it currently serve real requests), as discussed
     in the theory.

9. **Update `.env.example`** — confirm/refine the `DATABASE_URL` placeholder
   format to match the dedicated-role pattern from step 1 (not a bare
   `user:password` placeholder implying superuser use).

10. **Manual verification**:
    - `npx prisma migrate dev` completes without error; `prisma/migrations/`
      exists with an initial migration.
    - `npm run dev` boots without errors.
    - `curl http://localhost:3000/api/v1/ready` → `200` with
      `{ status: 'ok', database: 'connected' }`.
    - `curl http://localhost:3000/api/v1/health` still returns `200` (proves
      we didn't couple the two checks).
    - Optional: temporarily stop the `postgresql-x64-18` Windows service
      and confirm `/ready` returns `503` while `/health` still returns
      `200` — proving the liveness/readiness distinction actually holds.

11. **Run `npm run lint` and `npm run format:check`.**

12. **Update `CLAUDE.md`** — check off "PostgreSQL + Prisma setup."

13. **Write the next handbook chapter** (`handbook/03-postgresql-prisma-
setup.md`) automatically, per your standing instruction — no separate
    approval needed for this step.

## Explicitly out of scope (deferred to later features)

- Any real domain model (`User`, `Employee`, `Department`, etc.) — those
  belong to their own upcoming features.
- Zod-based environment validation — `dotenv/config` is a temporary,
  minimal bootstrap for this feature only.
- Winston logging in the readiness check — still `console.error` for now.
- Connection pooling infrastructure (PgBouncer) — relevant only once we
  discuss horizontal scaling for real, not for local single-instance dev.

## What's already confirmed (no need to re-ask)

- PostgreSQL 18.3 is installed and running locally as a Windows service.
- You'll create the dedicated database/role and real `.env` yourself
  (steps 1–2) — I'll wait for your confirmation before proceeding to step 3.
