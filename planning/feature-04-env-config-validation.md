# Feature 4: Environment Config & Validation (Zod) — Action Plan

Status: **Awaiting review/approval**. Nothing below has been executed yet.

## Scope

Introduce `src/config/env.js` as the single, Zod-validated source of truth
for environment configuration, and retire every scattered, temporary
`process.env` read introduced in Features 2 and 3. **Only variables
actually consumed by existing code are validated**: `NODE_ENV`, `PORT`,
`CORS_ORIGIN`, `DATABASE_URL`. `JWT_*` and `CLOUDINARY_*` (already listed in
`.env.example` for future features) are deliberately left out of this
schema — each gets added when its own feature (Auth, Cloudinary) actually
needs it.

## Actions

1. **Install `zod`** (dependency — used at runtime, not just dev).

2. **Create `src/config/env.js`**:
   - Loads `dotenv/config` itself (moved here from `server.js` — "load raw
     env values" and "validate them" are one concern).
   - Defines a Zod schema:
     - `NODE_ENV`: `z.enum(['development', 'production', 'test'])`,
       defaulting to `'development'`.
     - `PORT`: `z.coerce.number().int().positive()`, defaulting to `3000` —
       coerced from the raw string `process.env.PORT` into a real number.
     - `CORS_ORIGIN`: `z.string().url()`, defaulting to
       `'http://localhost:4200'` — validated as a well-formed origin, not
       just any non-empty string.
     - `DATABASE_URL`: `z.string().min(1)` — **required, no default**; the
       app cannot function at all without a real database, so a missing
       value must fail startup, not silently fall back to anything.
   - Parses `process.env` via `.safeParse(...)` (not `.parse(...)`), so we
     control the failure path ourselves rather than letting a raw Zod
     exception surface.
   - On failure: logs a clear, readable summary of exactly which
     variable(s) are missing/invalid and why, then `process.exit(1)` —
     the process never starts in a half-configured state.
   - On success: exports `Object.freeze(parsedConfig)` — read-only after
     boot, so nothing downstream can mutate shared config.

3. **Update `src/server.js`**:
   - Remove the standalone `import 'dotenv/config'` (now owned by
     `env.js`).
   - Import `env` from `./config/env.js` as the first import instead — its
     own top-level `dotenv/config` import still runs before anything else
     evaluates, for the same reasons discussed in Feature 3.
   - Replace `process.env.PORT || 3000` with `env.PORT`.

4. **Update `src/app.js`**:
   - Replace `process.env.CORS_ORIGIN || 'http://localhost:4200'` with
     `env.CORS_ORIGIN`.
   - Replace `process.env.NODE_ENV === 'production'` (the Morgan format
     branch) with `env.NODE_ENV === 'production'`.

5. **Update `src/config/database.js`**:
   - Replace `process.env.DATABASE_URL` with `env.DATABASE_URL`.

6. **Update `src/middlewares/error.middleware.js`**:
   - Replace `process.env.NODE_ENV !== 'production'` (the stack-trace
     gating) with `env.NODE_ENV !== 'production'`.

7. **Manual verification**:
   - Fail-fast path: temporarily rename `.env` (or blank out
     `DATABASE_URL`) and confirm `npm run dev` refuses to start, printing a
     clear error naming the missing variable — not a cryptic downstream
     Prisma error.
   - Restore `.env`, confirm normal boot, and re-verify `GET /health` and
     `GET /ready` both still return `200` as before.
   - Confirm `PORT` is genuinely a `number` at runtime (not a numeric
     string) after passing through the schema.

8. **Run `npm run lint` and `npm run format:check`.**

9. **Update `CLAUDE.md`** — check off "Environment config & validation
   (Zod)."

10. **Write the next handbook chapter**
    (`handbook/04-environment-config-validation.md`) automatically, per
    your standing instruction.

## Explicitly out of scope (deferred to later features)

- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` validation — added by the
  Auth/JWT feature, which can also add stronger rules (e.g. minimum
  secret length) once that feature actually designs its security
  requirements.
- `CLOUDINARY_*` validation — added by the Cloudinary/file-upload feature.
- Multiple/comma-separated `CORS_ORIGIN` values — not needed until there's
  more than one real frontend origin to support.
- Per-`NODE_ENV` conditional validation rules (e.g., stricter checks only
  in production) — no current variable needs this yet; noted in the theory
  discussion as a pattern to reach for later.
