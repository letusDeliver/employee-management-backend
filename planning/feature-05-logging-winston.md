# Feature 5: Logging (Winston) — Action Plan

Status: **Awaiting review/approval**. Nothing below has been executed yet.

## Scope

Introduce `src/config/logger.js` as the single configured Winston logger
instance, route Morgan's HTTP access logs through it instead of writing
directly to `stdout`, and retire every remaining `console.log`/
`console.error` call in `server.js` and `error.middleware.js`. Also
implements the proposed enhancement from the theory discussion: the error
middleware logs _operational_ errors at `warn` (not just non-operational
ones at `error`).

## Actions

1. **Install `winston`** (dependency — used at runtime).

2. **Create `src/config/logger.js`**:
   - Reads the log level and format mode from `env.js` (`env.NODE_ENV`) —
     never `process.env` directly, consistent with Feature 4.
   - Level: `'debug'` in development, `'info'` in production, `'warn'` in
     test (keeps test-run output quiet once a test suite exists).
   - Format pipeline: `winston.format.timestamp()` +
     `winston.format.errors({ stack: true })` (so logging an `Error` object
     actually captures its stack — the gotcha flagged in the theory
     discussion) + environment-conditional final layer:
     - Development: `winston.format.colorize()` + a human-readable `printf`
       layout for the console.
     - Production: `winston.format.json()`.
   - Transports (active in **all** environments, so local file logs are
     available for debugging too — only the _console_ format differs by
     environment):
     - `Console` — always.
     - `File` → `logs/error.log`, level `error` only.
     - `File` → `logs/combined.log`, everything at the configured level.
     - Both file transports use built-in `maxsize`/`maxFiles` for basic
       size-based rotation — no extra dependency needed for this; calendar
       rotation deferred as a genuinely-later production concern.

3. **Verify the safe shutdown-logging pattern before writing `server.js`
   for real.** Winston's level methods (`logger.error(msg, callback)`)
   accept an optional callback invoked once the log has been written to
   all transports — the correct way to guarantee a fatal log is flushed
   before `process.exit()` runs. This will be confirmed with a small
   scratch script first, continuing this project's habit of verifying a
   library's actual behavior before teaching/relying on it (Express 5,
   Prisma 7, and Zod 4 all had real surprises or confirmations this way
   already).

4. **Update `src/server.js`**:
   - Replace `console.log('Server running on port...')` with
     `logger.info(...)`.
   - Replace the shutdown `console.log` calls with `logger.info(...)`.
   - Replace `unhandledRejection`/`uncaughtException` handlers'
     `console.error` with `logger.error(...)`, using the callback-based
     flush pattern from step 3 before calling `process.exit(1)`.

5. **Update `src/app.js`**:
   - Create a Morgan-compatible stream: `{ write: (message) =>
logger.http(message.trim()) }`.
   - Pass it as Morgan's second argument so HTTP access logs flow through
     the shared logger (at the `http` level) instead of writing to
     `stdout` directly. The existing dev-vs-combined format string choice
     is unaffected — only the _destination_ changes.

6. **Update `src/middlewares/error.middleware.js`**:
   - Replace `console.error(err)` with `logger.error(err)` for
     non-operational errors (the `errors({ stack: true })` format captures
     the stack automatically).
   - **New**: also call `logger.warn(err.message)` for operational errors
     (the ones intentionally thrown — `NotFoundError`, etc.) — giving
     visibility into expected-failure rates without treating them as bugs.

7. **Manual verification**:
   - Boot `npm run dev`; confirm the startup message appears via the
     logger, colorized, on the console.
   - `curl /health` and `curl /ready`; confirm an `http`-level access log
     line appears for each, through the logger (not raw Morgan output).
   - `curl` an unmatched route; confirm a `warn`-level log entry appears
     for the resulting `NotFoundError`.
   - Confirm `logs/error.log` and `logs/combined.log` are created and
     contain the expected entries.
   - Verify `Error` stack-trace capture specifically, via a small
     throwaway script exercising the configured logger directly (since
     there's no naturally-occurring unexpected/500 error path yet without
     real business logic) — confirms the `errors({ stack: true })` format
     actually works before trusting it in the real error path.

8. **Run `npm run lint` and `npm run format:check`.**

9. **Update `CLAUDE.md`** — check off "Logging (Winston)."

10. **Write the next handbook chapter**
    (`handbook/05-logging-winston.md`) automatically, per your standing
    instruction.

## Explicitly out of scope (deferred to later features/production concerns)

- `winston-daily-rotate-file` (calendar-based log rotation) — built-in
  size-based rotation (`maxsize`/`maxFiles`) is sufficient for now.
- Request/correlation IDs for tracing a single request across log lines —
  a real future enhancement, but adds complexity beyond this feature's
  scope; worth revisiting once Auth introduces `req.user` context worth
  correlating.
- Shipping logs to an external aggregator (CloudWatch, Datadog, etc.) —
  irrelevant until there's a real deployment target; this feature only
  gets logs onto disk/console in a structured, consistent way.
