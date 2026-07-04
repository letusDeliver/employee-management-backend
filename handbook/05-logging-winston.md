# Chapter 5: Logging (Winston)

## 1. Introduction

This feature introduces `src/config/logger.js` — a single, configured
Winston logger — and retires every remaining `console.log`/`console.error`
call in the codebase: the startup/shutdown messages and fatal-error
handlers in `server.js`, and the error logging in `error.middleware.js`.
Morgan's HTTP access logs, which previously wrote directly to `stdout`,
are also redirected through this same logger.

It exists because `console.*` gives you unstructured text with no levels,
no routing, and no way to change behavior between environments without
editing code. Every feature from here on that needs to log anything
(Auth attempts, RBAC denials, business errors) now has one correct place
to do it.

In the architecture, `logger.js` joins `env.js` and `database.js` in
`config/` — the third "one shared, validated instance" module in that
folder, following the exact same pattern established in Chapters 3 and 4.

---

## 2. Theory

**The problem with `console.log`/`console.error`**: no levels, no
structure, no routing, and no way to differ between "readable text for a
human watching a terminal" and "structured JSON for a machine to index."

**Winston's model**: a **logger** combines a **level** (how severe does
this need to be to get logged), a **format** (a pipeline of transforms —
timestamps, colorization, JSON serialization, custom layouts), and one or
more **transports** (where the log actually goes — console, file, or
elsewhere). A single `logger.info(...)` call can simultaneously write
colorized text to the console and structured JSON to a file, because both
are just transports attached to the same logger.

**The stack-trace gotcha**: Winston does not automatically preserve a
logged `Error` object's stack trace — `winston.format.errors({ stack:
true })` is required, or logging an `Error` silently keeps only its
`.message`. This was verified directly (see section 6) rather than assumed.

**npm log levels and their ordering** — this matters more than it looks:

```
error (0) < warn (1) < info (2) < http (3) < verbose (4) < debug (5) < silly (6)
```

A **lower number is more severe**. Setting a logger's level to `X` means
"log `X` and everything _more severe_ (lower number)," and _suppress_
anything less severe (higher number). This ordering directly caused one of
the two real bugs this feature caught — see section 10.

---

## 3. Architecture

### Data Flow

```
Application code                 HTTP requests (via Morgan)
      │                                  │
      ▼                                  ▼
logger.info/warn/error(...)      { write: msg => logger.http(msg) }
      │                                  │
      └──────────────┬───────────────────┘
                      ▼
        Winston logger (config/logger.js)
     format: timestamp + errors({stack:true})
                      │
        ┌─────────────┼─────────────────┐
        ▼             ▼                 ▼
   Console        logs/error.log   logs/combined.log
  (colorized       (level:            (configured
   dev / JSON        'error' only)      level and up)
   prod)
```

### Layer Responsibilities

| Layer                             | Responsibility                                                                        | Must NOT do                                               |
| --------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `config/logger.js`                | Define levels, format, and transports once                                            | Contain any HTTP/Express/Prisma-specific logic            |
| `server.js`                       | Log lifecycle events (`info`) and fatal errors (`error`), guarantee flush-before-exit | Call `console.*` anymore                                  |
| `app.js`                          | Bridge Morgan's access-log stream into `logger.http(...)`                             | Let Morgan write to `stdout` directly                     |
| `middlewares/error.middleware.js` | Log operational errors at `warn`, non-operational at `error`                          | Decide the HTTP response shape (unchanged from Chapter 2) |

### Where This Sits in the Full Clean Architecture

Like `env.js`, this feature touches boot-time configuration and
cross-cutting concerns, not the request-handling pipeline's business logic:

```
Process boot
    ↓
config/env.js  → config/logger.js   ← THIS FEATURE
    ↓
server.js → app.js → (middleware chain) → routes → ...
                          │
                   every layer can `import logger from '.../config/logger.js'`
                   and log through the same shared instance
```

---

## 4. Folder Structure

```
src/
└── config/
    └── logger.js       (new) — the single configured Winston logger

logs/                    (already reserved since Chapter 1)
├── error.log            (now actually populated) — error level only
└── combined.log         (now actually populated) — configured level and up
```

No new folders. Three existing files were modified to consume the logger:
`server.js`, `app.js`, `middlewares/error.middleware.js`.

---

## 5. File-by-File Explanation

### `src/config/logger.js`

```js
import winston from 'winston';

import env from './env.js';

// npm levels: error(0) < warn(1) < info(2) < http(3) < verbose(4) < debug(5).
// A level allows itself and everything MORE severe (lower number) through, so
// production must use 'http' (not 'info') or Morgan's access logs would be
// silently dropped.
const levelByEnv = {
  development: 'debug',
  production: 'http',
  test: 'warn',
};

const consoleFormat =
  env.NODE_ENV === 'production'
    ? winston.format.json()
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          return `${timestamp} [${level}]: ${stack || message}`;
        }),
      );

const logger = winston.createLogger({
  level: levelByEnv[env.NODE_ENV],
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
  ),
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.json(),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.json(),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

export default logger;
```

- **Responsibility**: the only file that configures Winston; every other
  file just imports the finished `logger` instance.
- **`levelByEnv` and why `production` maps to `'http'`, not `'info'`**: a
  real bug caught during implementation (detailed in section 10) — using
  `'info'` in production would silently drop every Morgan access log,
  since `http` (3) is a _higher_, less-severe number than `info` (2).
- **Base format (`timestamp` + `errors({ stack: true })`) applied at the
  logger level**, before any transport-specific formatting — every log
  entry gets a timestamp and, if the logged value is an `Error`, its stack
  extracted into `info.stack`, regardless of which transport eventually
  renders it.
- **Per-transport format for final presentation**: the console format
  differs by environment (colorized human-readable text in development,
  JSON in production, matching what a container's stdout collector usually
  expects); both file transports always use `winston.format.json()`,
  regardless of environment, since a log _file_ is for machines/tools to
  read, not a human watching a terminal.
- **`maxsize`/`maxFiles`**: Winston's built-in size-based rotation — once
  `error.log` or `combined.log` hits 5MB, it rotates, keeping at most 5
  files, with no extra dependency needed.
- **Interview question**: _"Why does the file transport format always stay
  JSON regardless of environment, while the console format changes?"_ —
  The two outputs serve different consumers: the console is for a human
  developer reading terminal output right now; the file is for tooling
  (log aggregators, `grep`, future analysis) that benefits from a
  consistent, parseable shape no matter what environment produced it.

### `src/server.js` (modified)

```js
import env from './config/env.js';
import logger from './config/logger.js';
import app from './app.js';

const PORT = env.PORT;

const exitAfterFlush = (code) => {
  logger.once('finish', () => process.exit(code));
  logger.end();
};

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

const shutdown = (signal) => {
  logger.info(`${signal} received: closing server gracefully`);
  server.close(() => {
    logger.info('Server closed');
    exitAfterFlush(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error(reason instanceof Error ? reason : new Error(String(reason)));
  exitAfterFlush(1);
});

process.on('uncaughtException', (err) => {
  logger.error(err);
  exitAfterFlush(1);
});
```

- **`exitAfterFlush(code)`**: the verified-correct pattern for guaranteeing
  a log is actually written before the process exits — `logger.once
('finish', ...)` registers a one-time listener, `logger.end()` signals no
  more writes are coming and triggers the underlying streams to flush; only
  once that's genuinely done does `'finish'` fire and `process.exit(code)`
  run.
- **Used consistently for _both_ the graceful-shutdown path and the fatal-
  error handlers** — not just the crash paths. Even a clean shutdown's
  final "Server closed" log deserves the same flush guarantee.
- **`unhandledRejection`'s `reason` isn't guaranteed to be an `Error`** —
  a rejected promise can reject with any value. Wrapping non-`Error`
  reasons in `new Error(String(reason))` ensures `errors({ stack: true })`
  has something meaningful to extract a stack from either way.
- **Interview question**: _"Why not just call `logger.error(err,
callback)` and exit inside the callback?"_ — Tried exactly this first,
  and verified via a scratch script that the callback never fires the way
  the naive assumption expects — Winston's level-method callback isn't
  documented/behaves reliably as a "written to all transports" signal in
  practice. `logger.end()` + the `'finish'` event is the actually-verified
  mechanism for "wait until everything is flushed."

### `src/app.js` (modified)

```js
const morganStream = {
  write: (message) => logger.http(message.trim()),
};

// Always use 'combined' (uncolored) here - Winston's own console transport
// decides colorized-vs-JSON presentation; Morgan's colorized 'dev' format
// would otherwise leak raw ANSI escape codes into the JSON log files.
app.use(morgan('combined', { stream: morganStream }));
```

- **The `stream` option**: Morgan accepts any object with a `.write(message)`
  method as its output destination instead of `stdout` — this is exactly
  Node's standard "duck-typed stream" convention, and it's all that's
  needed to redirect Morgan's formatted line into `logger.http(...)`.
- **Why `'combined'` unconditionally now, instead of `'dev'` in
  development**: a real bug, caught by inspecting the actual log file
  contents (section 10) — Morgan's `'dev'` format embeds ANSI color codes
  for terminal display; piped verbatim into a JSON log file, those escape
  codes show up as garbage (`[32m...`) instead of a clean message.
  Presentation is now Winston's job alone.
- **Interview question**: _"Why does the HTTP access log go through
  `logger.http(...)` instead of just keeping Morgan's own console output?"_
  — Consolidation: with one logger, one configuration change (e.g., "also
  ship logs to an external aggregator") affects access logs and
  application logs identically. Two independent logging paths would mean
  maintaining that configuration twice, and risk them drifting out of sync
  with each other in production.

### `src/middlewares/error.middleware.js` (modified)

```js
import logger from '../config/logger.js';

const errorMiddleware = (err, req, res, _next) => {
  const statusCode = err.isOperational ? err.statusCode : 500;
  const message = err.isOperational ? err.message : 'Internal Server Error';

  if (err.isOperational) {
    logger.warn(err.message);
  } else {
    logger.error(err);
  }
  // ...unchanged response-shaping logic below
};
```

- **The `warn`/`error` split**: an intentional enhancement beyond simply
  swapping `console.error` for `logger.error`. Operational errors
  (`NotFoundError`, `ConflictError`, etc.) are _expected_ failure modes —
  logging them at `warn` gives visibility into their frequency (e.g., "how
  often do clients hit routes that don't exist") without treating them as
  bugs. Non-operational errors are genuinely unexpected — `error` level,
  full stack captured automatically by the base format.
- **Interview question**: _"Why bother logging errors that are already
  being handled correctly (a clean 404 response, say)?"_ — Correct HTTP
  handling and operational visibility are different concerns. A spike in
  404s might indicate a broken frontend link, a misconfigured client,
  or (recall Chapter 2's health-check discussion) a legitimate
  reconnaissance/probing pattern worth noticing — none of which shows up
  if the only record is the response the client received.

---

## 6. Request Lifecycle

### The verification that caught the flush-callback bug

1. A scratch script called `logger.error(err)` inside a `try/catch` to
   confirm stack capture, then separately called `logger.error('flush test
message', callback)`, expecting the callback to fire once the write
   completed.
2. Output showed the error log with a full, correct stack trace — stack
   capture confirmed working. But the callback **never fired** — no
   `CALLBACK_FIRED` line, no `process.exit(0)` — the script's process
   simply ran to natural completion instead.
3. Rewritten using `logger.on('finish', callback)` + `logger.error(...)` +
   `logger.end()` — this time, the synchronous line after `logger.end()`
   printed _first_, and the `'finish'` event fired afterward, confirming
   both that this is genuinely asynchronous and that it reliably signals
   completion. This became the pattern used in `server.js`.

### The live request trace, once everything was correct

1. `GET /api/v1/health` → passes through `helmet → cors → morgan`.
   Morgan formats the line via `'combined'`, calls
   `morganStream.write(message)`, which calls `logger.http(message.trim())`.
2. The route handler responds `200`.
3. `GET /api/v1/does-not-exist` → same middleware chain, no route
   matches → `notFoundMiddleware` throws a `NotFoundError` →
   `errorMiddleware` sees `err.isOperational === true` → `logger.warn(err.
message)` → responds `404`. Morgan then also logs this same request at
   `http` level, exactly like the successful requests.
4. All three requests were verified to appear correctly in both the
   console (colorized) and `logs/combined.log` (clean JSON, no ANSI
   codes, after the Morgan-format fix) — with `logs/error.log` correctly
   staying empty, since none of these were `error`-level events.

---

## 7. Best Practices

- **One shared logger, following the same pattern as `env.js`/
  `database.js`** — every file that needs to log imports this one
  instance.
- **Verify a library's actual documented-callback behavior before relying
  on it for something as important as "did my fatal-error log actually get
  written before the process exited."** This project has now verified
  Express 5, Prisma 7, Zod 4, and Winston 3's actual behavior directly,
  rather than trusting assumptions, each time catching something real.
- **Structured (JSON) output for files, human-readable for the console** —
  different consumers, different formats, decided in exactly one place.
- **Correct level discipline**: `error` for bugs, `warn` for expected-but-
  worth-tracking failures, `info` for lifecycle events, `http` for access
  logs.
- **Understand your logging library's level _ordering_, not just its
  level _names_** — the production-level bug in this chapter existed
  entirely because "info sounds like a reasonable default" without
  checking where `http` actually sits relative to it.

### Security implications

- **Never log secrets or full request bodies** — nothing logged in this
  feature is sensitive yet, but this is the discipline to carry forward
  once Auth introduces credentials worth protecting.
- **`logs/*.log` stays gitignored** (true since Chapter 1) — these files
  can contain full stack traces revealing internal file paths.
- **Size-based rotation caps unbounded disk growth** — without
  `maxsize`/`maxFiles`, a busy or misbehaving process could fill the disk
  with log data indefinitely.

---

## 8. Performance Considerations

- **Logging cost is proportional to log volume, not request volume** — the
  `http`-level access log is one Winston call per request, which is cheap;
  the actual cost driver is _how much_ gets logged at high-frequency
  levels (verbose/debug) in production, which is exactly why production's
  level (`http`) excludes those.
- **File transport writes are asynchronous** — they don't block the
  request/response cycle; the flush-before-exit concern from this chapter
  only matters at process-termination time, not during normal request
  handling.
- **Winston vs. faster alternatives (`pino`)**: acknowledged as a real
  trade-off in the theory discussion — Winston does more per-call
  formatting work than `pino`, which matters at very high request volumes.
  For this project's current scale, Winston's transport flexibility and
  documentation clarity were judged more valuable than raw throughput.

---

## 9. Common Mistakes

| Mistake                                                                                                     | Why it happens                                                                | How senior engineers avoid it                                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Assuming a library's callback parameter means what its name suggests                                        | Reasonable-sounding assumption, easy to not double-check                      | Write a two-line scratch test for anything load-bearing (like "did this log actually get written") before trusting it                     |
| Setting a production log level based on "sounds about right" instead of the library's actual level ordering | `'info'` sounds like a sensible default                                       | Write out the full level ordering and check which levels your production config needs, explicitly, as done in this chapter's code comment |
| Piping a colorized/terminal-formatted string into a structured log destination                              | The string works fine when you `console.log` it directly, so it looks correct | Inspect the _actual_ file/aggregator output, not just the console, before considering a logging pipeline done                             |
| Logging `Error` objects without a stack-capturing format                                                    | The message is right there, so it looks like it's working                     | Explicitly test that a real `Error`'s `.stack` survives the full logging pipeline, not just its `.message`                                |
| Calling `process.exit()` immediately after an async log write                                               | Feels synchronous because `console.log` usually is                            | Understand that any I/O-backed transport (a file) is asynchronous, and use the library's actual flush/completion mechanism                |

---

## 10. Interview Preparation

**Q: Walk me through a real bug you'd only catch by testing, not by
reading documentation.**

- _Concise answer_: this project's flush-callback assumption — `logger.
error(msg, callback)` was assumed to fire only after the write completed;
  it doesn't, verified directly by testing.
- _Detailed answer_: the natural assumption reading Winston's API loosely
  is "pass a callback, it fires when done" — a pattern common enough
  elsewhere (Node's `fs.writeFile(path, data, callback)`, for instance)
  that it's easy to extend the assumption. A two-line scratch script
  proved the callback never fires in this usage, while the documented
  `logger.on('finish', cb)` + `logger.end()` pattern reliably does. This
  is exactly the kind of gap between "how an API is often used elsewhere"
  and "how this specific API actually behaves" that only direct testing
  closes.
- _What interviewers are evaluating_: whether you treat library behavior
  as something to verify for anything load-bearing, rather than something
  to assume from surface-level familiarity with similar-looking APIs.

**Q: Why would setting a production log level to `'info'` be a bug in a
system that also logs HTTP access logs at `'http'`?**

- _Concise answer_: npm's level ordering places `http` as _less_ severe
  than `info`; a level of `'info'` only allows `info` and more severe
  levels through, silently dropping every `http`-level entry.
- _Detailed answer_: the ordering (`error < warn < info < http < verbose <
debug < silly`) is not alphabetical or intuitive from the names alone —
  `http` sitting between `info` and `verbose` is a design choice specific
  to the npm logging levels convention. Anyone assuming "http sounds
  important, surely info-level would include it" would ship a production
  config that silently has no access logs at all — a real, hard-to-notice
  regression, since the application would otherwise appear to work fine.
- _What interviewers are evaluating_: attention to a library's actual
  documented ordering/semantics rather than pattern-matching on names.

**Q: Why keep file-transport logs in JSON even during local development,
when a human is reading the console anyway?**

- _Concise answer_: the console and the file serve different audiences —
  a human watching the terminal right now, versus tooling (or a future
  you) that will `grep`/parse the file later.
- _Detailed answer_: if development's file logs used the same colorized/
  human format as the console, any tooling built against those files
  (log parsers, search scripts, or the eventual production log
  aggregator) would need to handle two different formats depending on
  environment — needless inconsistency. Keeping file output JSON
  everywhere means the _shape_ of a log entry never changes, only its
  content/verbosity does.
- _What interviewers are evaluating_: understanding that "readable" and
  "parseable" are different goals that don't have to be served by the
  same output.

---

## 11. Summary

### Key Takeaways

- Winston's level/format/transport model lets one logger call serve
  multiple destinations with different presentations simultaneously.
- npm's level _ordering_ (not just level names) determines what a given
  configured level actually allows through — verify this explicitly.
- Verifying load-bearing library behavior directly (again, this chapter)
  continues to catch real bugs this project would otherwise have shipped.

### Important Terminology

- **Transport** — a logging destination (console, file, etc.) attached to
  a Winston logger.
- **Level ordering** — the npm convention where a lower numeric level is
  more severe, and a configured level allows itself and everything more
  severe through.
- **Flush** — ensuring buffered/asynchronous writes have actually
  completed before considering an operation (like process exit) safe.

### Design Principles

- One shared, centrally-configured logger, following the `env.js`/
  `database.js` precedent.
- Presentation (human-readable vs. machine-parseable) decided once, in
  the logger config — not left to whatever library happens to write to a
  given stream.
- Verify, don't assume, for anything where being wrong is expensive to
  discover later (a fatal-error log silently never being written; a
  production access log silently never existing).

### Best Practices

- `errors({ stack: true })` for any logger expected to log `Error` objects.
- `logger.once('finish', cb)` + `logger.end()` for guaranteed flush before
  exit — never a bare callback argument assumption.
- JSON for files, human-readable for console, decided by environment only
  for the console.

---

## 12. Revision Notes (5-minute read)

- `src/config/logger.js` is the single configured Winston logger; no file
  elsewhere calls `console.*` for application logging anymore.
- npm levels: `error(0) < warn(1) < info(2) < http(3) < verbose(4) <
debug(5)` — lower number is more severe; a level allows itself and
  everything more severe through.
- Production level is `'http'`, **not** `'info'` — using `'info'` would
  silently drop all HTTP access logs.
- `winston.format.errors({ stack: true })` is required for a logged
  `Error`'s stack trace to actually survive — verified directly.
- The correct flush-before-exit pattern is `logger.once('finish', cb)` +
  `logger.end()` — **not** a callback argument to `logger.error(...)`,
  which was tested and does not work as assumed.
- Morgan always uses `'combined'` (uncolored) now — its colorized `'dev'`
  format was leaking raw ANSI codes into JSON log files.
- `error.middleware.js`: operational errors → `logger.warn`; non-
  operational → `logger.error` (with stack).
- File transports (`logs/error.log`, `logs/combined.log`) always use JSON,
  regardless of environment; only the console format varies.
- Both file transports use built-in `maxsize`/`maxFiles` rotation — no
  extra dependency needed yet.

---

## 13. One-Line Interview Answers

**Q: Why does `production: 'info'` silently break HTTP access logging?**
A: `http` (3) is less severe than `info` (2) in npm's level ordering, so an
`'info'`-level logger drops every `http`-level entry.

**Q: Why is `winston.format.errors({ stack: true })` necessary?**
A: Without it, logging an `Error` object keeps only its message and
silently discards the stack trace.

**Q: Why `logger.once('finish', cb)` + `logger.end()` instead of a
callback argument to `logger.error()`?**
A: Testing showed the callback argument doesn't reliably fire on write
completion; `'finish'` after `.end()` is the pattern that actually works.

**Q: Why does Morgan always use `'combined'` now instead of `'dev'` in
development?**
A: `'dev'` embeds ANSI color codes meant for terminal display, which
leaked as garbled escape sequences into the JSON log files when piped
through the logger.

**Q: Why log operational errors (like a 404) at all, if the response is
already correct?**
A: Correct HTTP handling and operational visibility are different
concerns — knowing how often expected failures occur is useful signal
even when each individual request was handled properly.

---

## 14. Practical Examples From Our Codebase

The flush-callback bug, as actually observed:

```js
// Assumed this would print CALLBACK_FIRED and then exit - it never did:
logger.error('flush test message', () => {
  console.log('CALLBACK_FIRED: log write completed');
  process.exit(0);
});
```

The verified-correct replacement:

```js
logger.on('finish', () => {
  console.log('FINISH_EVENT_FIRED: all transports flushed');
  process.exit(0);
});
logger.error('flush test via end()');
logger.end();
// Output confirmed: the synchronous line after this prints FIRST,
// then FINISH_EVENT_FIRED prints after - proving it's genuinely async
// and genuinely waits for completion.
```

The ANSI-leak bug, visible directly in `logs/combined.log` before the fix:

```
{"level":"http","message":"[0mGET /api/v1/health [32m200[0m 5.775 ms - 15[0m", ...}
```

And after switching Morgan to `'combined'`:

```
{"level":"http","message":"::1 - - [04/Jul/2026:13:21:57 +0000] \"GET /api/v1/health HTTP/1.1\" 200 15 \"-\" \"curl/8.17.0\"", ...}
```

A live verification snippet from `logs/combined.log`, showing an
operational-error `warn` entry alongside its corresponding `http` access
log line for the same request:

```
{"level":"warn","message":"Route not found: GET /api/v1/nope", ...}
{"level":"http","message":"::1 - - [...] \"GET /api/v1/nope HTTP/1.1\" 404 1180 ...", ...}
```

`logs/error.log` correctly stayed empty across this same verification run,
since no `error`-level event occurred — confirming the level-based file
routing works as designed.
