# Feature 2: Express App Bootstrap — Action Plan

Status: **Awaiting review/approval**. Nothing below has been executed yet.

## Scope

Stand up a minimal, running Express application with the security/logging
middleware stack and a complete generic error-handling skeleton, proven end
to end via a `/health` endpoint. No domain logic (auth, users, employees)
yet — this feature is pure infrastructure that every later feature will sit
on top of.

## Actions

1. **Install production dependencies**: `express`, `helmet`, `cors`,
   `morgan`.
   These are runtime dependencies (not `-D`), since the running application
   needs them, unlike `nodemon`/`eslint`/`prettier` from Feature 1.

2. **Create the error class hierarchy** in `src/errors/`:
   - `AppError.js` — base class extending `Error`, carrying `statusCode`
     and `isOperational = true`.
   - `BadRequestError.js` (400), `UnauthorizedError.js` (401),
     `ForbiddenError.js` (403), `NotFoundError.js` (404),
     `ConflictError.js` (409) — each a thin subclass fixing its status code.
     Built now, ahead of any feature that needs them, so every future service
     throws a named, typed error from day one instead of ad hoc `throw new
Error('...')` calls that the error middleware can't distinguish.

3. **Create `src/utils/asyncHandler.js`**.
   A higher-order function wrapping async route handlers so a rejected
   promise is forwarded to `next(err)` automatically — removes the need for
   `try/catch` boilerplate in every controller (Express 4 does not catch
   async rejections natively).

4. **Create `src/middlewares/notFound.middleware.js`**.
   Registered after all routes; converts any unmatched request into a
   `NotFoundError` instead of Express's default HTML 404 page.

5. **Create `src/middlewares/error.middleware.js`**.
   The centralized, 4-argument, terminal error handler:
   - If `err.isOperational` → respond with `{ status, message }` and the
     error's `statusCode`.
   - Otherwise (unexpected/programmer error) → log the full error and
     respond with a generic `500`, never leaking internals to the client.
   - Logging uses `console.error` for now — **temporary and intentional**,
     since Winston is a separate upcoming feature. This is the one line
     that gets swapped when that feature lands.
   - Response detail (e.g. including `err.stack`) is gated on
     `NODE_ENV !== 'production'`.

6. **Create `src/routes/index.js`**.
   Router aggregator, mounted later at `/api/v1` in `app.js`. For this
   feature it only defines `GET /health` → `{ status: 'ok' }`. This is
   infrastructure, not a domain module, so it does not get its own
   `modules/health/` folder.

7. **Create `src/app.js`**.
   Assembles the Express app, side-effect-free (no `.listen()`), in this
   exact middleware order:
   `helmet()` → `cors()` → `morgan('dev')` → `express.json()` →
   `/api/v1` router → `notFoundMiddleware` → `errorMiddleware` (last).
   - CORS origin will read from `process.env.CORS_ORIGIN`, defaulting to
     `http://localhost:4200` (Angular's default dev port) if unset — a
     placeholder default, easy to override, not yet validated by a schema
     (that comes with the config feature). **Flagging this assumption —
     let me know if a different default origin makes more sense for you.**

8. **Create `src/server.js`**.
   The composition root:
   - Reads `process.env.PORT`, falling back to `3000` if unset —
     **temporary inline read, replaced wholesale once the "Environment
     config & validation" feature builds the Zod-validated config module.**
   - Imports `app` and calls `app.listen(port)`.
   - Registers `process.on('SIGTERM'/'SIGINT')` handlers that close the
     HTTP server gracefully (stop accepting new connections, let in-flight
     requests finish) — important once this runs under Docker/Kubernetes.
   - Registers `process.on('unhandledRejection'/'uncaughtException')`
     handlers that log loudly rather than fail silently.

9. **Add `CORS_ORIGIN` to `.env.example`** with the placeholder default
   noted in step 7, documenting it alongside the other future env vars.

10. **Manual verification**:
    - `npm run dev` boots without errors.
    - `curl http://localhost:3000/api/v1/health` → `200` with
      `{ status: 'ok' }`.
    - `curl http://localhost:3000/api/v1/does-not-exist` → `404` with a
      clean JSON error body (proves `notFoundMiddleware` → `errorMiddleware`
      pipeline works end to end).
    - Confirm response headers include Helmet's security headers.
    - `Ctrl+C` the dev server and confirm the graceful-shutdown log line
      appears before exit.

11. **Run `npm run lint` and `npm run format:check`** — confirm the new
    source files pass both cleanly.

12. **Update `CLAUDE.md`** — check off "Express app bootstrap" in the
    Progress Log.

## Explicitly out of scope (deferred to later features)

- Zod-based environment validation (`config/env.js`) — `PORT` and
  `CORS_ORIGIN` are read directly with inline fallbacks for now.
- Winston logging — error middleware uses `console.error` as a temporary
  stand-in.
- Any domain route beyond `/health` (auth, users, employees).
- Rate limiting.
- Swagger docs.

## Assumption flagged for your review

- Default CORS origin proposed as `http://localhost:4200`, matching
  Angular's default `ng serve` port. Confirm or override this before I
  implement.
