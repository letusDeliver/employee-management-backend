# Feature 13 — Swagger / OpenAPI Docs — Action Plan

## Confirmed Decisions

- Generate request schemas from the **existing Zod validation schemas** via
  `@asteasolutions/zod-to-openapi` — the validation schema stays the single
  source of truth; the OpenAPI schema is a derivation of it, not a
  hand-written duplicate.
- Interactive UI via `swagger-ui-express`.
- JWT Bearer auth in the UI via Swagger's **Authorize** button.
- `handbook/API_ENDPOINTS.md` remains the deep prose reference (20 sections,
  security testing, edge cases, interview notes). Swagger is the
  interactive/machine-readable reference. Neither replaces the other.
- Swagger's exposure is controlled by an env var (`ENABLE_SWAGGER`), not
  hardcoded to `NODE_ENV`.

## Verified Compatibility (checked against the live npm registry, not assumed)

```
@asteasolutions/zod-to-openapi@8.5.0  peerDependencies: { zod: "^4.0.0" }
swagger-ui-express@5.0.1              peerDependencies: { express: ">=4.0.0 || >=5.0.0-beta" }
```

This project runs `zod@4.4.3` and `express@5.2.1` — both satisfied. Version
8 of `zod-to-openapi` is the Zod-v4-native release: it reads metadata via
Zod's own built-in `.meta({ id, description, example })` method rather than
the old `extendZodWithOpenApi()` monkey-patch v3 projects needed. This
matters directly: it means annotating a schema for docs is a **non-invasive
addition to the same schema object** (`createEmployeeSchema.meta({...})`),
not a second parallel definition.

The exact shape of `.meta()` metadata (which keys it accepts, how per-field
descriptions vs. per-schema `id` interact) will be confirmed with a small
scratch script before touching real validation files — same discipline
used for every new library in this project (Prisma adapter, Multer,
Cloudinary). Not assumed from documentation alone.

## Real Response Shapes (verified against current source, not invented)

This API has **no global response envelope** — confirmed already in
Feature 10's notes. Every endpoint's shape is whatever its controller
actually returns:

| Endpoint                                      | Real success shape                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `POST /auth/register`                         | `201 { message, user, accessToken }`                                       |
| `POST /auth/login`                            | `200 { message, user, accessToken }`                                       |
| `POST /auth/refresh`                          | `200 { accessToken }`                                                      |
| `POST /auth/logout`                           | `200 { message }`                                                          |
| `GET /auth/me`                                | `200 { user }`                                                             |
| `GET /users`                                  | `200 { users: [...] }`                                                     |
| `POST /employees`                             | `201 { employee }`                                                         |
| `GET /employees`                              | `200 { employees: [...], pagination: { page, limit, total, totalPages } }` |
| `GET /employees/:id`                          | `200 { employee }`                                                         |
| `PATCH /employees/:id`                        | `200 { employee }`                                                         |
| `DELETE /employees/:id`                       | `200 { message: 'Employee deleted successfully' }`                         |
| `POST /users/me/profile-picture`              | `200 { user }`                                                             |
| `DELETE /users/me/profile-picture`            | `200 { user }`                                                             |
| `POST /employees/:id/documents`               | `201 { document }`                                                         |
| `GET /employees/:id/documents`                | `200 { documents: [...] }`                                                 |
| `DELETE /employees/:id/documents/:documentId` | `200 { message: 'Document deleted successfully' }`                         |

(Every row above is read directly from the current controllers, not
guessed. Every example in the final Swagger doc will still be re-verified
against the real running server before this feature is marked complete,
per `CLAUDE.md` Rule 17 — this table just removes ambiguity going into
implementation.)

Every error, regardless of status code (400/401/403/404/409/500), has
**exactly one shape** (`src/middlewares/error.middleware.js`):

```json
{ "status": "error", "message": "string" }
```

with a `stack` field appended only when `NODE_ENV !== 'production'`. Even
Zod validation failures don't produce a field-level array — they're
flattened into one comma-joined string by `validate.middleware.js`
(`"field: message, field2: message2"`). The plan must not invent a
field-array error shape; the documented shape has to match this exactly.

## Folder Structure

```
src/docs/
├── openapi.registry.js     # the one shared `new OpenAPIRegistry()` instance
├── openapi.document.js     # generateDocument() -> the final OpenAPI JSON, built once at boot
├── swagger.routes.js        # mounts swagger-ui-express + a raw /api-docs.json, gated by env.ENABLE_SWAGGER
└── components/
    ├── security.js          # registers the `bearerAuth` securityScheme component
    ├── responses.js         # ErrorResponseSchema (component) + shared response-object builders
    └── schemas.js           # response-only schemas with no Zod validation counterpart:
                              #   UserPublicSchema, EmployeeSchema, EmployeeDocumentSchema,
                              #   PaginationMetaSchema — each registered with a stable `id`
                              #   so they render as reusable named models, not inline duplicates

src/modules/auth/auth.docs.js               # registerPath() calls for /auth/*
src/modules/users/user.docs.js              # registerPath() calls for /users/*
src/modules/employees/employee.docs.js      # registerPath() calls for /employees (CRUD + list)
src/modules/employees/employeeDocument.docs.js  # registerPath() calls for /employees/:id/documents/*
```

Rationale: cross-cutting OpenAPI machinery (registry, generator, security,
shared response schemas) lives centrally in `src/docs/`, matching where
`src/config/` and `src/middlewares/` already live. Per-module **path**
registration lives next to that module's own routes/validation — a new
module only ever adds one `<module>.docs.js` file that imports its own
existing validation schemas, matching the feature-first organization the
rest of `src/modules/` already follows. This scales the same way the
existing module structure scales: N modules → N docs files, not one
ever-growing central file.

`*.docs.js` files are imported once, for side effect only (they call
`registry.registerPath(...)` at import time), from `openapi.document.js` —
mirroring how `routes/index.js` imports every module's router.
**Explicit import order** (matters because `generateDocument()` reads
`registry.definitions`, which is only complete once every path has
registered): `openapi.document.js` imports, in order, `components/
security.js` → `components/responses.js` → `components/schemas.js` →
every `*.docs.js` file → only then calls `generateDocument()`. Adding a
15th module later means adding one more import to that same list, in the
same file — never a new place a future maintainer has to remember to
update.

## Zod Integration

Existing validation schemas gain `.meta({ id: '...' })` calls **on the same
object** — no duplication:

```js
// src/modules/auth/auth.validation.js
export const registerSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    name: z.string().min(1, 'Name is required'),
  })
  .meta({ id: 'RegisterRequest', description: 'New account registration payload' });
```

`updateEmployeeSchema` (`createEmployeeSchema.partial()`) gets its own
`.meta({ id: 'UpdateEmployeeRequest' })` so it renders as its own named
model rather than an anonymous inline duplicate of `CreateEmployeeRequest`.

**What Zod does NOT cover, and must be documented by hand** (an honest,
named gap, not silently papered over):

- Every **response** shape — this API has no Zod schema for its outputs,
  only for inputs. `UserPublicSchema`/`EmployeeSchema`/etc. in
  `components/schemas.js` are hand-written to mirror the real Prisma model
  fields (minus `password`) and will be checked field-by-field against a
  live response during verification. Two field types are pinned now,
  before implementation, since both are easy to get wrong by mirroring the
  Prisma schema instead of the actual JSON wire format: `EmployeeSchema
.salary` must be `z.string()`, not `z.number()` — Prisma's `Decimal`
  serializes to a JSON string, the same fact `normalizeForAudit()` (Feature 11) was built around; `UserPublicSchema` must include `roles:
z.array(z.string())` — `sanitizeUser()` always attaches this, it isn't a
  raw Prisma `User` column, so a schema built by listing Prisma fields
  alone would miss it.
- `GET /employees/:id`, `DELETE /employees/:id`, `GET/DELETE
/employees/:id/documents*` have no body/query schema at all (just a
  `:id` path param) — documented directly in the `registerPath` params,
  no Zod involved either way, nothing to derive.
- Multer file uploads (`POST /users/me/profile-picture`,
  `POST /employees/:id/documents`) aren't Zod-validated at all (Multer's
  own `fileFilter` + `limits` do that job) — documented as
  `multipart/form-data` with a binary `file` field, by hand, since there's
  no schema to generate from.

## Response Documentation

One reusable `ErrorResponseSchema` component, referenced from every
non-2xx response across every path — never redefined per-endpoint:

```js
export const ErrorResponseSchema = z
  .object({ status: z.literal('error'), message: z.string() })
  .meta({ id: 'ErrorResponse' });
```

A small helper (`components/responses.js`) builds the repeated
`{description, content: {...}}` response-object shape so every
`registerPath` call writes `errorResponse('Invalid request body')` instead
of re-typing the full `content.application/json.schema` boilerplate five
times per endpoint.

`PaginationMetaSchema` (`{page, limit, total, totalPages}`, all integers)
is its own named component, embedded inside the `GET /employees` 200
response schema (`{ employees: EmployeeSchema[], pagination:
PaginationMetaSchema }`) — reused nowhere else since no other endpoint
paginates, but still named for consistency and so this exact shape doesn't
silently drift into a different shape if pagination is added elsewhere
later.

## Authentication

- `components/security.js` registers one `bearerAuth` HTTP-bearer/JWT
  security scheme, once.
- Every route currently gated by `authMiddleware` gets
  `security: [{ bearerAuth: [] }]` on its `registerPath` call — this is a
  manual, explicit per-path list (not automatic), cross-checked directly
  against each `*.routes.js` file's real middleware chain during
  implementation so a route can never be documented as public when it
  isn't, or vice versa.
- `POST /auth/register`, `POST /auth/login` — explicitly no `security`
  (public).
- `POST /auth/refresh`, `POST /auth/logout` — authenticated via the
  refresh-token **cookie**, not a Bearer header; documented with a
  separate `cookieAuth` security scheme (`type: apiKey, in: cookie, name:
refreshToken`) rather than incorrectly reusing `bearerAuth` for a
  mechanism that isn't actually a bearer token in these two cases.
- The Swagger UI's **Authorize** button will be verified live: log in via
  `POST /auth/login` in the UI, copy the returned `accessToken`, paste into
  Authorize, then confirm a previously-401 endpoint (e.g. `GET /auth/me`)
  now succeeds from the UI itself.

## Swagger Organization

- Tags, one per module, matching the existing `src/modules/` boundaries:
  `Auth`, `Users`, `Employees`, `Employee Documents`, `System` (for
  `/health`, `/ready`).
- `servers: [{ url: '/api/v1' }]` in the generated document, with every
  `registerPath` path written **without** the `/api/v1` prefix (e.g.
  `/auth/login`, not `/api/v1/auth/login`) — the prefix lives in exactly
  one place (`servers`), matching how `app.js` itself mounts the router
  once at `/api/v1` rather than repeating the prefix in every route file.
  This also means if the API version ever changes, only `servers` changes.
- Naming: `operationId`s set explicitly per path (e.g. `registerUser`,
  `loginUser`, `listEmployees`) rather than left to auto-generation — matters
  for future client-SDK generation, where a stable, human-chosen
  `operationId` becomes the generated method name.

## Environment & Security

- `env.js` gains `ENABLE_SWAGGER: z.coerce.boolean().default(false)` —
  **off unless explicitly turned on**, in every environment including
  development. `.env.example` documents `ENABLE_SWAGGER=true` as the local
  dev recommendation, but the schema default stays `false` so a
  freshly-cloned or freshly-deployed instance never exposes docs by
  accident.
- `app.js` mounts `/api-docs` (UI) and `/api-docs.json` (raw spec, useful
  for future SDK generation) only `if (env.ENABLE_SWAGGER)` — checked once
  at boot, not per-request. When disabled, hitting either path falls
  through to the normal `notFoundMiddleware` — indistinguishable from any
  other unmapped route, not a distinct "docs disabled" message that would
  itself confirm the feature exists.
- Documented, explicitly-accepted residual risk: enabling this in
  production hands anyone with network access to `/api-docs` a complete,
  precise map of every endpoint, field, and permission requirement —
  strictly more than what's inferable from black-box probing alone. No
  data is exposed (it's a schema, not records), but it does lower
  reconnaissance cost for a targeted attack. Mitigation is "leave it off in
  production, turn on deliberately only if there's a real need (e.g. a
  partner integration)" — not solved further in this feature (no basic-auth
  gate in front of it); noted as a known, honest trade-off rather than
  quietly building nothing and implying it's handled.

## Developer Experience

Every `registerPath` call includes, at minimum:

- `summary` + `description` (one sentence: what it does, who can call it)
- `tags`
- `request.params`/`request.query`/`request.body` where applicable (Zod-derived)
- Every real response status the endpoint can actually produce (verified
  against the controller/service/middleware chain, not guessed) — e.g.
  `POST /employees` realistically documents `201, 400, 401, 403, 409`, not
  a generic `200/500` pair.
- At least one concrete example value per schema (real, plausible data —
  a UUID that looks like a UUID, not `"string"`).
- `security` presence/absence on every path is cross-checked against that
  route's real middleware chain in its `*.routes.js` file at the time each
  `.docs.js` file is written — not authored from memory or from this plan
  alone. A route documented as public when `authMiddleware` actually gates
  it (or the reverse) is worse than no documentation, since it actively
  misleads whoever tests against it.

## Documentation Synchronization

- Swagger descriptions that need more depth (security testing, edge cases,
  negative testing) will explicitly say "see `handbook/API_ENDPOINTS.md` §
  <endpoint>" rather than duplicating that content inline — one direction
  of reference, so the two documents can't silently contradict each other
  on the parts that overlap (status codes, request shape), while the
  60-section-per-endpoint depth stays in exactly one place.
- `handbook/API_ENDPOINTS.md`'s existing per-endpoint "cURL Examples"
  section is unaffected — Swagger's "Try it out" is additive, not a
  replacement for the handbook's own examples.

## Future Scalability

- New module → one new `<module>.docs.js` + `.meta()` calls on that
  module's existing validation schemas. No change to `src/docs/` itself.
- New API version (e.g. `/api/v2`) → a second `servers` entry or a second
  generated document; the per-module `.docs.js` files would need
  version-aware path registration at that point — not solved now (no v2
  exists), flagged as the first thing to redesign if versioning is ever
  actually added.
- `/api-docs.json` (the raw OpenAPI document, not just the rendered UI)
  being served as its own route means any standard OpenAPI-to-client-SDK
  generator can point at it directly, with no extra work in this feature.

## Verification Plan

1. `ENABLE_SWAGGER=false` (or unset) → `GET /api-docs` returns the app's
   normal `404`, identical in shape to any other unmapped route.
2. `ENABLE_SWAGGER=true` → `GET /api-docs` renders the Swagger UI;
   `GET /api-docs.json` returns a valid OpenAPI document (spot-checked
   against the actual `zod-to-openapi`-generated `paths`/`components`).
3. For at least one request-body endpoint (`POST /auth/register`), submit
   a body via "Try it out" that fails real Zod validation (e.g. an invalid
   email) and confirm the UI shows the exact same `400 { status: 'error',
message }` shape the real server produces via curl — proving the
   Zod-derived schema and the live validator agree.
4. For a **query**-validated endpoint (`GET /employees?limit=999`, over
   the `max(100)` cap from `listEmployeesQuerySchema`), confirm the same
   `400` shape appears from the UI. This exercises a different code path
   than step 3 — `validateMiddleware`'s `target === 'query'` branch writes
   to `req.validatedQuery` rather than `req.body` (the Express-5
   `req.query`-is-read-only fix from Feature 10) — so passing step 3 alone
   doesn't prove this branch is also documented correctly.
5. Log in via the UI, use **Authorize** with the returned `accessToken`,
   and confirm a previously-`401` endpoint (`GET /auth/me`) now succeeds
   from the UI.
6. Confirm a public endpoint (`POST /auth/login`) still works from the UI
   with **no** Authorize token set.
7. Confirm at least one permission-gated endpoint correctly shows `403`
   from the UI when called with a token lacking that permission.
8. Restart the server with `ENABLE_SWAGGER` unset entirely (not just
   `false`) to confirm the Zod default actually applies rather than the
   app crashing on a missing var.
