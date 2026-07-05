# Chapter 13: Swagger / OpenAPI Docs

## 1. Introduction

This feature adds an interactive, machine-readable API reference —
Swagger UI at `GET /api-docs`, backed by an OpenAPI 3.0 document at
`GET /api-docs.json` — generated directly from the same Zod validation
schemas that already enforce every request in this API. It does not
replace `handbook/API_ENDPOINTS.md`; that document stays the deep,
prose-level reference (every status code, negative testing, security
testing). Swagger is the quick, "try it right now in the browser" layer.

Like Feature 12, this feature ran a dedicated pre-implementation design
review (10 dimensions) before any code was written, producing a small
checklist folded into the plan. Unlike a purely theoretical review, live
verification afterward still found **two real bugs** the review couldn't
have caught — both about how a specific library (`zod`) and a specific
middleware (`helmet`) actually behave at runtime, not about this
project's own logic.

## 2. Theory

**Why generate docs from Zod instead of hand-writing them**: this API
already has one authoritative description of every request shape — the
Zod schema in each module's `*.validation.js` file, which actually
enforces that shape on every request. A hand-written OpenAPI schema next
to it would be a second description of the same fact, free to drift the
moment one changes and the other doesn't. `@asteasolutions/zod-to-openapi`
removes that risk by generating the OpenAPI schema from the same object
Zod validates with — a `.meta({ id, description, example })` call adds
metadata to the existing schema, it doesn't create a parallel one.

**What Zod can't cover, by construction**: this API validates _inputs_
with Zod but has no equivalent for _outputs_ — there's no schema
describing what a successful response looks like. Response schemas
(`User`, `Employee`, `EmployeeDocument`, pagination) in
`src/docs/components/schemas.js` are therefore hand-written, mirroring
the real Prisma models. This is an honest, named gap, not a hidden one:
if those models change and the docs aren't updated, `/api-docs` and
reality can drift on the _response_ side even though the _request_ side
structurally cannot.

**Why `Employee.salary` had to be documented as a string, not a number**:
Prisma's `Decimal` type serializes to a JSON string over the wire — this
was already a known fact in this codebase (`normalizeForAudit()` in
Feature 11 exists because of it), but it's exactly the kind of detail a
schema written by listing Prisma column _types_ rather than checking the
actual JSON response would get wrong. Caught during the pre-implementation
review, before any schema code was written, then re-confirmed against a
real `GET /employees` response during verification.

**The `z.coerce.boolean()` footgun, found only by testing the actual
value `"false"`**: `z.coerce.boolean()` calls JavaScript's `Boolean()`
constructor internally. `Boolean("false")` is `true` — any non-empty
string is truthy in JavaScript, regardless of what it says. The original
`ENABLE_SWAGGER: z.coerce.boolean().default(false)` schema silently
enabled Swagger even when the environment variable was the literal string
`"false"`. This is invisible from reading the schema or the Zod docs — it
only surfaces when you actually set the variable to that exact string and
check the result, which is exactly how it was caught here. The fix reads
the raw string and compares it explicitly: only the literal `"true"`
(case-insensitive) counts as enabled.

**Why Helmet's CSP had to be relaxed for exactly one path**: Helmet's
default Content-Security-Policy blocks inline `<script>`/`<style>` tags
by default — a real, standard protection against XSS on HTML-rendering
pages. Swagger UI's served HTML page uses both. This app has exactly one
HTML-rendering surface in the entire codebase (every other route returns
JSON) — Swagger UI itself. Relaxing CSP globally would be sloppy (it would
silently stop protecting a page that doesn't exist yet, if one ever is
added); relaxing it only for requests under `/api-docs`, and only when
`ENABLE_SWAGGER` is actually true, keeps every other response's security
posture completely unchanged.

## 3. Architecture

```
                    ┌─────────────────────────────┐
                    │   src/docs/openapi.registry.js│  ← one shared OpenAPIRegistry
                    └──────────────┬──────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
components/security.js   components/responses.js   components/schemas.js
 (bearerAuth, cookieAuth)   (ErrorResponseSchema)     (User, Employee, ...)
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   │
      auth.docs.js  user.docs.js  employee.docs.js  employeeDocument.docs.js
   (registerPath() calls, importing each module's own *.validation.js)
                                   │
                                   ▼
                    src/docs/openapi.document.js
              (imports everything above, then generateDocument())
                                   │
                                   ▼
                    src/docs/swagger.routes.js
        (GET /api-docs.json, GET /api-docs — swagger-ui-express)
                                   │
                                   ▼
                app.js — mounted only if env.ENABLE_SWAGGER
```

Cross-cutting OpenAPI machinery lives in `src/docs/`, matching where
`src/config/` and `src/middlewares/` already live. **Path** registration
lives next to each module's own routes and validation — a new module adds
one `<module>.docs.js` file, not a change to the shared registry.

## 4. Folder Structure

```
src/docs/
├── openapi.registry.js
├── openapi.document.js
├── swagger.routes.js
├── system.docs.js              # /health, /ready (no dedicated module to live in)
└── components/
    ├── security.js             # bearerAuth, cookieAuth
    ├── responses.js            # ErrorResponseSchema + errorResponse()/jsonResponse() builders
    └── schemas.js               # User, Employee, EmployeeDocument, PaginationMeta

src/modules/auth/auth.docs.js
src/modules/users/user.docs.js
src/modules/employees/employee.docs.js
src/modules/employees/employeeDocument.docs.js
```

## 5. File-by-File Explanation

- **`openapi.registry.js`** — `export default new OpenAPIRegistry()`. Every
  other file in this feature imports this same instance and registers
  against it.
- **`components/security.js`** — registers `bearerAuth` (`type: http,
scheme: bearer`) for the access token, and a separate `cookieAuth`
  (`type: apiKey, in: cookie`) for the two routes (`/auth/refresh`,
  `/auth/logout`) that actually authenticate via the `refreshToken`
  cookie, not a Bearer header. Two schemes, because they're two genuinely
  different mechanisms — reusing `bearerAuth` for both would document a
  mechanism neither of those two routes uses.
- **`components/responses.js`** — one `ErrorResponseSchema`
  (`{status: 'error', message: string}`), matching the _single_ real error
  shape this API ever produces (`error.middleware.js`), plus
  `errorResponse()`/`jsonResponse()` helpers so every `registerPath` call
  writes `errorResponse('Invalid request body')` instead of re-typing the
  full `content.application/json.schema` object each time.
- **`components/schemas.js`** — hand-written response schemas. Two details
  worth remembering: `EmployeeSchema.salary` is `z.string()` (Decimal →
  JSON string), and `UserPublicSchema` includes `roles` (attached by
  `sanitizeUser()`, not a raw Prisma column).
- **`<module>.docs.js` files** — each imports its module's existing
  `*.validation.js` schemas directly (no duplication) and calls
  `registry.registerPath()` once per route, with `security` cross-checked
  against that module's real `*.routes.js` middleware chain.
- **`openapi.document.js`** — imports every file above (for the
  side-effecting `registerPath()` calls), then calls
  `new OpenApiGeneratorV3(registry.definitions).generateDocument(...)`.
  Import order matters here: every path must be registered before
  `generateDocument()` runs.
- **`swagger.routes.js`** — `GET /api-docs.json` (raw document) and
  `GET /api-docs` (`swagger-ui-express`'s `serve`/`setup`). Only ever
  imported by `app.js` when `env.ENABLE_SWAGGER` is true.

## 6. Request Lifecycle

For a request to `GET /api-docs` when enabled:

```
Request → app.js's CSP-relaxing wrapper (skips CSP for this path)
        → other Helmet protections still applied (frameguard, noSniff, ...)
        → cors → cookieParser → morgan → express.json()
        → swaggerRouter (mounted after /api/v1, before notFoundMiddleware)
        → swaggerUi.serve, swaggerUi.setup(openApiDocument)
        → the pre-generated document is served, not regenerated per-request
```

The OpenAPI document itself is generated **once**, at import time (module
top-level in `openapi.document.js`), not on every request — the same
"expensive work happens once at boot, not per-request" principle already
used for the Prisma client singleton and the permission cache.

## 7. Best Practices

- Annotate the schema Zod already validates with (`.meta()`), never write
  a second one.
- Give every response schema meant to be reused across endpoints (errors,
  pagination, resource shapes) a stable `.meta({ id })` — anonymous
  schemas render as inline duplicates in the UI; named ones render as
  shared, linkable models.
- Cross-check `security` on every path against the route's actual
  middleware chain, not memory or the plan document — a docs-says-public/
  actually-protected mismatch (or the reverse) actively misleads whoever
  tests against it, which is worse than no documentation at all.
- Keep the exposure toggle a real environment variable, defaulted to
  _off_ in every environment — never tie it implicitly to `NODE_ENV`,
  since that silently changes behavior on every environment rename or new
  deployment target.

## 8. Performance Considerations

Negligible steady-state cost: the OpenAPI document is built once at
process startup (a few hundred `registerPath` calls resolving to one JSON
object), then served as-is from memory on every request — no
per-request regeneration, no database calls. When `ENABLE_SWAGGER` is
false, none of `src/docs/`'s generation code even runs (`swagger.routes.js`
is dynamically `import()`-ed only inside the `if` branch in `app.js`), so
a production deployment that leaves it off pays zero cost for this
feature beyond the dependency being installed.

## 9. Common Mistakes

| Mistake                                                                          | Why it's wrong here                                                                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Hand-writing OpenAPI schemas next to Zod validation schemas                      | Two descriptions of the same shape, free to drift the moment one changes                                |
| Using `z.coerce.boolean()` for an env var                                        | Treats the literal string `"false"` as `true` — verified live, not assumed                              |
| Applying `helmet({ contentSecurityPolicy: false })` globally to fix Swagger UI   | Weakens CSP protection for the whole app to fix one page; scope the relaxation to that one path instead |
| Tying `ENABLE_SWAGGER` to `NODE_ENV` instead of its own variable                 | Silently changes behavior if `NODE_ENV` values or environments are ever renamed/added                   |
| Documenting `Employee.salary` as a number because Prisma's schema says `Decimal` | Decimals serialize to strings in the actual JSON response — check the wire format, not the ORM type     |
| Trusting `security` annotations from memory                                      | Only cross-checking against the real `*.routes.js` middleware chain catches a docs/reality mismatch     |

## 10. Interview Preparation

**Q: Why derive OpenAPI schemas from Zod instead of maintaining them
separately?**
A: A hand-maintained OpenAPI schema and the Zod schema that actually
validates requests are two sources of truth for the same fact — they can
diverge silently the moment one is updated and the other isn't. Deriving
one from the other means there's structurally only one thing to keep
correct.

**Q: What's a case where generated docs can _still_ be wrong?**
A: Anything Zod doesn't validate — in this app, every response shape.
There's no output-validation library here, so response schemas are
hand-written and can drift from the real Prisma models if those change
without a corresponding docs update. Request/response validation
asymmetry is common in real APIs, and it's worth naming explicitly rather
than implying "generated" means "always correct."

**Q: Describe a real bug you'd only find by testing, not by reading a
library's docs.**
A: `z.coerce.boolean()` on an environment variable. It calls JavaScript's
`Boolean()` constructor, and `Boolean("false")` evaluates to `true` — any
non-empty string is truthy. Reading the Zod documentation wouldn't
necessarily surface this; setting the variable to the literal string
`"false"` and checking the actual parsed result does.

**Q: Why not just disable CSP everywhere once you found the Helmet
conflict?**
A: CSP is a real defense against XSS wherever HTML is rendered. This app
renders exactly one HTML page — Swagger UI — so disabling CSP globally
would remove a real protection to fix a problem that only exists on one
path. Scoping the fix to that path (and only when the feature is actually
enabled) keeps the rest of the app's security posture completely
unchanged.

## 11. Summary

Swagger/OpenAPI docs are generated from the same Zod schemas that already
enforce every request, kept off by default via a dedicated, explicitly-set
environment variable, and scoped carefully enough (a relaxed CSP on
exactly one path, security schemes cross-checked against real middleware
chains) that enabling this feature changes nothing about how the rest of
the API behaves or is protected. Two real bugs — a Zod boolean-coercion
footgun and a Helmet/Swagger-UI CSP conflict — were only found by testing
the actual running server, not by reading either library's documentation.

## 12. Revision Notes (5-minute read)

- Request docs = Zod schemas + `.meta()`. Never hand-duplicated.
- Response docs = hand-written (no output validation exists) — a named,
  honest gap.
- `ENABLE_SWAGGER` defaults to `false` everywhere; only the literal string
  `"true"` enables it.
- CSP is relaxed only under `/api-docs`, only when enabled.
- `security` per path is cross-checked against the real route file, not
  authored from memory.
- Disabled state is a genuine 404 — indistinguishable from any other
  unmapped route.

## 13. One-Line Interview Answers

- **Why generate from Zod?** One source of truth instead of two that can
  drift.
- **Biggest gap in this approach?** Response shapes aren't Zod-validated,
  so they're hand-written and can silently drift from the real models.
- **The Zod bug?** `z.coerce.boolean()` treats the string `"false"` as
  `true`, because JS's `Boolean("false")` is `true`.
- **The Helmet bug?** Default CSP blocks Swagger UI's inline
  scripts/styles; fixed by relaxing CSP only on `/api-docs`.
- **Why not tie the toggle to `NODE_ENV`?** A dedicated variable is
  explicit and doesn't silently change behavior if environments are
  renamed or added.

## 14. Practical Examples From Our Codebase

Annotating an existing validation schema for docs, without touching its
validation behavior (`src/modules/auth/auth.validation.js`):

```js
export const loginSchema = z
  .object({
    email: z.string().email().meta({ example: 'jane@example.com' }),
    password: z.string().min(1, 'Password is required').meta({ example: 'supersecret123' }),
  })
  .meta({ id: 'LoginRequest' });
```

The corrected `ENABLE_SWAGGER` schema (`src/config/env.js`), after the
live bug was found:

```js
ENABLE_SWAGGER: z
  .string()
  .optional()
  .default('false')
  .transform((val) => val.toLowerCase() === 'true'),
```

The CSP-relaxing wrapper, scoped to exactly one path and only when the
feature is enabled (`src/app.js`):

```js
app.use((req, res, next) => {
  if (env.ENABLE_SWAGGER && req.path.startsWith('/api-docs')) {
    return helmet({ contentSecurityPolicy: false })(req, res, next);
  }
  return helmet()(req, res, next);
});
```

Real output, captured from the running server, showing the CSP header is
present everywhere except `/api-docs`:

```
GET /api/v1/health  → Content-Security-Policy: default-src 'self'; ...
GET /api-docs       → (no Content-Security-Policy header at all)
```
