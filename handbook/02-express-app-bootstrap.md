# Chapter 2: Express App Bootstrap

## 1. Introduction

This feature stands up the first **running** piece of the backend: a
minimal Express application wired with a security/logging middleware stack
and a complete, generic error-handling skeleton — proven end to end via a
`/health` endpoint, with zero domain logic yet.

It exists because every feature built after this one (auth, RBAC, employee
CRUD…) needs two things to already be in place: a safe, consistent request
pipeline (security headers, logging, body parsing) and a consistent way to
signal failure (typed errors, a centralized handler). Building these once,
now, means no future feature ever has to invent error handling or security
headers ad hoc.

In the overall architecture this is the **transport + cross-cutting layer**
— everything between "a TCP request arrives" and "a controller gets
called," plus the terminal error path every layer above (controller,
service, repository) eventually reports back through.

---

## 2. Theory

**The problem this solves**: an Express app with no structure around it
will, by default: send no security headers, allow requests from any
origin (or block legitimate ones, depending on config), log nothing, and —
worst of all — silently swallow errors thrown inside `async` route
handlers, leaving the client's request hanging forever with no response.

**Why modern backends invest in this before any business route exists**:
security and observability are _cross-cutting_ — they apply to literally
every request, present or future. If you wait to add Helmet until you've
built ten endpoints, you have to audit all ten. Add it once, here, and
every future route inherits it automatically because they all pass through
the same `app.js`.

**Real-world examples**: this exact bootstrap shape — security middleware,
request logger, JSON parser, router, 404 handler, error handler, in that
order — is close to universal across production Express codebases,
regardless of company. It is also, not coincidentally, the shape Express's
own generator (`express-generator`) produces, minus the security
additions we've made explicit.

**Advantages**:

- Every future route automatically gets security headers, CORS handling,
  and request logging for free.
- Every future controller can `throw` a typed error and trust it reaches
  the client correctly shaped — no repeated boilerplate.

**Trade-offs**:

- We deliberately deferred two things that _look_ related but aren't yet
  ready: Zod-validated configuration (still reading `process.env` directly
  with inline fallbacks) and Winston logging (the error middleware
  currently uses `console.error`). Both are flagged inline in the code and
  in this handbook as temporary, single-line swaps for later features —
  a conscious choice to keep this feature scoped rather than smuggling in
  work that belongs to upcoming features.
- Express 5 (installed here) natively forwards rejected promises from
  async handlers to error middleware, which means our `asyncHandler`
  utility is no longer strictly _necessary_ for correctness — we kept it
  anyway, purely for consistent, explicit controller style across the
  codebase. Worth naming as a deliberate stylistic choice, not an
  oversight.

**Common mistakes developers make**:

- Forgetting that (on Express 4, and in general as a habit) a rejected
  promise inside an `async` route handler does not automatically become an
  error response — the request just hangs.
- Registering the error-handling middleware anywhere but _last_, or giving
  it fewer than 4 parameters — Express identifies error middleware purely
  by function arity (`fn.length === 4`), not by name or position relative
  to comments.
- Configuring CORS with `origin: '*'` (or naively reflecting any request's
  `Origin` header back), which defeats the same-origin protection entirely.
- Returning raw stack traces or internal error messages to clients in
  production — a classic information-disclosure vulnerability.

---

## 3. Architecture

### Request Flow

```
HTTP Request
    ↓
helmet()                      — security headers on every response
    ↓
cors()                        — origin allow/deny decision
    ↓
morgan(...)                   — logs method/path/status/timing
    ↓
express.json()                — parses JSON body → req.body
    ↓
/api/v1 router (routes/index.js)
    ↓
   [matched]  →  route handler (e.g. GET /health)  →  res.json(...)
   [unmatched] →  notFoundMiddleware  →  next(new NotFoundError(...))
    ↓
errorMiddleware   (only reached via next(err), from anywhere above)
    ↓
JSON error response
```

### Data Flow

- **Inbound**: raw HTTP → Express's internal parsing → `req.body` (only
  after `express.json()` runs) → route handler.
- **Outbound (success)**: route handler → `res.status(...).json(...)` →
  HTTP response, headers already stamped by Helmet/CORS earlier in the
  chain.
- **Outbound (failure)**: any thrown/forwarded error, from any layer, funnels
  into the single `errorMiddleware`, which is the only place that decides
  the client-facing error shape.

### Layer Responsibilities

| Layer                    | Responsibility                                   | Must NOT do                                                 |
| ------------------------ | ------------------------------------------------ | ----------------------------------------------------------- |
| `server.js`              | Process lifecycle: boot, listen, shutdown        | Define routes or middleware                                 |
| `app.js`                 | Assemble middleware + mount routes               | Call `.listen()`                                            |
| `routes/index.js`        | Map paths to handlers                            | Contain business logic                                      |
| `notFound.middleware.js` | Convert "no route matched" into a typed error    | Format the HTTP response itself                             |
| `error.middleware.js`    | Decide the final HTTP response for any error     | Contain business logic or route-matching                    |
| `errors/*.js`            | Represent _what_ went wrong, as data             | Decide _how_ to respond (that's the error middleware's job) |
| `utils/asyncHandler.js`  | Forward async rejections into the error pipeline | Contain any business or HTTP-specific logic                 |

### Diagram: Where This Sits in the Full Clean Architecture

```
HTTP Request
    ↓
Route            ← this feature (routes/index.js)
    ↓
Middleware chain ← this feature builds the error/notFound half;
                    auth/rbac/validation are added by later features
    ↓
Controller       ← not built yet (Employee CRUD feature)
    ↓
Service          ← not built yet
    ↓
Repository       ← not built yet
    ↓
PostgreSQL
```

This feature is entirely infrastructure below the Route layer and the
terminal error path — no controller/service/repository exists yet.

---

## 4. Folder Structure

No new folders were created this feature — every file landed inside the
skeleton Chapter 1 already reserved:

```
src/
├── app.js                       (new)
├── server.js                    (new)
├── errors/
│   ├── AppError.js              (new)
│   ├── BadRequestError.js       (new)
│   ├── UnauthorizedError.js     (new)
│   ├── ForbiddenError.js        (new)
│   ├── NotFoundError.js         (new)
│   └── ConflictError.js         (new)
├── middlewares/
│   ├── notFound.middleware.js   (new)
│   └── error.middleware.js      (new)
├── utils/
│   └── asyncHandler.js          (new)
└── routes/
    └── index.js                 (new)
```

**Why `app.js` and `server.js` are both directly under `src/`, not inside
any subfolder**: they are the composition root of the entire application —
they _import from_ every layer below them, so they can't live inside one
of those layers without creating a confusing "a subfolder imports from its
own parent" structure.

**Why `/health` lives in `routes/index.js` directly, not in its own
`modules/health/` folder**: it has no controller/service/repository — it's
pure infrastructure (used by orchestrators/load balancers), not a domain
feature. The `modules/` folder is reserved for real business domains.

---

## 5. File-by-File Explanation

### `src/errors/AppError.js`

```js
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
```

- **Responsibility**: base class for every "expected" error the app throws
  on purpose.
- **Inputs**: `message` (string), `statusCode` (number).
- **Key fields**: `isOperational = true` — the flag the error middleware
  uses to distinguish _expected_ failures (bad input, not found, etc.) from
  _unexpected_ bugs.
- **`Error.captureStackTrace(this, this.constructor)`**: V8-specific API
  that excludes the `AppError` constructor itself from the generated stack
  trace, so the trace points at where the error was actually thrown, not
  at this base class's internals.
- **Best practice**: never throw a bare `Error` for an expected failure —
  always a typed subclass, so the error middleware (and anyone reading
  logs later) can tell operational errors from bugs at a glance.
- **Interview question**: _"Why extend `Error` instead of just using plain
  objects for error information?"_ — `Error` instances get correct
  `instanceof` behavior, an automatically-populated stack trace, and
  integrate with tools (debuggers, error trackers) that specifically
  recognize the `Error` prototype chain — a plain object loses all of that.

### `src/errors/{BadRequestError,UnauthorizedError,ForbiddenError,NotFoundError,ConflictError}.js`

Each is a 6-line subclass, e.g.:

```js
import AppError from './AppError.js';

class NotFoundError extends AppError {
  constructor(message = 'Not Found') {
    super(message, 404);
  }
}

export default NotFoundError;
```

- **Responsibility**: fix one HTTP status code (400/401/403/404/409) behind
  a descriptive class name.
- **Why so many tiny files instead of one file with five classes**: keeps
  each error's public interface (its name, importable from its own path)
  self-evident from the file tree — consistent with the project's
  one-concept-per-file convention used everywhere else (e.g., one error
  class per file, mirroring one controller per file later).
- **Interview question**: _"Why model errors as a class hierarchy instead
  of just checking `err.statusCode` values everywhere?"_ — Named classes
  make `throw new NotFoundError('Employee not found')` self-documenting at
  the call site, support `instanceof` checks if ever needed, and let
  future features (e.g., a global "did we handle this error type before?"
  check) branch on type rather than magic numbers.

### `src/utils/asyncHandler.js`

```js
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
```

- **Responsibility**: wrap an async route handler so any rejected promise
  is forwarded to `next(err)`.
- **Inputs**: `fn` — an `(req, res, next) => Promise` function (a
  controller method, once those exist).
- **Output**: a new function with the same `(req, res, next)` signature,
  safe to pass directly to Express (`router.get('/x', asyncHandler(fn))`).
- **Why `Promise.resolve(...)` wraps the call**: normalizes both a
  genuinely async function's return value and a synchronous function's
  return value into a promise uniformly, so `.catch(next)` always applies
  regardless of whether `fn` happens to be async.
- **Dependencies**: none — deliberately a pure, zero-dependency utility.
- **Best practice**: every controller method that touches a service (which
  is always `async`, since it may query the database) gets wrapped in this,
  for consistency, even though Express 5 no longer strictly requires it.
- **Interview question**: _"Why does this pattern exist at all — doesn't
  `try/catch` work fine inside each handler?"_ — It does, but repeating
  `try { ... } catch (err) { next(err) }` in every single controller is
  pure boilerplate that's easy to forget in exactly one place, silently
  reintroducing the hanging-request bug. `asyncHandler` makes the
  correct behavior the path of least resistance.

### `src/middlewares/notFound.middleware.js`

```js
import NotFoundError from '../errors/NotFoundError.js';

const notFoundMiddleware = (req, res, next) => {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
};

export default notFoundMiddleware;
```

- **Responsibility**: convert "no route matched" into the same typed-error
  pipeline every other failure uses.
- **Inputs**: standard `(req, res, next)`.
- **Output**: calls `next(err)` — produces no response itself.
- **Registration point**: must be registered in `app.js` _after_ every
  real route — Express middleware runs in registration order, so anything
  registered before this that matches the request short-circuits it, as
  intended.
- **Interview question**: _"Why not just let Express return its default
  404 page?"_ — Express's default 404 is an HTML page with a stack trace
  in development mode — inconsistent with the JSON API contract every
  other endpoint honors, and a minor information leak in production.

### `src/middlewares/error.middleware.js`

```js
const errorMiddleware = (err, req, res, _next) => {
  const statusCode = err.isOperational ? err.statusCode : 500;
  const message = err.isOperational ? err.message : 'Internal Server Error';

  if (!err.isOperational) {
    console.error(err);
  }

  const response = { status: 'error', message };

  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

export default errorMiddleware;
```

- **Responsibility**: the single place that decides the HTTP status code
  and JSON body for _any_ error in the entire application.
- **Inputs**: `(err, req, res, _next)` — the 4-argument signature Express
  uses to identify error-handling middleware (checked by `fn.length`, not
  by name).
- **Output**: a JSON response — never calls `next()` further, since it's
  terminal.
- **Operational vs. non-operational branch**: `AppError` instances (and
  subclasses) pass their own status/message through untouched; anything
  else (a genuine bug, an untranslated Prisma error) collapses to a
  generic `500` + generic message, so internals never leak to the client.
- **`console.error` here is a known, temporary stand-in** — flagged
  explicitly for replacement once the Winston logging feature lands.
- **`response.stack` gated on `NODE_ENV !== 'production'`**: stack traces
  are invaluable in development, but a real information-disclosure risk in
  production (file paths, internal package structure).
- **Interview question**: _"How would you prevent a database connection
  string from ever appearing in an API error response?"_ — By funneling
  every error through exactly one handler that only forwards
  `isOperational` errors' messages verbatim, and reduces everything else to
  a fixed generic string — so a raw Prisma/driver error (which might
  contain a connection string in its message) is caught by the
  `else` branch and never serialized to the client.

### `src/routes/index.js`

```js
import { Router } from 'express';

const router = Router();

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

export default router;
```

- **Responsibility**: the single router aggregator, mounted once in
  `app.js` at `/api/v1`.
- **Current content**: just `GET /health`. Future modules will add
  `router.use('/auth', authRouter)`, `router.use('/employees',
employeeRouter)`, etc., to this same file.
- **Why `/health` returns `200` + `{ status: 'ok' }` and nothing more**:
  health checks are polled frequently (by container orchestrators, load
  balancers) — the payload should be trivial to generate and parse, not a
  real query against the database (that's a separate "readiness" check
  concern for a later feature, if ever needed).
- **Interview question**: _"What's the difference between a liveness check
  and a readiness check, and which is this?"_ — This is a liveness check
  (is the process alive and responsive at all); a readiness check would
  additionally verify dependencies (e.g., can it currently reach
  PostgreSQL) before declaring itself able to serve real traffic — a
  distinction Kubernetes explicitly models with separate probe types.

### `src/app.js`

```js
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

import router from './routes/index.js';
import notFoundMiddleware from './middlewares/notFound.middleware.js';
import errorMiddleware from './middlewares/error.middleware.js';

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:4200',
  }),
);

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(express.json());

app.use('/api/v1', router);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
```

- **Responsibility**: assemble the entire Express application — the single
  place that defines middleware order.
- **Output**: a fully configured, but inert (no `.listen()`), `app` object.
- **Why inert**: keeps `app` importable by test tooling (e.g., `supertest`)
  without binding a real TCP port — tests can run in parallel with zero
  port-conflict risk.
- **Middleware order, and why it's fixed**:
  1. `helmet()` first — no dependency on anything else, applies to every
     response including error responses.
  2. `cors()` — origin decision before any real work happens.
  3. `morgan(...)` — logs even requests that fail later validation/auth.
  4. `express.json()` — must run before anything that reads `req.body`.
  5. the router — the actual application logic.
  6. `notFoundMiddleware` — must be after all real routes, or it would
     shadow them.
  7. `errorMiddleware` — must be registered dead last.
- **`morgan` format branches on `NODE_ENV`**: `'dev'` for readable local
  console output, `'combined'` (Apache-style) for production logs destined
  for a log aggregator.
- **`CORS_ORIGIN` / `NODE_ENV` read directly from `process.env`**: a
  temporary pattern, consistent across this whole feature, replaced
  wholesale once the Zod-validated config module exists.
- **Interview question**: _"Why does middleware order matter in Express,
  concretely?"_ — Express middleware forms a pipeline executed strictly in
  registration order; `express.json()` registered after a route that reads
  `req.body` would leave `req.body` `undefined` for that route, and an
  error handler registered before a route that can throw would never see
  that route's errors at all.

### `src/server.js`

```js
import app from './app.js';

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const shutdown = (signal) => {
  console.log(`${signal} received: closing server gracefully`);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
```

- **Responsibility**: the composition root — the only file that actually
  starts the process listening, and owns process-level lifecycle.
- **`PORT` fallback**: `process.env.PORT || 3000`, temporary until the
  config feature lands.
- **Graceful shutdown**: on `SIGTERM`/`SIGINT`, `server.close()` stops
  accepting _new_ connections but lets in-flight requests finish before
  the process exits — critical once this runs under Docker/Kubernetes,
  which sends `SIGTERM` before forcibly killing a container.
- **Fail-fast on `unhandledRejection`/`uncaughtException`**: both log
  loudly and call `process.exit(1)` rather than attempting to continue.
  Node's own documentation warns the process may be in an undefined state
  after either event (e.g., a half-completed transaction); a process
  manager (nodemon locally, a container orchestrator in production) is
  expected to restart the process cleanly afterward.
- **Interview question**: _"Why exit the process on an unhandled
  rejection instead of just logging and continuing?"_ — Continuing risks
  serving further requests from a process in an unknown, potentially
  corrupted state (leaked connections, partially-mutated in-memory state).
  Exiting and relying on the orchestration layer to restart trades a few
  seconds of downtime for a guaranteed-clean process — considered the
  safer default in production systems.

---

## 6. Request Lifecycle

Concrete walkthrough: `GET /api/v1/health`.

1. Node receives the raw TCP connection; `server.js`'s `app.listen(...)`
   hands it to `app`.
2. `helmet()` runs — stamps security headers onto the eventual response.
3. `cors()` runs — checks the request's `Origin` header against
   `CORS_ORIGIN`; allows or rejects accordingly.
4. `morgan(...)` runs — logs the incoming request line.
5. `express.json()` runs — no body on a `GET`, so this is a no-op here,
   but always runs so `req.body` is safe to read on any route that needs
   it.
6. Express matches `/api/v1` → delegates to `routes/index.js` → matches
   `GET /health`.
7. The handler runs: `res.status(200).json({ status: 'ok' })`.
8. Response leaves with Helmet's headers already attached from step 2.

And the failure path: `GET /api/v1/does-not-exist`.

1–5. Identical to above. 6. Express finds no matching route in `routes/index.js`. 7. `notFoundMiddleware` runs (registered after the router) — calls
`next(new NotFoundError('Route not found: GET /api/v1/does-not-exist'))`. 8. Express skips all remaining _normal_ middleware and jumps straight to
`errorMiddleware` (identified by its 4-argument signature). 9. `errorMiddleware` sees `err.isOperational === true`, so it responds
`404` with `{ status: 'error', message: '...' }` (plus `stack` outside
production).

This exact pipeline was verified live during this feature's implementation:
`/health` returned `200`, an unmatched route returned a clean `404` JSON
body through the real `notFoundMiddleware → errorMiddleware` path, and all
Helmet headers were present on both responses.

---

## 7. Best Practices

- **Security/logging middleware first, business logic last** — cross-
  cutting concerns should never be opt-in per route; put them where every
  request passes through them by construction.
- **Keep `app.js` free of `.listen()`** — the single biggest enabler of
  fast, parallel, in-process integration testing later.
- **One centralized error handler, never per-route try/catch chains for
  formatting responses** — consistency of the error contract is worth more
  than the marginal flexibility of handling each route's errors uniquely.
- **Distinguish operational errors from bugs explicitly** (`isOperational`)
  — this is what lets the same handler safely expose a `NotFoundError`'s
  message while hiding a database driver's internal error text.
- **Treat `unhandledRejection`/`uncaughtException` as fatal** — restart-on-
  crash (via a process manager) is safer than attempting in-process
  recovery from an unknown state.

---

## 8. Security Considerations

- **Helmet's defaults are intentionally conservative** — its baseline
  `Content-Security-Policy` restricts script/style/object sources; we will
  need to deliberately loosen specific directives later (e.g., for Swagger
  UI's inline scripts) rather than starting permissive and locking down
  reactively.
- **CORS must use an explicit origin, never `'*'` with credentials** — a
  wildcard origin combined with credentialed requests (cookies or
  `Authorization` headers) either fails per the CORS spec or, if naively
  worked around by reflecting any `Origin` back, defeats the same-origin
  protection entirely, letting any website make authenticated requests on
  behalf of a logged-in user's browser session.
- **Morgan's default format never logs bodies or headers** — avoids
  accidentally writing passwords or `Authorization: Bearer <token>` values
  into log output; any future custom log format must preserve this.
- **The error middleware is the single most common information-disclosure
  leak point in Express apps** — a raw `err.stack` or an untranslated
  ORM error can reveal file paths, query structure, or package versions;
  gating detail behind `NODE_ENV !== 'production'` and reducing all
  non-operational errors to a fixed generic message closes this off.
- **`Error.captureStackTrace`** ensures stack traces point at the actual
  throw site, which matters for debugging without needing to expose more
  detail than necessary to the client.

---

## 9. Performance Considerations

- **Helmet/CORS/Morgan overhead per request is negligible** (microseconds)
  — these are simple, synchronous header/log operations, not the kind of
  middleware that would show up in a profiler for a real bottleneck.
- **`asyncHandler`'s `Promise.resolve()` wrapper** adds one microtask tick
  per request — irrelevant compared to any real I/O (database queries)
  that will dominate actual request latency once those exist.
- **Graceful shutdown directly protects tail latency during deploys**: without
  it, a rolling deploy would abruptly drop in-flight requests every time a
  container is replaced; `server.close()` lets those finish first.
- **Future scalability**: because `app.js` builds a stateless app (no
  server-side session), horizontal scaling behind a load balancer is
  trivial once JWT auth lands — no sticky sessions required.

---

## 10. Common Mistakes

| Mistake                                                                 | Why it happens                                                                                      | How senior engineers avoid it                                                                               |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Registering the error handler before some routes                        | Copy-pasting middleware in "whatever order compiles"                                                | Treat middleware order as part of the design, documented and reviewed like any other architectural decision |
| Giving the error middleware fewer than 4 parameters                     | Refactoring and accidentally dropping the unused `next` parameter                                   | Know that Express checks `fn.length`, not intent — keep (and lint-ignore) the 4th parameter deliberately    |
| `cors({ origin: '*' })` "to make it work" while debugging               | Fighting a confusing browser CORS error under time pressure                                         | Understand _why_ the browser is blocking the request instead of disabling the protection entirely           |
| Returning `err.message` for every error unconditionally                 | Assuming all errors are "safe" to show the user                                                     | Explicitly branch on `isOperational` — only errors you threw on purpose are safe to surface verbatim        |
| Assuming `unhandledRejection` "can't happen" once `asyncHandler` exists | Forgetting that non-Express async code (e.g., a stray unawaited promise) can still reject unmanaged | Keep the process-level handler regardless, as a genuine last-resort safety net                              |

---

## 11. Interview Preparation

**Q: How does Express know a middleware function is meant to handle
errors?**

- _Concise answer_: by counting its parameters — exactly 4 arguments
  `(err, req, res, next)` marks it as error-handling middleware.
- _Detailed answer_: Express inspects `fn.length` at registration time.
  Regular middleware/handlers take `(req, res, next)` — 3 parameters.
  Error handlers take 4. This is why an error middleware must never drop
  its unused `next` parameter, even though it's rarely called — removing
  it silently reclassifies the function as regular middleware, which
  Express will never invoke via `next(err)`.
- _What interviewers are evaluating_: whether you understand a framework
  mechanic precisely enough to explain _why_ a seemingly cosmetic detail
  (parameter count) has functional significance — not just that "it has to
  be last."

**Q: Walk me through what happens if a controller's database call fails.**

- _Concise answer_: the rejected promise is forwarded via `asyncHandler`
  (or natively, in Express 5) to `next(err)`, which routes it to the
  centralized error middleware, which decides the client-facing response
  based on whether the error is a recognized operational error or not.
- _Detailed answer_: assuming the error isn't a typed `AppError` (e.g., a
  raw Prisma connection error), `err.isOperational` is `undefined`
  (falsy), so the middleware's `else` branch fires: it logs the full error
  server-side (currently via `console.error`, later Winston) and responds
  with a generic `500` + generic message — the client never learns
  anything about the database internals that actually failed.
- _What interviewers are evaluating_: whether you can trace a failure
  across multiple layers you didn't just describe abstractly, and whether
  you understand the operational/non-operational error distinction's
  actual security purpose.

**Q: Why might you choose to exit the process on an uncaught exception
rather than trying to recover in place?**

- _Concise answer_: the process may be in an undefined state after an
  uncaught exception; exiting and letting an orchestrator restart it is
  safer than continuing to serve traffic from unknown state.
- _Detailed answer_: Node's own documentation explicitly recommends this.
  An uncaught exception could have occurred mid-mutation of shared state
  (an in-memory cache, a connection pool's internal bookkeeping) — there's
  no general way to know it's safe to keep going. A supervising process
  (Docker's restart policy, Kubernetes, even `nodemon` locally) is
  designed to restart cleanly, trading a brief outage for guaranteed
  correctness afterward, rather than silently degrading.
- _What interviewers are evaluating_: production operational maturity —
  whether you've thought about failure modes beyond the happy path.

---

## 12. Summary

### Key Takeaways

- The middleware chain's _order_ is not cosmetic — it encodes real
  dependencies (body parsing before validation, auth before RBAC, error
  handling absolutely last).
- A typed error hierarchy (`AppError` + subclasses) plus one centralized
  handler is what lets every future feature `throw` with confidence instead
  of reinventing error-response shaping per route.
- Express 5's native async-rejection forwarding changes _why_ we keep
  `asyncHandler` (style/consistency) without changing _whether_ we keep it.

### Important Terminology

- **Operational error** vs. **programmer error** — expected failure modes
  you throw on purpose, versus genuine bugs.
- **Composition root** — the one place (`server.js`) where the fully
  assembled application is actually started.
- **Liveness check** — a health endpoint proving the process is alive and
  responsive, as distinct from a readiness check.

### Design Principles

- Cross-cutting concerns belong in the shared pipeline, never opt-in per
  route.
- Exactly one place decides the client-facing shape of any error.
- Fail fast on unknown process state rather than attempting silent
  recovery.

### Best Practices

- 4-argument signature for error middleware, registered last, always.
- Explicit `origin` allowlist for CORS, never a wildcard with credentials.
- Gate error detail (`stack`) behind `NODE_ENV`.
- Graceful shutdown on `SIGTERM`/`SIGINT` for clean container restarts.

---

## 13. Revision Notes (5-minute read)

- Middleware order: `helmet → cors → morgan → express.json() → routes →
notFoundMiddleware → errorMiddleware (last)`.
- Express identifies error middleware by **4 parameters**, not by name or
  comments.
- `AppError` + 5 subclasses (`BadRequest`/`Unauthorized`/`Forbidden`/
  `NotFound`/`Conflict`) give every thrown error a `statusCode` and marks
  it `isOperational = true`.
- The error middleware responds with the real message **only** for
  operational errors; everything else becomes a generic `500`.
- `asyncHandler` forwards async rejections to `next(err)` — kept for style
  consistency even though Express 5 no longer strictly requires it.
- `app.js` never calls `.listen()` — that's `server.js`'s job, keeping
  `app` importable for tests.
- `SIGTERM`/`SIGINT` trigger graceful shutdown; `unhandledRejection`/
  `uncaughtException` trigger a logged, deliberate `process.exit(1)`.
- `PORT`, `CORS_ORIGIN`, `NODE_ENV` are read directly from `process.env`
  for now — temporary until the Zod config feature.
- Error logging uses `console.error` for now — temporary until Winston.

---

## 14. One-Line Interview Answers

**Q: How does Express distinguish error middleware from regular
middleware?**
A: By counting its parameters — 4 arguments (`err, req, res, next`) marks
it as error-handling middleware.

**Q: Why keep an `isOperational` flag on custom errors?**
A: It lets the centralized error handler safely expose messages for
errors you threw on purpose while hiding internal details for genuine bugs.

**Q: Why doesn't `app.js` call `.listen()`?**
A: So the assembled app stays importable by test tooling without binding a
real port.

**Q: Why exit the process on an uncaught exception instead of continuing?**
A: The process may be in an undefined state afterward — exiting and
letting an orchestrator restart it is safer than serving traffic from
unknown state.

**Q: Why is `asyncHandler` still used even on Express 5, which handles
this natively?**
A: For explicit, consistent controller style across the codebase — not
out of functional necessity anymore.

---

## 15. Practical Examples From Our Codebase

Verified live behavior from this feature's implementation:

```
$ curl -i http://localhost:3000/api/v1/health
HTTP/1.1 200 OK
Content-Security-Policy: default-src 'self'; ...
X-Frame-Options: SAMEORIGIN
Access-Control-Allow-Origin: http://localhost:4200
Content-Type: application/json; charset=utf-8

{"status":"ok"}
```

```
$ curl -i http://localhost:3000/api/v1/does-not-exist
HTTP/1.1 404 Not Found
...(same Helmet headers)...
Content-Type: application/json; charset=utf-8

{"status":"error","message":"Route not found: GET /api/v1/does-not-exist","stack":"NotFoundError: ..."}
```

Note the `stack` field is present here because `NODE_ENV` is unset in
local development (falls through the `!== 'production'` check) — it will
disappear automatically once `NODE_ENV=production` is set, with zero code
changes required.

A known, honestly-documented limitation from this feature's verification:
graceful shutdown (`SIGTERM` handling) could not be proven on native
Windows — Windows does not deliver POSIX signals to arbitrary external
processes the way Linux does; `Stop-Process` force-kills rather than
signaling. The code is correct by inspection and will behave properly
under Docker (even Docker Desktop on Windows, which runs a Linux VM) or in
production Linux — verified interactively via `Ctrl+C` (`SIGINT`, which
Windows _does_ deliver to a process's own console) instead.
