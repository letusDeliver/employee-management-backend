# API Endpoints Handbook

A living, implementation-accurate reference for every endpoint in this
API. Updated after every feature that adds or modifies an endpoint (see
`CLAUDE.md`'s standing rule). Every example in this document was captured
from the actual running server — not hand-written from memory — so it can
be used to test the API in Postman without reading any source code.

**Last synchronized with**: the permission-resolution enhancement built
ahead of the Angular frontend (see `docs/frontend-architecture-blueprint.md`
§7.1/§19). No endpoints were added — `POST /auth/register`,
`POST /auth/login`, and `GET /auth/me` now additionally return a resolved
`user.permissions: string[]` array (the caller's role(s) resolved to
permission keys via the same `permissionCache` lookup
`requirePermission` uses server-side), so the frontend never needs its
own copy of `prisma/seed.js`'s `ROLE_PERMISSIONS` map. Deliberately
**not** added to `GET /users` or the profile-picture endpoints — see
those sections' own response docs, unchanged.

Before that: Feature 13 (Swagger/OpenAPI docs) added no endpoint changes
— it added an interactive, machine-readable reference (`/api-docs`)
alongside this document, not a replacement for it. Still covers all 18
endpoints introduced through Feature 12 (File uploads — profile pictures
+ employee documents): the 13 from Feature 9/10/11 plus 5 from Feature
12 — `POST`/`DELETE /users/me/profile-picture` and
`POST`/`GET`/`DELETE /employees/:id/documents`. `GET /auth/me` and
`GET /users` also include `profileImageUrl`/`profileImagePublicId` in
the `user` shape.

### Interactive Reference (Swagger UI)

As of Feature 13, every endpoint in this document also has a machine-
readable OpenAPI description, browsable and directly testable (including
JWT Bearer auth via the **Authorize** button) at `GET /api-docs` — the raw
OpenAPI 3.0 document is at `GET /api-docs.json`. Both are off by default
in every environment (`ENABLE_SWAGGER=false` unless explicitly set to
`true`) and, when off, are indistinguishable from any other unmapped route
(a normal `404`, not a distinct "disabled" response). Swagger is a quick
interactive companion to this document, not a replacement for it — request/
response shapes are generated from the same Zod validation schemas and
real Prisma models this document describes, but the deep security/negative-
testing/edge-case material below only lives here.

---

## Global Reference (read this first)

### Base URL & Versioning

```
http://localhost:3000/api/v1
```

Every route in this document is relative to that base. The `/api/v1`
prefix exists so a future breaking change can be introduced as `/api/v2`
without breaking existing clients.

### Standard Response Envelope

**Success responses** have no fixed universal envelope — each endpoint
returns whatever shape is documented for it (e.g. `{ user, accessToken }`
for login, `{ users }` for the list endpoint). There is no blanket
`{ success: true, data: {...} }` wrapper in this API — check each
endpoint's own "Successful Response" section.

**Error responses** always have this exact shape, produced by the single
centralized error handler (`src/middlewares/error.middleware.js`):

```json
{
  "status": "error",
  "message": "Human-readable message",
  "stack": "Only present when NODE_ENV !== 'production'"
}
```

- `stack` is **only** present outside production — never rely on it being
  there, and never expect it in a production deployment.
- `message` is either a specific, safe message (for operational errors —
  bad input, not found, unauthorized, etc.) or the generic string
  `"Internal Server Error"` (for genuinely unexpected bugs — the message
  never leaks internals in that case).

### Common Headers

| Header                                | Required When                                     | Notes                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Content-Type: application/json`      | Any request with a JSON body (register, login)    | Omitting it, or sending a non-JSON content type with a body, will generally still be parsed if the body is valid JSON text, but always send it explicitly.   |
| `Authorization: Bearer <accessToken>` | Any endpoint marked "Access token required" below | The token from `register`/`login`/`refresh`'s response body — **never** the refresh token.                                                                   |
| `Cookie: refreshToken=...`            | `POST /auth/refresh`, `POST /auth/logout`         | Set automatically by `register`/`login`/`refresh`'s `Set-Cookie` header — a browser or Postman's cookie jar handles this for you; you don't set it manually. |

### Authentication Model Summary

- **Access token**: a JWT, returned in the JSON response body on
  register/login/refresh. Short-lived (`15m` by default). Sent via the
  `Authorization: Bearer <token>` header. Verified statelessly (signature
  - expiry only — no database call). **As of Feature 9**, its payload is
    `{ sub: userId, roles: [roleName, ...] }` — an array of role names, not
    the single `role` string used before Feature 9. A permission-requiring
    route then resolves `roles` to a set of permission keys (via
    `src/utils/permissionCache.js`, backed by the `Role`/`Permission`/
    `RolePermission` tables) on every request — this resolution step, not
    the JWT itself, is what actually decides access. This means a role's
    _permissions_ can be changed at any time and take effect on the very
    next request (no re-login needed), but a _user's_ role assignment is
    still only reflected the next time they log in — same
    stale-until-relogin behavior documented in Feature 8, just one layer
    removed from where the caching now happens.
- **Refresh token**: a JWT, delivered **only** as an httpOnly cookie
  (`refreshToken`), never in a JSON body. Long-lived (`7d` by default).
  Tracked (hashed) in the database — revocable, and rotated on every use.
- **Postman note on the httpOnly cookie**: `httpOnly` only blocks
  _JavaScript_ (`document.cookie`) from reading the cookie — it does
  **not** stop Postman (a normal HTTP client) from storing and resending
  it automatically. Just make sure Postman's cookie jar is enabled for
  `localhost` (it is, by default, for requests made through the Postman
  app itself).

### Postman Environment Variables (recommended setup)

| Variable      | Example Value                  | Set By                                                              |
| ------------- | ------------------------------ | ------------------------------------------------------------------- |
| `baseUrl`     | `http://localhost:3000/api/v1` | You, once, manually                                                 |
| `accessToken` | _(empty initially)_            | A test script on Login/Register — see each endpoint's Postman notes |

The refresh token needs **no** environment variable — it lives entirely
in Postman's cookie jar once register/login/refresh sets it.

### Recommended Execution Order (a full Postman run-through)

1. `GET /health`
2. `GET /ready`
3. `POST /auth/register`
4. `POST /auth/login`
5. `GET /auth/me`
6. `GET /users` (expect `403` — the registered user defaults to `EMPLOYEE`)
7. `POST /employees` as an `ADMIN`/`MANAGER` token (create a record, note
   the returned `id`)
8. `GET /employees` as `ADMIN`/`MANAGER` (expect `200`, array)
9. `GET /employees/:id` as the `EMPLOYEE` the record's `userId` points to
   (expect `200`), then as a different `EMPLOYEE` (expect `403`)
10. `PATCH /employees/:id`, `DELETE /employees/:id`
11. `POST /auth/refresh`
12. `POST /auth/logout`
13. `POST /auth/refresh` again (expect `401` — the token was just revoked)

### Known, Honestly-Documented Gaps (apply across multiple endpoints)

- **No rate limiting exists yet** on any endpoint, including `/auth/login`
  and `/auth/refresh` — a real brute-force-protection gap, acknowledged
  since Feature 6, not yet closed.
- **`POST /auth/register`'s transactionality was narrowed, not fully
  closed, in Feature 9** — user creation and default-role assignment now
  happen in one `prisma.$transaction` (so a user can never exist with zero
  roles), but issuing the refresh/access token pair still happens as a
  separate step afterward. A crash between the transaction commit and
  token issuance now just means "the account exists correctly, log in
  again" — no longer the "account exists but is structurally broken" gap
  documented since Feature 7.
- **`GET /users` has no pagination** — fine at current scale, a natural
  future improvement once the user count grows.
- **No self-service way to change a user's role** — by design (see
  `GET /users`'s Security Testing section). Role assignment is a
  direct-database operation for testing purposes, same as every prior
  feature.
- **Pre-existing accounts created before Feature 9's migration lost their
  role entirely** — the `User.role` enum column was dropped without a
  data-migration step (a deliberate "clean cut-over" decision for this dev
  database, backed by a pre-migration `pg_dump`). Any account that existed
  before this migration now has an empty `roles: []` array until a `Role`
  is manually assigned to it via a direct database script — accounts
  registered after the migration are unaffected, since `register()` always
  assigns the default `EMPLOYEE` role.
- **`GET /users` still has no pagination** — the identical gap `GET
/employees` had before Feature 10 closed it there; out of scope for
  Feature 10, a candidate for its own future pass if the user count ever
  grows large enough to matter.
- **No way to view the `AuditLog` table via the API** — Feature 11 added
  the write path only (every `Employee` create/update/soft-delete is
  now logged, inside the same transaction as the mutation), by confirmed
  decision. A `GET /audit-logs` read endpoint (with its own permission
  and pagination questions) is a deliberately separate, deferred future
  feature — query the table directly for now.
- **Audited entities as of Feature 12**: `Employee` (Feature 11),
  `User` (profile-picture uploads/deletes only — not registration, login,
  or role assignment), and `EmployeeDocument`. Role assignment still has
  no API endpoint at all (a direct-database script), so there's no
  request-lifecycle hook to attach an audit write to without inventing
  new scope.
- **No self-service editing of one's own Employee record** — the
  `EMPLOYEE` role is only ever granted `employee:read:own`, never an
  `:update:own` permission. Changing department/salary/job title is an
  `ADMIN`/`MANAGER` action, by design. (Profile pictures are the one
  exception — self-service by design, since an avatar isn't HR data.)
- **Soft-deleted `Employee` rows are invisible everywhere, including to
  the person who deleted them** — there is no "restore" endpoint. A
  soft-deleted record can currently only be un-deleted via a direct
  database update (`deletedAt: null`).
- **No MIME-type sniffing from file content** (Feature 12) — only the
  client-supplied `Content-Type` (Multer's `file.mimetype`) is checked
  against a whitelist; the actual file bytes are never inspected.
- **No cap on the number of documents per employee** — unbounded, for now.
- **No admin-on-behalf-of-others profile picture management** — profile
  pictures are self-service only; an `ADMIN` cannot set or remove another
  user's avatar.
- **No document-download-proxy endpoint** — clients use the returned
  Cloudinary URL directly, not a route on this API.
- **Orphaned Cloudinary assets can accumulate** — e.g. if a database
  transaction fails after a successful Cloudinary upload, or a best-effort
  post-commit Cloudinary delete fails. Harmless (nothing references the
  orphan) but not automatically reconciled; a periodic cleanup job is the
  natural future remedy if this ever becomes a real operational cost.
- **Concurrent profile-picture replacement/document deletion is
  last-write-wins, not verified under true concurrency** — worst case is
  one extra orphaned/stale Cloudinary asset, never data corruption. Same
  honest treatment as other concurrency caveats already accepted
  elsewhere in this project.
- **Swagger's response schemas are hand-written, not derived** (Feature 13) — Zod covers every _request_ shape shown in `/api-docs`, but this API
  has no output-validation library, so `/api-docs`'s response schemas
  (`User`, `Employee`, `EmployeeDocument`, pagination) are manually mirrored
  from the real Prisma models and checked against a live response once,
  not continuously guaranteed to match if those models change later — this
  document's own "Successful Response" sections remain the actual source
  of truth if the two ever disagree.
- **`/api-docs`'s Content-Security-Policy is fully disabled on that one
  path** (Feature 13) — required for Swagger UI's inline scripts/styles to
  render at all (a well-documented Helmet/swagger-ui-express conflict);
  every other route keeps its normal CSP untouched, and this only applies
  when `ENABLE_SWAGGER=true` in the first place.

---

## Endpoint Index

| #   | Feature   | Method   | Path                                   | Auth                      | Required Permission                            | Public/Protected   |
| --- | --------- | -------- | -------------------------------------- | ------------------------- | ---------------------------------------------- | ------------------ |
| 1   | Health    | `GET`    | `/health`                              | No                        | —                                              | Public             |
| 2   | Readiness | `GET`    | `/ready`                               | No                        | —                                              | Public             |
| 3   | Auth      | `POST`   | `/auth/register`                       | No                        | —                                              | Public             |
| 4   | Auth      | `POST`   | `/auth/login`                          | No                        | —                                              | Public             |
| 5   | Auth      | `POST`   | `/auth/refresh`                        | Refresh cookie            | —                                              | Protected (cookie) |
| 6   | Auth      | `POST`   | `/auth/logout`                         | Refresh cookie (optional) | —                                              | Protected (cookie) |
| 7   | Auth      | `GET`    | `/auth/me`                             | Access token              | Any authenticated                              | Protected          |
| 8   | Users     | `GET`    | `/users`                               | Access token              | `user:list`                                    | Protected          |
| 9   | Employees | `POST`   | `/employees`                           | Access token              | `employee:create`                              | Protected          |
| 10  | Employees | `GET`    | `/employees`                           | Access token              | `employee:read:any`                            | Protected          |
| 11  | Employees | `GET`    | `/employees/:id`                       | Access token              | `employee:read:any` OR `employee:read:own`     | Protected          |
| 12  | Employees | `PATCH`  | `/employees/:id`                       | Access token              | `employee:update:any`                          | Protected          |
| 13  | Employees | `DELETE` | `/employees/:id`                       | Access token              | `employee:delete:any`                          | Protected          |
| 14  | Users     | `POST`   | `/users/me/profile-picture`            | Access token              | Authenticated (self only, no permission check) | Protected          |
| 15  | Users     | `DELETE` | `/users/me/profile-picture`            | Access token              | Authenticated (self only, no permission check) | Protected          |
| 16  | Employees | `POST`   | `/employees/:id/documents`             | Access token              | `employee:update:any`                          | Protected          |
| 17  | Employees | `GET`    | `/employees/:id/documents`             | Access token              | `employee:read:any` OR `employee:read:own`     | Protected          |
| 18  | Employees | `DELETE` | `/employees/:id/documents/:documentId` | Access token              | `employee:update:any`                          | Protected          |

**As of Feature 9**, authorization is permission-based, not role-based —
`ADMIN`/`MANAGER`/`EMPLOYEE` are just role _names_ that happen to be
granted certain permissions (seeded in `prisma/seed.js`); routes check
permission keys (`requirePermission('user:list')`), not role names
directly (`requireRole('ADMIN')`, the retired Feature 8 mechanism).

---

---

# 1. `GET /health`

## 1. Endpoint Information

```
Feature:            Express App Bootstrap (infrastructure)
Endpoint:           Health Check (liveness)
Description:        Confirms the process is alive and responding
Method:             GET
URL:                /api/v1/health
API Version:        v1
Module:             routes/index.js (infrastructure, not a domain module)
Authentication:     No
Authorization:      Public
Public/Protected:   Public
```

## 2. Purpose

- **Why it exists**: proves the process itself is up, independent of any
  dependency (database, external service). This is a **liveness** check,
  not a readiness check — see `/ready` for the dependency-aware version.
- **Business problem solved**: container orchestrators (Docker healthcheck,
  Kubernetes liveness probes) and load balancers need a cheap, reliable
  way to ask "should this instance be restarted?"
- **When to use it**: automated health monitoring, uptime checks, or a
  quick manual "is the server even running" sanity check.
- **Expected callers**: infrastructure/orchestration tooling, not end
  users or a frontend application.

## 3. Request Headers

None required. No `Authorization`, no `Content-Type` (no body is sent).

## 4. Path Parameters

None.

## 5. Query Parameters

None.

## 6. Request Body

None. Any body sent is ignored.

## 7. Validation Rules

None — there is nothing to validate.

## 8. Successful Response

```
200 OK

{
  "status": "ok"
}
```

| Field    | Description                                                           |
| -------- | --------------------------------------------------------------------- |
| `status` | Always the literal string `"ok"` if this response is returned at all. |

## 9. Error Responses

This endpoint has no failure path of its own. If the process can respond
at all, it returns `200`. (A truly dead process simply won't respond —
that absence of response _is_ the failure signal for a liveness check,
not an HTTP error code.)

| Status | Reason                                                | When                                                                            |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| `404`  | Wrong path (e.g. missing `/api/v1` prefix, or a typo) | Falls through to `notFoundMiddleware` — see the Global Reference error envelope |

## 10. Postman Test Cases

| #   | Case                                     | Expected                                            |
| --- | ---------------------------------------- | --------------------------------------------------- |
| 1   | `GET /api/v1/health`                     | `200`, `{ "status": "ok" }`                         |
| 2   | `GET /health` (missing `/api/v1` prefix) | `404`                                               |
| 3   | `POST /api/v1/health` (wrong method)     | `404` (no route registered for `POST` on this path) |

## 11. Negative Testing

| Scenario                                    | Expected                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| Wrong HTTP method (`POST`, `PUT`, `DELETE`) | `404` — Express has no route registered for this path + method combination |
| Wrong URL / typo                            | `404`                                                                      |
| Malformed headers                           | No effect — this route reads no headers                                    |

## 12. Edge Cases

- **Concurrent requests**: fully stateless, safe to call at any concurrency.
- **Duplicate requests**: idempotent by nature — always the same response.

## 13. Security Testing

- No authentication/authorization to test — this route is intentionally
  public and dependency-free.
- No sensitive data is ever in the response.
- Rate limiting: not applied, and not needed here (a health check is
  expected to be polled frequently).

## 14. Database Impact

None. This endpoint never touches the database — that's the entire
difference between it and `/ready`.

## 15. Request Lifecycle

```
GET /api/v1/health
    ↓
helmet → cors → morgan → cookieParser → express.json()
    ↓
routes/index.js: GET /health handler (inline, no controller/service/repository)
    ↓
200 { status: 'ok' }
```

## 16. Performance Notes

- O(1), no I/O — the cheapest possible endpoint in the API by design.
- No caching needed or beneficial.

## 17. Interview Notes

**Q: What's the difference between a liveness check and a readiness
check?** A liveness check (`/health`) asks "is the process alive at all;"
a readiness check (`/ready`) additionally asks "can it currently serve
real requests, including reaching its dependencies." Conflating them
means a database hiccup could cause an orchestrator to needlessly restart
an otherwise-healthy process.

## 18. cURL Examples

```bash
curl -i http://localhost:3000/api/v1/health
```

## 19. Postman Collection Notes

No environment variables or pre-request scripts needed — this is always
the first, simplest request in any collection run.

## 20. Testing Checklist

- ✅ Success case (`200`)
- ✅ Wrong path → `404`
- ✅ Wrong method → `404`
- ✅ No sensitive data in response
- ✅ No database dependency confirmed (works even if DB is down — contrast with `/ready`)

---

---

# 2. `GET /ready`

## 1. Endpoint Information

```
Feature:            PostgreSQL + Prisma Setup (infrastructure)
Endpoint:           Readiness Check
Description:        Confirms the process is alive AND the database is reachable
Method:             GET
URL:                /api/v1/ready
API Version:        v1
Module:             routes/index.js (infrastructure)
Authentication:     No
Authorization:      Public
Public/Protected:   Public
```

## 2. Purpose

- **Why it exists**: proves the database dependency is actually reachable
  right now — the one thing `/health` deliberately does not check.
- **Business problem solved**: lets an orchestrator or load balancer
  decide whether to route real traffic to this instance.
- **When to use it**: readiness probes, deployment smoke tests, debugging
  "is the app up but the DB down" scenarios.
- **Expected callers**: infrastructure tooling.

## 3. Request Headers

None required.

## 4. Path Parameters

None.

## 5. Query Parameters

None.

## 6. Request Body

None.

## 7. Validation Rules

None.

## 8. Successful Response

```
200 OK

{
  "status": "ok",
  "database": "connected"
}
```

| Field      | Description                                             |
| ---------- | ------------------------------------------------------- |
| `status`   | Always `"ok"` on success.                               |
| `database` | Always `"connected"` on success — literal, not dynamic. |

## 9. Error Responses

| Status | Reason               | Response                                                                   | When                                                                                               |
| ------ | -------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `503`  | Database unreachable | `{ "status": "error", "message": "Database connection is not available" }` | The `SELECT 1` query throws for any reason (DB down, network partition, connection pool exhausted) |
| `404`  | Wrong path           | Standard 404 envelope                                                      | Typo'd path                                                                                        |

## 10. Postman Test Cases

| #   | Case                             | Expected                                             |
| --- | -------------------------------- | ---------------------------------------------------- |
| 1   | `GET /api/v1/ready` with DB up   | `200`, `{ "status": "ok", "database": "connected" }` |
| 2   | `GET /api/v1/ready` with DB down | `503`                                                |

## 11. Negative Testing

| Scenario                 | Expected                                                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database service stopped | `503` (verified conceptually in Feature 3; full live verification blocked by a local admin-privilege limitation on this project's dev machine — see `handbook/03-postgresql-prisma-setup.md`) |
| Wrong method             | `404`                                                                                                                                                                                         |

## 12. Edge Cases

- **Database slow but not down**: the request will simply take longer
  before returning `200` — there is currently no explicit timeout on the
  `SELECT 1` beyond whatever the database driver/connection defaults to.
- **Concurrent requests**: each is an independent, cheap query; safe at
  reasonable polling frequency.

## 13. Security Testing

- No auth to test.
- No sensitive data ever returned — the response never includes connection
  strings, credentials, or query details, even in the failure case.

## 14. Database Impact

- **Tables affected**: none directly — `SELECT 1` is a literal constant
  query, not a real table read.
- **Rows inserted/updated/deleted**: none.
- **Transactions**: none.

## 15. Request Lifecycle

```
GET /api/v1/ready
    ↓
helmet → cors → morgan → cookieParser → express.json()
    ↓
routes/index.js: GET /ready handler (asyncHandler-wrapped)
    ↓
prisma.$queryRaw`SELECT 1`
    ├─ succeeds → 200 { status: 'ok', database: 'connected' }
    └─ throws   → ServiceUnavailableError → errorMiddleware → 503
```

## 16. Performance Notes

- `SELECT 1` is about as cheap as a real round-trip to Postgres can be —
  no table scan, no lock contention.
- Uses the same shared Prisma client/connection pool as every other
  endpoint — no dedicated connection.

## 17. Interview Notes

**Q: Why `SELECT 1` instead of a real table query?** It proves the
connection is alive with the minimum possible cost — no dependency on any
specific table existing or having data, which matters since this endpoint
existed (Feature 3) before any domain table (`User`) did.

## 18. cURL Examples

```bash
curl -i http://localhost:3000/api/v1/ready
```

## 19. Postman Collection Notes

No setup needed. Good second request in any run, right after `/health`.

## 20. Testing Checklist

- ✅ Success case (`200`, DB connected)
- ✅ Failure case (`503`, DB down) — verified conceptually, live verification blocked by local admin-privilege limits
- ✅ No sensitive data in either response
- ✅ Distinct from `/health` (proves the liveness/readiness split actually holds)

---

---

# 3. `POST /auth/register`

## 1. Endpoint Information

```
Feature:            User Model & Auth / JWT Access + Refresh Tokens
Endpoint:           Register User
Description:        Creates a new user account and issues an authenticated session
Method:             POST
URL:                /api/v1/auth/register
API Version:        v1
Module:             modules/auth
Authentication:     No
Authorization:      Public
Public/Protected:   Public
```

## 2. Purpose

- **Why it exists**: the entry point for a new user to create an account.
- **Business problem solved**: self-service account creation with an
  immediately-usable session (no separate login step required).
- **When to use it**: once, per user, to create their account.
- **Expected callers**: any unauthenticated client (a frontend's sign-up
  form, or a QA/test script).

## 3. Request Headers

| Header                           | Required | Notes                                                             |
| -------------------------------- | -------- | ----------------------------------------------------------------- |
| `Content-Type: application/json` | **Yes**  | Sending malformed JSON returns `400 Invalid JSON in request body` |

## 4. Path Parameters

None.

## 5. Query Parameters

None.

## 6. Request Body

```json
{
  "email": "jane.doe@example.com",
  "password": "supersecret123",
  "name": "Jane Doe"
}
```

| Field      | Type   | Required | Notes                                                                                               |
| ---------- | ------ | -------- | --------------------------------------------------------------------------------------------------- |
| `email`    | string | Yes      | Must be a valid email address                                                                       |
| `password` | string | Yes      | Minimum 8 characters — no complexity (uppercase/symbol) requirement by design, see Validation Rules |
| `name`     | string | Yes      | Minimum 1 character (non-empty)                                                                     |

## 7. Validation Rules

Enforced by `src/modules/auth/auth.validation.js`'s `registerSchema` (Zod),
via the generic `validateMiddleware`, **before** the controller ever runs.

**`email`**

- Must be a syntactically valid email address (Zod's built-in `.email()`
  check).
- No custom message set — the exact error text is Zod's own default:
  `"Invalid email address"` (verified live against this project's
  installed Zod version — wording could change with a future Zod upgrade).

**`password`**

- Minimum 8 characters.
- **No uppercase/digit/symbol complexity rule** — a deliberate choice
  (see `handbook/06-user-model-auth.md`): current NIST 800-63B guidance
  favors length over forced composition rules.
- Custom message: `"Password must be at least 8 characters long"`.

**`name`**

- Must be a non-empty string.
- Custom message on the length check: `"Name is required"`. Note: if the
  field is _missing entirely_ (not just empty), Zod's type-check fires
  first with its own default message (see Error Responses below) —
  the custom "Name is required" message only fires for an empty string,
  not a missing field.

**Business-rule validation (in the service, not the schema)**:

- `email` must not already belong to an existing user — checked via a
  database lookup, which is why it cannot live in the Zod schema (schemas
  are synchronous, pure functions of input shape only).

## 8. Successful Response

```
201 Created

{
  "message": "User registered successfully",
  "user": {
    "id": "e1b07e0b-3c8d-4f7d-aa1f-fffec7648b21",
    "email": "stagea-test1@example.com",
    "name": "Stage A Test",
    "createdAt": "2026-07-05T04:35:57.265Z",
    "updatedAt": "2026-07-05T04:35:57.265Z",
    "roles": ["EMPLOYEE"],
    "permissions": ["employee:read:own"]
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."
}
```

**As of Feature 9**: `user.role` (a single string) is now `user.roles` (an
array of role names). Every new registration is assigned exactly one role
— `EMPLOYEE` — via a `UserRole` row created in the same database
transaction as the user itself (see Request Lifecycle below), so
`roles` is never empty for a freshly registered account.

**As of the permission-resolution enhancement (built ahead of the
Angular frontend, see `docs/frontend-architecture-blueprint.md` §7.1)**:
`user.permissions` is a new field — the caller's role(s) resolved into
concrete permission keys via the same `permissionCache` lookup
`requirePermission` uses server-side (`user.service.js`'s
`attachPermissions`), so the frontend never needs its own copy of
`prisma/seed.js`'s `ROLE_PERMISSIONS` map. **Only present on this
endpoint, `POST /auth/login`, and `GET /auth/me`** — deliberately not
added to `GET /users` or the profile-picture endpoints, which still
return the plain `roles`-only shape (see `AuthenticatedUserSchema` vs.
`UserPublicSchema` in `src/docs/components/schemas.js`).

Response headers also include:

```
Set-Cookie: refreshToken=eyJ...; Max-Age=604799; Path=/api/v1/auth;
  HttpOnly; SameSite=Lax
  (Secure flag present only when NODE_ENV=production)
```

| Field                                | Description                                                                                                                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message`                            | Fixed confirmation string.                                                                                                                                                                                                       |
| `user.id`                            | UUID, not sequential — see `handbook/06-user-model-auth.md` for why.                                                                                                                                                             |
| `user.email`                         | Echoes the registered email.                                                                                                                                                                                                     |
| `user.name`                          | Echoes the registered name.                                                                                                                                                                                                      |
| `user.roles`                         | Always `["EMPLOYEE"]` for a self-registered account — there is no way to register as `ADMIN`/`MANAGER` via this endpoint. An array (not a single string) since Feature 9, since a user can in principle hold more than one role. |
| `user.permissions`                   | Always `["employee:read:own"]` for a fresh registration — the `EMPLOYEE` role's grants resolved to permission keys, identical to what `requirePermission` checks server-side. Only present on register/login/`/auth/me`.        |
| `user.createdAt` / `updatedAt`       | ISO 8601 timestamps, identical on creation.                                                                                                                                                                                      |
| **`user.password` is never present** | Stripped by `sanitizeUser` before the response is built — verify this on every test.                                                                                                                                             |
| `accessToken`                        | A signed JWT, `15m` default lifetime. Use in `Authorization: Bearer <accessToken>` for subsequent requests.                                                                                                                      |
| `refreshToken` (cookie only)         | Never appears in the JSON body — only as the `Set-Cookie` header.                                                                                                                                                                |

## 9. Error Responses

| Status | Reason                   | Response (`message` field)                                                                       | When                                                |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `400`  | Invalid email format     | `"email: Invalid email address"`                                                                 | `email` fails Zod's format check                    |
| `400`  | Password too short       | `"password: Password must be at least 8 characters long"`                                        | `password` shorter than 8 chars                     |
| `400`  | Missing field            | `"name: Invalid input: expected string, received undefined"` (pattern repeats per missing field) | Any required field absent entirely                  |
| `400`  | Multiple invalid fields  | All issues joined with `, `, e.g. `"email: ..., password: ..., name: ..."`                       | More than one field fails validation simultaneously |
| `400`  | Malformed JSON body      | `"Invalid JSON in request body"`                                                                 | Request body isn't valid JSON at all                |
| `409`  | Email already registered | `"Email already registered"`                                                                     | The email already exists in the `User` table        |

**Not applicable to this endpoint**: `401` (no auth required to call it),
`403` (no authorization concept here), `404` (no path/resource lookup),
`422` (this API uses `400` for all validation failures, not `422` — worth
noting since some APIs draw that line differently; this one doesn't).
`500` is always possible for a genuinely unexpected server error but has
no _specific_ documented trigger for this endpoint beyond the general
"something broke unexpectedly" case.

## 10. Postman Test Cases

| #   | Case                 | Body                                                                        | Expected                                                         |
| --- | -------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | Valid registration   | `{"email":"new@example.com","password":"supersecret123","name":"New User"}` | `201`                                                            |
| 2   | Duplicate email      | Same email as test 1, run again                                             | `409`                                                            |
| 3   | Invalid email format | `{"email":"not-an-email","password":"supersecret123","name":"Test"}`        | `400`, `"email: Invalid email address"`                          |
| 4   | Weak/short password  | `{"email":"x@example.com","password":"short","name":"Test"}`                | `400`, `"password: Password must be at least 8 characters long"` |
| 5   | Missing email        | `{"password":"supersecret123","name":"Test"}`                               | `400`                                                            |
| 6   | Empty body           | `{}`                                                                        | `400`, all three fields listed as missing                        |
| 7   | Malformed JSON       | `{"email":"broken"` (unterminated)                                          | `400`, `"Invalid JSON in request body"`                          |

## 11. Negative Testing

| Payload/Scenario                                                   | Expected                                                                                                                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong data types: `{"email": 123, "password": true, "name": null}` | `400` — Zod's type-check fails for each field independently                                                                                                                                                                           |
| Empty strings: `{"email": "", "password": "", "name": ""}`         | `400` — email fails format check; password fails length; name fails min-length                                                                                                                                                        |
| Null values: `{"email": null, ...}`                                | `400` — treated as a type mismatch, same as `123` above                                                                                                                                                                               |
| Very long strings (e.g. a 10,000-character `name`)                 | Currently **accepted** — there is no maximum-length rule on `name` in this schema; a real gap worth knowing (not yet a documented limitation, surfaced by writing this doc)                                                           |
| SQL injection attempt: `"email": "' OR 1=1 --"`                    | `400` — fails the email format check before ever reaching a query; Prisma's parameterized queries would neutralize it regardless even if it passed                                                                                    |
| XSS attempt: `"name": "<script>alert(1)</script>"`                 | **Currently accepted and stored as-is** — this API returns raw JSON, never renders HTML server-side, so stored-XSS risk is a _frontend_ concern (a future frontend must escape this on render) rather than this endpoint's to prevent |
| Wrong `Content-Type` (e.g. `text/plain` with a JSON string body)   | Express's `express.json()` only parses bodies declared as JSON; a non-JSON content type typically results in an empty `req.body`, which then fails validation as "all fields missing" (`400`)                                         |
| Wrong HTTP method (`GET /auth/register`)                           | `404`                                                                                                                                                                                                                                 |
| Wrong URL (typo)                                                   | `404`                                                                                                                                                                                                                                 |

## 12. Edge Cases

| Scenario                                                                             | Expected Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate/concurrent registration attempts with the same email, fired simultaneously | Only one will succeed (`201`); the other should hit the database's unique constraint on `email` and receive `409` — **not independently verified under true concurrency in this project**, flagged honestly as an untested race window                                                                                                                                                                                                                                                      |
| Registering immediately after a crashed prior attempt for the same email             | If a prior request crashed _after_ the user+role transaction committed but _before_ token issuance, retrying registration with the same email correctly returns `409` (proves the user does exist, and — as of Feature 9 — correctly has a role); use `/auth/login` instead to obtain a session in that case. This is a narrower, less severe version of the Feature 7 gap: the account is never structurally broken (no user can exist without a role now), only momentarily session-less. |
| Very long `email`/`name` values                                                      | Currently accepted with no upper bound — see Negative Testing above                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Unicode/special characters in `name` (e.g. `"名前"`, emoji)                          | Accepted — no character-set restriction on `name`                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## 13. Security Testing

- **Authentication checks**: N/A — this endpoint is intentionally public.
- **Authorization checks**: N/A — no role concept applies to registering.
- **Rate limiting**: **not implemented** — this endpoint could be hit
  repeatedly to enumerate whether emails exist (via the `409` response) or
  to spam account creation. A known, acknowledged gap.
- **JWT validation**: N/A on the way in; the JWT issued on the way out
  should be verified to actually decode correctly and carry
  `{sub, roles}` (an array, since Feature 9 — previously a single `role`
  string) — inspect it at [jwt.io](https://jwt.io) or similar to confirm
  structure (do this only with test tokens, never a real production
  token).
- **Sensitive data exposure / password exposure**: verify manually that
  the response body's `user` object **never** contains a `password` field,
  on every single test run, not just once.
- **Role escalation**: verify a `role`/`roles` field sent in the request
  body is simply ignored — `registerSchema` doesn't define either field,
  so Zod strips/ignores any extra property sent (Zod's default is to strip
  unrecognized keys, not reject the request) — confirm a submitted
  `"roles": ["ADMIN"]` does **not** result in an admin account; every
  registration is hard-coded server-side to the `EMPLOYEE` role.
- **Mass assignment**: directly related to the above — confirm no
  unexpected field (e.g. `id`, `createdAt`) can be client-supplied and
  honored.
- **BOLA (Broken Object Level Authorization)**: not applicable — this
  endpoint creates a new resource, it doesn't look one up by ID.

## 14. Database Impact

- **Tables affected**: `User` (insert), `UserRole` (insert), `RefreshToken`
  (insert).
- **Rows inserted**: exactly 1 `User` row, exactly 1 `UserRole` row (the
  default `EMPLOYEE` grant), exactly 1 `RefreshToken` row, on success.
- **Rows updated/deleted**: none.
- **Transactions**: **as of Feature 9**, the `User` insert and the
  `UserRole` insert happen inside one `prisma.$transaction` — either both
  succeed or neither does, so a user can never exist without a role. The
  `RefreshToken` insert (token issuance) still happens as a separate step
  _after_ that transaction commits — a narrower, deliberately scoped fix
  to the Feature 7 gap, not a full "everything in one transaction"
  rewrite. See the Feature 9 planning doc for the reasoning.
- **Cascade/rollback behavior**: if the `User`/`UserRole` transaction
  fails partway, both inserts roll back together — no orphaned user, no
  orphaned role grant. If token issuance fails afterward, the user+role
  data persists correctly; the client just needs to call `/auth/login`
  instead.

## 15. Request Lifecycle

```
POST /api/v1/auth/register
    ↓
helmet → cors → morgan → cookieParser → express.json()
    ↓ (SyntaxError here → 400 Invalid JSON, see the JSON-error-translation middleware in app.js)
validateMiddleware(registerSchema)
    ↓ (Zod failure → 400, joined messages)
auth.controller.register (asyncHandler-wrapped)
    ↓
auth.service.register
    ├─ userRepository.findByEmail(email)   → exists? → 409 ConflictError
    ├─ bcrypt.hash(password, 10)
    ├─ prisma.$transaction:
    │    ├─ userRepository.create(..., tx)
    │    ├─ rbacRepository.findRoleByName('EMPLOYEE', tx)
    │    └─ rbacRepository.assignRoleToUser(userId, roleId, tx)
    └─ issueTokenPair(user)
         ├─ rbacRepository.getRoleNamesForUser(user.id)
         ├─ jwt.signAccessToken / signRefreshToken  ({ sub, roles })
         └─ refreshTokenRepository.create(...)
    ↓
controller sets refreshToken cookie, responds 201
```

**Middleware that runs for this endpoint**: `helmet`, `cors`, `morgan`
(→ `logger.http`), `cookieParser`, `express.json()`, the JSON-syntax-error
translator, `validateMiddleware(registerSchema)`. **No** `authMiddleware`
or `requirePermission` — this route is public.

## 16. Performance Notes

- `findByEmail` uses the `@unique` index Prisma creates on `User.email` —
  an indexed lookup, not a table scan.
- `bcrypt.hash` is deliberately slow (cost factor 10) — expect tens of
  milliseconds here specifically; this is the single most expensive step
  in the request, by design (see `handbook/06-user-model-auth.md`).
- Three sequential database writes now (was two before Feature 9): the
  `User`+`UserRole` transaction, then the `RefreshToken` insert. The
  transaction adds a small additional round-trip cost in exchange for the
  atomicity guarantee above.

## 17. Interview Notes

See `handbook/06-user-model-auth.md` and `handbook/07-jwt-access-refresh-tokens.md`
for the full depth. Highlights specific to this endpoint:

- **Q: Why does registration also issue tokens instead of requiring a
  separate login?** A smoother flow — immediately usable session, since
  registering and then requiring an extra round-trip to log in provides
  no additional security benefit (the password was already verified
  implicitly by the user just having chosen it).
- **Q: Why is there no `role` field accepted in this request?** Allowing
  a client to set their own role at registration would be a trivial
  privilege-escalation vulnerability — role assignment is an
  administrative action, not a self-service one, by design.

## 18. cURL Examples

```bash
# Success
curl -i -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"jane.doe@example.com","password":"supersecret123","name":"Jane Doe"}'

# Duplicate email
curl -i -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"jane.doe@example.com","password":"anotherpassword","name":"Jane Duplicate"}'

# Invalid email
curl -i -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email","password":"supersecret123","name":"Test"}'
```

## 19. Postman Collection Notes

- Save a Postman **Test** script on this request:
  ```js
  const body = pm.response.json();
  if (pm.response.code === 201) {
    pm.environment.set('accessToken', body.accessToken);
  }
  ```
- The refresh-token cookie is captured automatically by Postman's cookie
  jar — no script needed for it.
- Recommended to run before `Login` and `Get Me` in a collection run.

## 20. Testing Checklist

- ✅ Success case (`201`, no password in response)
- ✅ Missing fields (`400`)
- ✅ Invalid email (`400`)
- ✅ Weak password (`400`)
- ✅ Empty body (`400`)
- ✅ Malformed JSON (`400`, not `500`)
- ✅ Duplicate email (`409`)
- ✅ Role field ignored if sent
- ✅ Database verification: `User` row created, `RefreshToken` row created, stored password is a bcrypt hash (`$2b$10$...`), not plaintext
- ✅ Logs verified: no plaintext password ever appears in `logs/*.log`
- ✅ No sensitive data leaked in response

---

---

# 4. `POST /auth/login`

## 1. Endpoint Information

```
Feature:            User Model & Auth / JWT Access + Refresh Tokens
Endpoint:           Login
Description:        Authenticates an existing user and issues a new session
Method:             POST
URL:                /api/v1/auth/login
API Version:        v1
Module:             modules/auth
Authentication:     No
Authorization:      Public
Public/Protected:   Public
```

## 2. Purpose

- **Why it exists**: the standard re-entry point for an existing account.
- **Business problem solved**: verifies credentials and issues a fresh
  token pair — used every time a user starts a new session (new device,
  expired session, explicit logout+login).
- **Expected callers**: any client holding a registered account's
  credentials.

## 3. Request Headers

| Header                           | Required | Notes                                    |
| -------------------------------- | -------- | ---------------------------------------- |
| `Content-Type: application/json` | **Yes**  | Same malformed-JSON handling as register |

## 4. Path Parameters

None.

## 5. Query Parameters

None.

## 6. Request Body

```json
{
  "email": "jane.doe@example.com",
  "password": "supersecret123"
}
```

| Field      | Type   | Required | Notes                                                                           |
| ---------- | ------ | -------- | ------------------------------------------------------------------------------- |
| `email`    | string | Yes      | Must be a valid email format                                                    |
| `password` | string | Yes      | Non-empty — **no minimum-length policy re-enforced here**, only at registration |

## 7. Validation Rules

`loginSchema` (Zod), via `validateMiddleware`:

- `email`: must be a valid email address (same default message as
  register: `"Invalid email address"`).
- `password`: must be a non-empty string. Custom message on empty:
  `"Password is required"`. Missing entirely produces Zod's default
  type-mismatch message (see register's error table for the exact
  pattern).

**Business-rule validation (in the service)**: credential verification —
this cannot be a schema rule since it requires a database lookup and a
bcrypt comparison.

## 8. Successful Response

```
200 OK

{
  "message": "Login successful",
  "user": {
    "id": "283a2b17-b05d-49aa-8915-d58c5658f2bb",
    "email": "docs-example@example.com",
    "name": "Docs Example",
    "createdAt": "2026-07-05T04:41:20.891Z",
    "updatedAt": "2026-07-05T04:41:20.891Z",
    "roles": ["EMPLOYEE"],
    "permissions": ["employee:read:own"]
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."
}
```

Same `Set-Cookie` behavior as register. Field meanings are identical to
register's response — see that section. `user.roles` **and
`user.permissions`** reflect the account's **current** role
assignments/resolved grants at the moment of login (read fresh from
`UserRole`/`permissionCache`), not whatever they were at registration —
this is precisely what makes logging in again the fix for the "stale
role" scenario documented in `GET /users`'s Edge Cases/Security Testing
sections, and now also the fix for stale permissions (verified live: a
user promoted to `ADMIN` mid-session keeps the old token's stale
`permissions` until a fresh login, exactly mirroring the pre-existing
stale-`roles` behavior).

## 9. Error Responses

| Status | Reason                 | Response (`message`)                                                                           | When                                    |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------- |
| `400`  | Invalid email format   | `"email: Invalid email address"`                                                               | Malformed email                         |
| `400`  | Missing/empty password | `"password: Password is required"` (empty) or the Zod type-mismatch message (missing entirely) | See Validation Rules                    |
| `400`  | Malformed JSON         | `"Invalid JSON in request body"`                                                               | Same as register                        |
| `401`  | Wrong password         | `"Invalid credentials"`                                                                        | Email exists, password doesn't match    |
| `401`  | Email not found        | `"Invalid credentials"` — **identical to the wrong-password case, deliberately**               | Email doesn't exist in the `User` table |

**Critical security property to test**: the `401` for "email doesn't
exist" and "email exists, password is wrong" must be **byte-for-byte
identical** in status code and message — this is the enumeration-safety
property from `handbook/06-user-model-auth.md`. Verify this explicitly,
every time this endpoint changes.

## 10. Postman Test Cases

| #   | Case                 | Body                                          | Expected                                          |
| --- | -------------------- | --------------------------------------------- | ------------------------------------------------- |
| 1   | Valid login          | Correct email + password of a registered user | `200`                                             |
| 2   | Wrong password       | Correct email, wrong password                 | `401`, `"Invalid credentials"`                    |
| 3   | Nonexistent email    | An email never registered                     | `401`, **the exact same** `"Invalid credentials"` |
| 4   | Invalid email format | `{"email":"not-an-email","password":"x"}`     | `400`                                             |
| 5   | Missing password     | `{"email":"jane.doe@example.com"}`            | `400`                                             |
| 6   | Empty body           | `{}`                                          | `400`                                             |

## 11. Negative Testing

| Payload/Scenario                                           | Expected                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wrong data types: `{"email": 123, "password": true}`       | `400`                                                                                                                                                                                                                                                                                                                    |
| SQL injection: `{"email": "' OR 1=1 --", "password": "x"}` | `400` — fails email format validation before any query runs                                                                                                                                                                                                                                                              |
| Extremely long password (10,000+ characters)               | Currently accepted by the schema (`min(1)` only, no max) — passed through to `bcrypt.compare`; bcrypt itself has a well-known internal 72-byte input limit, meaning anything beyond ~72 bytes is silently ignored by bcrypt regardless — not a security hole (bcrypt handles this safely) but worth knowing when testing |
| Wrong `Content-Type`                                       | Body fails to parse as JSON → treated as empty → `400` (all fields missing)                                                                                                                                                                                                                                              |
| Wrong method (`GET /auth/login`)                           | `404`                                                                                                                                                                                                                                                                                                                    |

## 12. Edge Cases

| Scenario                                                                                               | Expected Behavior                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Logging in repeatedly with correct credentials (no logout in between)                                  | Each login issues a **new**, independent token pair and a new `RefreshToken` database row — old sessions from prior logins are **not** automatically revoked; multiple simultaneous valid sessions per user are allowed by this API's current design                                             |
| Logging in immediately after a password change (hypothetical — no password-change endpoint exists yet) | N/A — not yet a feature of this API                                                                                                                                                                                                                                                              |
| Timing consistency between "wrong password" and "email not found"                                      | Both paths run a real or dummy `bcrypt.compare` specifically so response _timing_ is comparable — see `handbook/06-user-model-auth.md`'s timing-attack section; not something a simple Postman test captures, but worth knowing to test with a timing tool if verifying this property rigorously |

## 13. Security Testing

- **Authentication checks**: N/A (this endpoint establishes it).
- **Authorization checks**: N/A.
- **Rate limiting**: **not implemented** — this is the single most
  important endpoint to eventually rate-limit, given credential-stuffing
  risk. A known, acknowledged gap.
- **JWT validation**: verify the issued `accessToken` actually decodes to
  `{ sub, roles, iat, exp }` and nothing more (no `email`/`name` in the
  payload — see `handbook/07-jwt-access-refresh-tokens.md` for why the
  payload is deliberately minimal; `roles` became an array in Feature 9,
  previously a single `role` string).
- **Sensitive data exposure**: confirm `password` never appears in the
  response, and confirm the submitted password never appears in
  `logs/*.log` (Morgan doesn't log bodies by default — verify this
  specifically holds for this endpoint).
- **User enumeration**: explicitly re-test #2 and #3 above side-by-side
  on every change to this endpoint — this is the property most likely to
  regress silently if the code is refactored carelessly.

## 14. Database Impact

- **Tables affected**: `User` (read), `UserRole`/`Role` (read, to build
  the token payload's `roles` array), `RefreshToken` (insert).
- **Rows inserted**: exactly 1 `RefreshToken` row on success; zero on
  failure.
- **Rows updated/deleted**: none.
- **Transactions**: none (only one write occurs here, so atomicity isn't
  at risk the way it is for register).

## 15. Request Lifecycle

```
POST /api/v1/auth/login
    ↓
(same global middleware chain as register)
    ↓
validateMiddleware(loginSchema)
    ↓
auth.controller.login
    ↓
auth.service.login
    ├─ userRepository.findByEmail(email)
    │    ├─ not found → dummy bcrypt.compare → 401 Invalid credentials
    │    └─ found → bcrypt.compare(password, user.password)
    │                 ├─ mismatch → 401 Invalid credentials
    │                 └─ match    → issueTokenPair(user)
    │                                 ├─ rbacRepository.getRoleNamesForUser(user.id)
    │                                 └─ jwt.signAccessToken/signRefreshToken ({ sub, roles })
    ↓
controller sets refreshToken cookie, responds 200
```

**No** `authMiddleware`/`requirePermission` — public route.

## 16. Performance Notes

- `findByEmail` is indexed (unique index on `email`).
- `bcrypt.compare` is the dominant cost per request, by design.
- One database write (`RefreshToken` insert) per successful login.

## 17. Interview Notes

See `handbook/06-user-model-auth.md`'s full Q&A. The single most
important question for this endpoint: _"Why must 'user not found' and
'wrong password' return the exact same response, in both content and
timing?"_ — answered in full there.

## 18. cURL Examples

```bash
# Success
curl -i -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jane.doe@example.com","password":"supersecret123"}'

# Wrong password
curl -i -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jane.doe@example.com","password":"wrongpassword"}'

# Nonexistent email
curl -i -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"nobody@example.com","password":"whatever123"}'
```

## 19. Postman Collection Notes

Same `accessToken`-capturing test script as register (see that section).
Run after Register (or independently, against a previously-registered
account) and before `Get Me`/`List Users`.

## 20. Testing Checklist

- ✅ Success case (`200`)
- ✅ Wrong password → `401`
- ✅ Nonexistent email → `401`, **identical** message/status to wrong password
- ✅ Missing/invalid fields → `400`
- ✅ Empty body → `400`
- ✅ Database verification: new `RefreshToken` row created
- ✅ Logs verified: no plaintext password logged
- ✅ No sensitive data leaked

---

---

# 5. `POST /auth/refresh`

## 1. Endpoint Information

```
Feature:            JWT Access + Refresh Tokens
Endpoint:           Refresh Access Token
Description:        Exchanges a valid refresh token for a new access token, rotating the refresh token
Method:             POST
URL:                /api/v1/auth/refresh
API Version:        v1
Module:             modules/auth
Authentication:     Refresh-token cookie (not a Bearer access token)
Authorization:      N/A (identity-only, no role check)
Public/Protected:   Protected (cookie-based)
```

## 2. Purpose

- **Why it exists**: lets a client obtain a new, short-lived access token
  without forcing the user to log in again every 15 minutes.
- **Business problem solved**: balances short access-token lifetimes
  (limiting exposure if one leaks) against usability (not re-prompting
  for a password constantly).
- **When to use it**: automatically, by a client, whenever an access token
  is expired or about to expire.
- **Expected callers**: the client application itself (typically
  triggered by a `401` from a protected endpoint, or proactively on a
  timer), never a human directly.

## 3. Request Headers

None required beyond what the browser/Postman sends automatically. **No**
`Authorization` header is used by this endpoint — it reads the
`refreshToken` cookie instead.

## 4. Path Parameters

None.

## 5. Query Parameters

None.

## 6. Request Body

None — the refresh token travels via cookie, not the body.

## 7. Validation Rules

No Zod schema on this route (there is no body to validate). The
"validation" that matters here is entirely on the cookie's value:

- Must be present at all.
- Must be a syntactically valid, signature-valid JWT (`jwt.verifyRefreshToken`).
- Must correspond to a `RefreshToken` database record that is not
  revoked and not expired.

## 8. Successful Response

```
200 OK

{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."
}
```

Response headers also include a **new** `Set-Cookie: refreshToken=...`
— a different value from the one that was sent in the request (rotation).

| Field         | Description                                                               |
| ------------- | ------------------------------------------------------------------------- |
| `accessToken` | A fresh, newly-signed access token — use this to replace the expired one. |

## 9. Error Responses

| Status | Reason                                                      | Response (`message`)                                                               | When                                                                                                                          |
| ------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `401`  | No refresh token cookie sent                                | `"Refresh token missing"`                                                          | The `refreshToken` cookie is absent entirely                                                                                  |
| `401`  | Invalid/expired/malformed refresh token                     | `"Invalid refresh token"`                                                          | JWT signature/expiry check fails                                                                                              |
| `401`  | Token not found / already revoked / expired in the database | `"Invalid refresh token"` — **same message as the JWT-invalid case, deliberately** | The JWT itself is valid but its database record says otherwise (already rotated out, already logged out, or past `expiresAt`) |

## 10. Postman Test Cases

| #   | Case                                                    | Setup                                                                    | Expected                                 |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| 1   | Valid refresh                                           | Cookie from a fresh login                                                | `200`, new `accessToken`, rotated cookie |
| 2   | No cookie at all                                        | Clear cookies / use a fresh Postman session                              | `401`, `"Refresh token missing"`         |
| 3   | Reuse an already-rotated (old) refresh token            | Call `/refresh` once, then replay the **original** cookie value manually | `401`, `"Invalid refresh token"`         |
| 4   | Refresh token from an account that has since logged out | Log out, then attempt `/refresh` with the (now-revoked) cookie           | `401`                                    |

## 11. Negative Testing

| Scenario                                                                                                                                                                                     | Expected                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Tampered JWT (any character in the cookie value changed)                                                                                                                                     | `401` — signature verification fails                                                                                                    |
| Expired JWT (wait out the `7d` window, or manually craft one with a past `exp` — requires access to the signing secret, so only testable with a test secret in a non-production environment) | `401`, `"Invalid refresh token"`                                                                                                        |
| Access token sent as the cookie value instead of a refresh token                                                                                                                             | `401` — signed with a different secret (`JWT_ACCESS_SECRET` vs. `JWT_REFRESH_SECRET`), so verification against the refresh secret fails |
| Wrong HTTP method (`GET /auth/refresh`)                                                                                                                                                      | `404`                                                                                                                                   |
| Missing `Cookie` header entirely (e.g. a raw `curl` call with no `-b`)                                                                                                                       | `401`, `"Refresh token missing"`                                                                                                        |

## 12. Edge Cases

| Scenario                                                                                                         | Expected Behavior                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calling `/refresh` twice in rapid succession with the same cookie (race condition)                               | The first call rotates the token (revokes the old DB record, issues a new one); the second call, if it arrives with the now-stale cookie value, should fail with `401` — **the exact behavior under true concurrent/simultaneous calls has not been independently verified in this project**, flagged honestly as an untested race window, same category as register's concurrent-duplicate-email gap |
| Refreshing a token belonging to a user that no longer exists (hypothetical — no delete-user endpoint exists yet) | The service explicitly checks for this (`userRepository.findById(payload.sub)` returning null) and throws `401 Invalid refresh token` rather than issuing tokens for a nonexistent user                                                                                                                                                                                                               |
| Refresh token whose `expiresAt` has passed but whose JWT `exp` claim technically hasn't (clock skew scenarios)   | The database check (`expiresAt: { gt: new Date() }`) and the JWT's own `exp` claim are derived from the exact same value at issuance time (see `handbook/07-jwt-access-refresh-tokens.md`), so this scenario shouldn't occur under normal operation — both should expire together                                                                                                                     |

## 13. Security Testing

- **Authentication checks**: this endpoint's entire security model is the
  refresh token itself — verify a request with no cookie, a garbage
  cookie, and a tampered cookie are all rejected.
- **Rate limiting**: not implemented — a known gap, same as login.
- **JWT validation**: confirm the endpoint distinguishes an access token
  from a refresh token correctly (test #3 in Negative Testing above).
- **Rotation verification (the most important security property here)**:
  explicitly test that the **old** refresh token stops working the moment
  a new one is issued — this is not optional to verify; it's the entire
  point of rotation.
- **Cookie flags**: inspect the `Set-Cookie` header directly (not just
  whether the request succeeds) — confirm `HttpOnly` and `SameSite=Lax`
  are present on every response that sets this cookie, and `Secure` is
  present specifically when testing against a `NODE_ENV=production`
  deployment.

## 14. Database Impact

- **Tables affected**: `RefreshToken` (read, then update, then insert).
- **Rows updated**: exactly 1 (`revoked: true` on the old record) on
  success.
- **Rows inserted**: exactly 1 (the new, rotated `RefreshToken` record)
  on success.
- **Rows deleted**: none — revoked tokens are kept, not deleted, which
  preserves an audit trail of token history.
- **Transactions**: none — the revoke-then-create sequence is not wrapped
  in a single atomic transaction; a crash between the two would leave the
  old token revoked with no new one issued, forcing the user to log in
  again (a safe failure mode, but not an atomic one — a known,
  undocumented-until-now minor gap in the same family as register's).

## 15. Request Lifecycle

```
POST /api/v1/auth/refresh
    ↓
(global middleware chain)
    ↓
auth.controller.refresh
    ├─ reads req.cookies.refreshToken
    │    └─ absent → 401 Refresh token missing
    ↓
auth.service.refresh(refreshToken)
    ├─ jwt.verifyRefreshToken → throws → 401 Invalid refresh token
    ├─ refreshTokenRepository.findValidByHash(sha256(token))
    │    └─ not found/revoked/expired → 401 Invalid refresh token
    ├─ refreshTokenRepository.revoke(oldRecord.id)      [rotation]
    ├─ userRepository.findById(payload.sub)
    │    └─ not found → 401 Invalid refresh token
    └─ issueTokenPair(user)   [new access + refresh token]
    ↓
controller sets the NEW refreshToken cookie, responds 200 { accessToken }
```

**No** `authMiddleware` (this route has its own, cookie-based auth check,
not the Bearer-token one) and **no** `requirePermission`.

## 16. Performance Notes

- `findValidByHash` is an indexed lookup (`tokenHash` is `@unique`).
- Two writes per successful call (revoke + create) — same non-atomic
  trade-off noted in Database Impact.
- SHA-256 hashing (used to look up the token) is fast — deliberately, per
  `handbook/07-jwt-access-refresh-tokens.md`'s reasoning on why refresh
  tokens use a fast hash while passwords use a slow one.

## 17. Interview Notes

See `handbook/07-jwt-access-refresh-tokens.md` in full. The single most
important question for this endpoint: _"What does refresh token rotation
actually prevent, concretely?"_ — a stolen-but-not-yet-used refresh token
becomes useless the instant its legitimate owner refreshes first.

## 18. cURL Examples

```bash
# Login first, capturing cookies
curl -s -c cookies.txt -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jane.doe@example.com","password":"supersecret123"}' > /dev/null

# Refresh using the captured cookie
curl -i -c cookies_new.txt -b cookies.txt -X POST http://localhost:3000/api/v1/auth/refresh

# Attempt to reuse the OLD cookie (should now fail)
curl -i -b cookies.txt -X POST http://localhost:3000/api/v1/auth/refresh
```

## 19. Postman Collection Notes

No environment variable needed for the refresh token itself — Postman's
cookie jar handles it entirely, including updating it to the rotated
value after this call. Run this **after** Login and **before** a second
`Get Me` call, to prove the new access token also works.

## 20. Testing Checklist

- ✅ Success case (`200`, new `accessToken`, rotated `Set-Cookie`)
- ✅ No cookie → `401`
- ✅ Reused (rotated-out) old token → `401`
- ✅ Tampered token → `401`
- ✅ Token from a logged-out session → `401`
- ✅ Cookie flags verified (`HttpOnly`, `SameSite=Lax`, `Secure` in prod)
- ✅ Database verification: old record `revoked: true`, new record created
- ✅ No secrets/tokens leaked in logs

---

---

# 6. `POST /auth/logout`

## 1. Endpoint Information

```
Feature:            JWT Access + Refresh Tokens
Endpoint:           Logout
Description:        Revokes the current refresh token server-side and clears the cookie
Method:             POST
URL:                /api/v1/auth/logout
API Version:        v1
Module:             modules/auth
Authentication:     Refresh-token cookie (optional — see below)
Authorization:      N/A
Public/Protected:   Protected (cookie-based), but idempotent/lenient
```

## 2. Purpose

- **Why it exists**: gives a user a real way to end their session
  server-side — something a purely stateless refresh-token design
  couldn't offer (see `handbook/07-jwt-access-refresh-tokens.md`'s
  rationale for database-backed refresh tokens).
- **Business problem solved**: session termination, e.g. "log out of this
  device," or a security response to a suspected compromise.
- **Expected callers**: the client application, typically triggered by a
  user clicking "Log out."

## 3. Request Headers

None required.

## 4. Path Parameters

None.

## 5. Query Parameters

None.

## 6. Request Body

None.

## 7. Validation Rules

None on the body (there is none). The only "input" is the `refreshToken`
cookie, which is treated leniently — see below.

## 8. Successful Response

```
200 OK

{
  "message": "Logged out successfully"
}
```

Response headers include a cookie-clearing `Set-Cookie`:

```
Set-Cookie: refreshToken=; Path=/api/v1/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT
```

## 9. Error Responses

**This endpoint has no error path** — it deliberately always returns
`200`, even if:

- No `refreshToken` cookie was sent at all.
- The cookie's token is invalid, expired, or already revoked.

This is intentional: logout is idempotent by design. "You're not logged
in" and "you were logged in, now you're not" both end in the same
state — logged out — so there's no reason to distinguish them with a
different status code. Verified live: `POST /auth/logout` with **no**
cookie at all returns `200 { "message": "Logged out successfully" }`,
exactly the same as when a valid cookie is present.

| Status | Reason     | When        |
| ------ | ---------- | ----------- |
| `404`  | Wrong path | Typo in URL |

## 10. Postman Test Cases

| #   | Case                                                     | Expected                                                           |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | Logout with a valid session cookie                       | `200`, cookie cleared, subsequent `/refresh` with that token fails |
| 2   | Logout with no cookie at all                             | `200` (same message)                                               |
| 3   | Logout twice in a row with the same (now-revoked) cookie | `200` both times                                                   |

## 11. Negative Testing

| Scenario                               | Expected                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Garbage/tampered cookie value          | Still `200` — the service looks up the hash, finds nothing valid, and simply does nothing further; no error is surfaced |
| Wrong HTTP method (`GET /auth/logout`) | `404`                                                                                                                   |

## 12. Edge Cases

| Scenario                                                                     | Expected Behavior                                                                                                 |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Already logged out, logging out again                                        | `200`, no error — confirmed idempotent                                                                            |
| Logging out a token that was already rotated away by a prior `/refresh` call | `200` — the old (pre-rotation) token simply isn't found as a valid record; nothing to revoke, no error either way |

## 13. Security Testing

- **Authentication checks**: deliberately lenient — this is a rare case
  where "fail open" (always succeed) is the _correct_ security posture,
  since the only consequence of a no-op logout is... nothing changes,
  which is safe.
- **Sensitive data exposure**: confirm the response never echoes back any
  part of the token or user identity.
- **Rate limiting**: not implemented, and arguably low-priority for this
  specific endpoint given it has no meaningful attack surface (there's no
  credential-guessing angle to a logout call).

## 14. Database Impact

- **Tables affected**: `RefreshToken` (conditionally updated).
- **Rows updated**: at most 1 (`revoked: true`), only if a valid,
  not-already-revoked record matching the cookie's hash exists. Zero rows
  affected if the cookie is missing, garbage, or already revoked.
- **Rows deleted**: none.
- **Transactions**: N/A — a single conditional write.

## 15. Request Lifecycle

```
POST /api/v1/auth/logout
    ↓
(global middleware chain)
    ↓
auth.controller.logout
    ├─ reads req.cookies.refreshToken
    ├─ if present: auth.service.logout(token)
    │      └─ refreshTokenRepository.findValidByHash(...) → revoke if found (silently no-ops otherwise)
    ├─ res.clearCookie(...)
    └─ 200 { message: 'Logged out successfully' }   (always, regardless of the above)
```

## 16. Performance Notes

- At most one indexed lookup + one conditional write — cheap.

## 17. Interview Notes

**Q: Why does this endpoint always return `200`, even when there's
nothing to actually revoke?** Logout's meaningful outcome is a state
(the client no longer has a valid session), not an action that can
meaningfully "fail" from the caller's perspective — returning an error for
"you weren't logged in anyway" would be surprising API design with no
real benefit.

## 18. cURL Examples

```bash
# With a valid cookie
curl -i -b cookies.txt -X POST http://localhost:3000/api/v1/auth/logout

# With no cookie at all
curl -i -X POST http://localhost:3000/api/v1/auth/logout
```

## 19. Postman Collection Notes

No setup needed. Run after `/refresh` in a full collection walkthrough,
then verify a subsequent `/refresh` attempt with the same (now cleared)
cookie jar fails with `401`.

## 20. Testing Checklist

- ✅ Success with valid cookie (`200`)
- ✅ Success with no cookie (`200`, same message — idempotent)
- ✅ Cookie actually cleared (inspect `Set-Cookie`'s `Expires` in the past)
- ✅ Subsequent `/refresh` with the logged-out token fails (`401`)
- ✅ Database verification: `RefreshToken.revoked` is `true` for that record
- ✅ No sensitive data leaked

---

---

# 7. `GET /auth/me`

## 1. Endpoint Information

```
Feature:            JWT Access + Refresh Tokens
Endpoint:           Get Current User
Description:        Returns the profile of the currently authenticated user
Method:             GET
URL:                /api/v1/auth/me
API Version:        v1
Module:             modules/auth
Authentication:     Yes (Bearer access token)
Authorization:      Any authenticated user (no specific role required)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: the canonical "who am I" endpoint — lets a client
  confirm its access token is valid and fetch the associated profile
  without needing to store user details separately.
- **Business problem solved**: a frontend can call this once after
  login/on app load to populate the current user's info, rather than
  trusting only what was returned at login time (which could go stale).
- **Expected callers**: any authenticated client.

## 3. Request Headers

| Header                                | Required | Notes                                                               |
| ------------------------------------- | -------- | ------------------------------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must be a valid, unexpired access token from register/login/refresh |

## 4. Path Parameters

None.

## 5. Query Parameters

None.

## 6. Request Body

None (this is a `GET` request).

## 7. Validation Rules

No body to validate. The "validation" here is entirely the access
token's signature and expiry, performed by `authMiddleware`.

## 8. Successful Response

```
200 OK

{
  "user": {
    "id": "283a2b17-b05d-49aa-8915-d58c5658f2bb",
    "email": "docs-example@example.com",
    "name": "Docs Example",
    "profileImageUrl": null,
    "profileImagePublicId": null,
    "createdAt": "2026-07-05T04:41:20.891Z",
    "updatedAt": "2026-07-05T12:32:25.983Z",
    "roles": ["EMPLOYEE"],
    "permissions": ["employee:read:own"]
  }
}
```

**As of Feature 12**: `user.profileImageUrl`/`user.profileImagePublicId`
are `null` until the user uploads a profile picture via `POST
/users/me/profile-picture` — see that endpoint's own documentation below.

Same field meanings as register/login's `user` object — see Endpoint 3.
`password` is never present. **`roles` and `permissions` here are always
fresh from the database** — `getCurrentUser` re-queries `UserRole` and
re-resolves permissions via `permissionCache` on every call rather than
trusting the access token's embedded `roles` claim (verified live:
calling `/me` with a token issued _before_ a role change still correctly
shows the _new_ role **and** the new role's full permission set — see
the edge case below for why this is a narrower guarantee than it
sounds). This makes `/auth/me` the one endpoint where a stale access
token's `permissions` can still be checked accurately without a fresh
login — every *other* permission-gated endpoint still enforces the
token's stale `roles` claim via `authMiddleware`/`requirePermission`
until the token is refreshed or reissued.

## 9. Error Responses

| Status | Reason                                                 | Response (`message`)         | When                                                                                                                                                               |
| ------ | ------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `401`  | No `Authorization` header, or missing `Bearer ` prefix | `"Authentication required"`  | Header absent or malformed                                                                                                                                         |
| `401`  | Invalid or expired access token                        | `"Invalid or expired token"` | Signature check fails (`JsonWebTokenError`) or the token's `exp` has passed (`TokenExpiredError`) — both produce this same generic message                         |
| `401`  | Token is valid but the user no longer exists           | `"User no longer exists"`    | `payload.sub` doesn't correspond to any current `User` row (hypothetical today — no delete-user feature exists yet, but the service defends against it regardless) |

## 10. Postman Test Cases

| #   | Case                                           | Expected                                                                                   |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Valid access token                             | `200`, correct user                                                                        |
| 2   | No `Authorization` header                      | `401`, `"Authentication required"`                                                         |
| 3   | Garbage/malformed token                        | `401`, `"Invalid or expired token"`                                                        |
| 4   | Expired token (wait out the `15m` window)      | `401`, `"Invalid or expired token"`                                                        |
| 5   | Refresh token used in place of an access token | `401` — signed with a different secret, fails verification against the access-token secret |

## 11. Negative Testing

| Scenario                                                         | Expected                                                                                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Authorization: Bearer ` (empty token after the prefix)          | `401` — `jwt.verify` rejects an empty string as malformed                                                                   |
| `Authorization: <token>` (missing the `Bearer ` prefix entirely) | `401`, `"Authentication required"` — the middleware specifically checks for the prefix before attempting to verify anything |
| Tampered token (one character changed anywhere in the JWT)       | `401` — signature mismatch                                                                                                  |
| Wrong HTTP method (`POST /auth/me`)                              | `404`                                                                                                                       |

## 12. Edge Cases

| Scenario                                                          | Expected Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token valid but the user's role has since changed in the database | Returns the **current** database role, not the token's stale claim — corrected in Feature 9 after being verified live (a prior version of this doc, written during Feature 8, incorrectly stated the opposite). `getCurrentUser` does its own `UserRole` lookup by `userId`; it never reads `req.user.roles` from the token at all. **This is specific to `/me`** — it does not mean role changes take effect immediately everywhere. `requirePermission` (used by `/users` and, from Stage B onward, the Employee routes) checks `req.user.roles`, which _is_ the token's embedded, stale-until-relogin claim — see Endpoint 8's edge case for that distinct, still-true behavior. |
| Calling this immediately after `/refresh` with the new token      | `200`, works exactly like any other valid access token — no special-casing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## 13. Security Testing

- **Authentication checks**: this endpoint's entire purpose is testing
  authentication in isolation (no role/authorization layer on top) —
  confirm all three failure modes above are distinct in message but both
  correctly `401`.
- **JWT validation**: confirm both `JsonWebTokenError` (bad signature) and
  `TokenExpiredError` (expired) scenarios are handled — the middleware
  catches both under one generic `catch` block, so both produce the same
  response; this is intentional (don't give an attacker more specific
  feedback about _why_ a token failed).
- **Sensitive data exposure**: confirm no `password` field, ever.
- **BOLA**: not applicable — this endpoint only ever returns the caller's
  _own_ record (`req.user.id` from the verified token), never an
  arbitrary user by ID; there's no ID parameter to manipulate.

## 14. Database Impact

- **Tables affected**: `User` (read only).
- **Rows affected**: none inserted/updated/deleted — a pure read.

## 15. Request Lifecycle

```
GET /api/v1/auth/me
Authorization: Bearer <accessToken>
    ↓
(global middleware chain)
    ↓
authMiddleware
    ├─ no/malformed header → 401 Authentication required
    ├─ jwt.verifyAccessToken throws → 401 Invalid or expired token
    └─ valid → req.user = { id, roles }   (roles unused by this route)
    ↓
auth.controller.me → auth.service.getCurrentUser(req.user.id)
    ├─ userRepository.findById → not found → 401 User no longer exists
    ├─ rbacRepository.getRoleNamesForUser(userId)   [fresh DB read]
    └─ sanitizeUser(user, roles)
    ↓
200 { user }
```

**No** `requirePermission` on this route — any authenticated user,
regardless of role, can call it.

## 16. Performance Notes

- `findById` uses the primary key — the fastest possible lookup.
- No caching — every call re-fetches from the database; for a
  high-frequency "who am I" check, this is a reasonable future caching
  candidate if it ever becomes a bottleneck (not currently one).

## 17. Interview Notes

**Q: Why does this endpoint re-fetch the user from the database instead
of just returning the token's payload directly?** The token's payload is
intentionally minimal (`sub`, `roles` only) — it doesn't carry `email` or
`name` at all, so there's nothing to "just return" from the token; a
database read is required to get the full profile. Since Feature 9,
`getCurrentUser` also re-resolves `roles` from `UserRole` rather than
reusing `req.user.roles`, so `/me` reflects the current `name`/`email`
**and** the current roles — the one place in this API where a role
change is visible without a fresh login (see the edge case above for why
that doesn't extend to authorization decisions elsewhere).

## 18. cURL Examples

```bash
curl -i http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# No token
curl -i http://localhost:3000/api/v1/auth/me

# Garbage token
curl -i http://localhost:3000/api/v1/auth/me -H "Authorization: Bearer garbage.token.here"
```

## 19. Postman Collection Notes

Uses the `{{accessToken}}` environment variable set by Register/Login's
test script:

```
Authorization: Bearer {{accessToken}}
```

Run after Login, before any role-gated endpoint, as the standard "confirm
I'm authenticated" check.

## 20. Testing Checklist

- ✅ Success case (`200`, correct user, no password)
- ✅ No token → `401`
- ✅ Garbage token → `401`
- ✅ Expired token → `401`
- ✅ Refresh token used by mistake → `401`
- ✅ No database writes occur
- ✅ No sensitive data leaked

---

---

# 8. `GET /users`

## 1. Endpoint Information

```
Feature:            RBAC Redesign (Feature 9)
Endpoint:           List All Users
Description:        Returns every registered user (requires the `user:list` permission)
Method:             GET
URL:                /api/v1/users
API Version:        v1
Module:             modules/users
Authentication:     Yes (Bearer access token)
Authorization:      `user:list` permission required (granted to ADMIN only, as seeded)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: gives an administrator visibility into all
  registered accounts — this project's first real, concrete use of a
  permission check and the first authorization-gated endpoint.
- **Business problem solved**: user management/oversight — "who is
  registered in this system."
- **Expected callers**: any user whose roles resolve to the `user:list`
  permission — only `ADMIN`, per the seeded `RolePermission` grants, not a
  hard-coded role-name check anymore.

## 3. Request Headers

| Header                                | Required | Notes                                                                   |
| ------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must belong to a user whose roles resolve to the `user:list` permission |

## 4. Path Parameters

None.

## 5. Query Parameters

**None currently implemented.** This is a real, current limitation — no
`page`/`limit`/`sort`/`order` support exists yet (see the Global
Reference's "Known Gaps" section and `handbook/08-rbac.md`). Every call
returns the entire `User` table.

## 6. Request Body

None.

## 7. Validation Rules

No body/query to validate. The only check is authorization —
`requirePermission('user:list')` resolves the caller's roles to a
permission set and confirms `user:list` is granted.

## 8. Successful Response

```
200 OK

{
  "users": [
    {
      "id": "52f83ced-efa7-4f6e-acb5-f82f19e0768e",
      "email": "jane.doe@example.com",
      "name": "Jane Doe",
      "profileImageUrl": null,
      "profileImagePublicId": null,
      "createdAt": "2026-07-04T13:56:29.996Z",
      "updatedAt": "2026-07-04T13:56:29.996Z",
      "roles": []
    },
    {
      "id": "ebea9f2d-f331-40b8-968a-386dd88d4576",
      "email": "jwt.test@example.com",
      "name": "JWT Test",
      "profileImageUrl": null,
      "profileImagePublicId": null,
      "createdAt": "2026-07-04T14:42:46.216Z",
      "updatedAt": "2026-07-04T14:42:46.216Z",
      "roles": []
    }
  ]
}
```

**As of Feature 12**: every user entry now includes
`profileImageUrl`/`profileImagePublicId`, `null` until that user uploads
a profile picture.

| Field   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users` | An array of every `User` row in the database, each sanitized (no `password`), each with a `roles` array. Order is whatever the database returns by default (no explicit `ORDER BY` — do not rely on a particular order). Note `jane.doe@example.com` above: an account created **before** the Feature 9 migration, now showing `roles: []` — its old `role` enum value was dropped, not migrated, per the "clean cut-over" decision (see the Global Reference's Known Gaps). |

## 9. Error Responses

| Status | Reason                                         | Response (`message`)                                                                      | When                                                                    |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `401`  | No/invalid/expired access token                | Same messages as `/auth/me` (`"Authentication required"` or `"Invalid or expired token"`) | `authMiddleware` runs first, identically to every other protected route |
| `403`  | Valid token, but roles don't grant `user:list` | `"You do not have permission to perform this action"`                                     | Any authenticated `EMPLOYEE` or `MANAGER`                               |

## 10. Postman Test Cases

| #   | Case                             | Expected                  |
| --- | -------------------------------- | ------------------------- |
| 1   | Valid `ADMIN` token              | `200`, array of all users |
| 2   | Valid `EMPLOYEE`/`MANAGER` token | `403`                     |
| 3   | No token                         | `401`                     |
| 4   | Garbage token                    | `401`                     |

## 11. Negative Testing

| Scenario                                                                          | Expected                                                                                                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A `roles` claim manually crafted into a forged JWT (signed with the wrong secret) | `401` — fails signature verification before authorization is even checked                                                                                           |
| Wrong HTTP method (`POST /users`)                                                 | `404` — no route registered for `POST` on this path                                                                                                                 |
| Attempting to pass `role=ADMIN` as a query string (`?role=ADMIN`)                 | No effect — this endpoint resolves permissions from `req.user.roles` on the verified token exclusively; query parameters are not consulted for authorization at all |

## 12. Edge Cases

| Scenario                                                                                                                   | Expected Behavior                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A user is promoted to `ADMIN` in the database, but calls this endpoint using their still-valid, pre-promotion access token | `403` — the token's `roles` claim is frozen at issuance; a fresh login or `/refresh` is required before the promotion takes effect. **Directly observed and verified live**, both during Feature 8's original testing and again after the Feature 9 permission-based rewrite — the specific mechanism changed (role → permission resolution), but the stale-token propagation delay behaves identically. |
| Empty `User` table (no users registered at all — unlikely in practice since an `ADMIN` had to register first)              | `200`, `{ "users": [] }`                                                                                                                                                                                                                                                                                                                                                                                 |
| Very large number of users                                                                                                 | Currently returns all of them in one response — no pagination; a real scalability limit worth knowing before this table grows large                                                                                                                                                                                                                                                                      |

## 13. Security Testing

- **Authentication checks**: identical to every other protected endpoint
  — verify `authMiddleware` runs first (test with no token → `401`, not
  `403` — a `403` would incorrectly suggest the server evaluated
  authorization before authentication).
- **Authorization checks**: this is the primary thing to test here —
  confirm every non-`ADMIN` role is rejected, not just one example role.
- **Rate limiting**: not implemented.
- **Role escalation / privilege escalation**: confirm there is no way to
  reach this data as a non-admin via any alternate path (there currently
  is only one path to this data, so this is straightforward to confirm
  today, but worth re-checking whenever a new endpoint touching `User`
  data is added).
- **Mass assignment**: N/A — this is a read-only endpoint, nothing is
  written.
- **BOLA (Broken Object Level Authorization)**: not directly applicable
  today, since this endpoint returns _all_ users rather than looking one
  up by a client-supplied ID — but this is exactly the kind of endpoint
  where BOLA becomes relevant the moment a `GET /users/:id` variant is
  ever added (a natural candidate for Employee CRUD or a future user-
  management feature) — worth remembering when that happens.
- **Sensitive data exposure**: verify **every single entry** in the
  `users` array is missing `password`, not just spot-checking the first
  one.

## 14. Database Impact

- **Tables affected**: `User` (read, all rows), `UserRole`+`Role` (read,
  once per distinct role name to build the `roles` array for every user
  in the list), `Role`/`Permission`/`RolePermission` (read, once per
  distinct role name in `req.user.roles`, via the permission cache, to
  authorize the request itself).
- **Rows affected**: none inserted/updated/deleted.
- **Transactions**: N/A.

## 15. Request Lifecycle

```
GET /api/v1/users
Authorization: Bearer <accessToken>
    ↓
(global middleware chain)
    ↓
authMiddleware
    ├─ fails → 401
    └─ succeeds → req.user = { id, roles }
    ↓
requirePermission('user:list')
    ├─ permissionCache.getPermissionKeysForRoles(req.user.roles)
    │    └─ cache miss → rbacRepository.getPermissionKeysForRoles(...)
    ├─ 'user:list' not granted → 403
    └─ 'user:list' granted → next()
    ↓
user.controller.list → user.service.listUsers()
    ↓
user.repository.findAll()
    ├─ rbacRepository.getRoleNamesForUsers(userIds)   [one batched query]
    └─ sanitizeUser(user, roles) applied to every record
    ↓
200 { users: [...] }
```

**Middleware for this endpoint specifically**: `authMiddleware` **then**
`requirePermission('user:list')` — the order is the entire security model
of this route, same principle as Feature 8's `requireRole('ADMIN')`, now
resolved through the permission tables instead of a hard-coded role name.

## 16. Performance Notes

- `findAll()` is an unfiltered `SELECT *` — fine at current scale, but the
  first endpoint in this API where pagination will eventually matter.
- Role-name-to-permission resolution is cached in-memory (a few minutes'
  TTL — see `src/utils/permissionCache.js`) — most requests hit the cache,
  not the database, for the authorization check itself.
- `listUsers()` batches its role lookup into one query for all users
  (`getRoleNamesForUsers`), not one query per user — avoids an N+1 query
  pattern that would otherwise scale linearly with the user count.
- No index concern here since there's no `WHERE` clause at all (a full
  table scan is unavoidable for "return everyone," regardless of
  indexing).

## 17. Interview Notes

See `handbook/08-rbac.md` and the Feature 9 planning doc in full. The
single most important question for this endpoint: _"A user was just
promoted to `ADMIN` — why can't they access this endpoint yet with their
current session?"_ — answered fully there, and directly observed during
both this endpoint's original development and its Feature 9 rewrite. A
second, Feature-9-specific question: _"Why check a permission key instead
of a role name directly?"_ — because the set of things `ADMIN` can do is
now data (`RolePermission` rows), not code; granting `MANAGER` the same
`user:list` access later is a seed-data change, not a code change.

## 18. cURL Examples

```bash
# As ADMIN
curl -i http://localhost:3000/api/v1/users -H "Authorization: Bearer $ADMIN_TOKEN"

# As EMPLOYEE (expect 403)
curl -i http://localhost:3000/api/v1/users -H "Authorization: Bearer $EMPLOYEE_TOKEN"

# No token (expect 401)
curl -i http://localhost:3000/api/v1/users
```

## 19. Postman Collection Notes

Requires `{{accessToken}}` to belong to an `ADMIN`-role user — since
there's no self-service way to become an admin, your Postman environment
needs a token from an account promoted via a direct database update (see
`handbook/08-rbac.md`'s "first admin" discussion). Recommended: keep a
separate `{{adminAccessToken}}` variable distinct from the regular
`{{accessToken}}` used by other requests, and a test account you
routinely re-promote after resetting your local database.

## 20. Testing Checklist

- ✅ Success as `ADMIN` (`200`, full user list)
- ✅ `403` as `EMPLOYEE`/`MANAGER`
- ✅ `401` with no token (confirms auth runs before authorization)
- ✅ `401` with garbage token
- ✅ Every entry in the response missing `password`
- ✅ Role-promotion propagation delay confirmed (stale token still `403`
  until a fresh login)
- ✅ No sensitive data leaked
- ✅ Logs verified: no tokens/secrets logged

---

---

# 9. `POST /employees`

## 1. Endpoint Information

```
Feature:            Employee CRUD (Feature 9, Stage B)
Endpoint:           Create Employee
Description:        Creates a new Employee (HR) record, optionally linked to a User account
Method:             POST
URL:                /api/v1/employees
API Version:        v1
Module:             modules/employees
Authentication:     Yes (Bearer access token)
Authorization:      `employee:create` permission required (ADMIN, MANAGER as seeded)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: the entry point for HR data — separate from the
  `User` (login/auth) table by design, see the Feature 9 planning doc's
  data-model discussion.
- **Business problem solved**: recording department/role/compensation/
  reporting-line data for a person, independent of whether they have (or
  ever will have) login access.
- **Expected callers**: an `ADMIN` or `MANAGER` onboarding a new hire.

## 3. Request Headers

| Header                                | Required | Notes                                                             |
| ------------------------------------- | -------- | ----------------------------------------------------------------- |
| `Content-Type: application/json`      | **Yes**  | Sending malformed JSON returns `400 Invalid JSON in request body` |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to the `employee:create` permission                  |

## 4. Path Parameters

None.

## 5. Query Parameters

None.

## 6. Request Body

```json
{
  "userId": "283a2b17-b05d-49aa-8915-d58c5658f2bb",
  "department": "Engineering",
  "jobTitle": "Backend Developer",
  "salary": 75000,
  "dateOfJoining": "2024-01-15",
  "managerId": null
}
```

| Field           | Type              | Required | Notes                                                                                                                                                           |
| --------------- | ----------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `userId`        | string (UUID)     | No       | Links this Employee to a login account. Omit for an HR-only record with no system access.                                                                       |
| `department`    | string            | Yes      | Free-text, min 1 character — not a normalized `Department` table (see Known Gaps).                                                                              |
| `jobTitle`      | string            | Yes      | Free-text, min 1 character.                                                                                                                                     |
| `salary`        | number            | Yes      | Must be a positive number.                                                                                                                                      |
| `dateOfJoining` | string (ISO date) | Yes      | Coerced to a `Date`. Cannot be in the future.                                                                                                                   |
| `managerId`     | string (UUID)     | No       | Must reference an existing `Employee.id`. Cannot equal the created record's own id (checked in the service, since the id doesn't exist yet at validation time). |

## 7. Validation Rules

Enforced by `src/modules/employees/employee.validation.js`'s
`createEmployeeSchema` (Zod), via `validateMiddleware`.

- `userId`/`managerId`: if present, must be syntactically valid UUIDs
  (Zod's `.uuid()`).
- `department`/`jobTitle`: non-empty strings.
- `salary`: must be a positive number. Custom message:
  `"Salary must be a positive number"`.
- `dateOfJoining`: coerced via `z.coerce.date()`, then `.refine()`d to
  reject any date after "now". Custom message:
  `"Date of joining cannot be in the future"`.
- **Verified quirk**: an entirely missing `dateOfJoining` produces
  `"dateOfJoining: Invalid input: expected date, received Date"` — not
  `"received undefined"` like the other missing-field messages. This is
  `z.coerce.date()`'s own behavior: it coerces `undefined` into
  `new Date(undefined)` (an `Invalid Date`, still typeof `Date`) _before_
  the type check runs, so Zod reports the coerced type, not the original
  one. Worth knowing so this doesn't look like a bug when testing.

**Business-rule validation (in the service, not the schema)**:

- `userId` (if provided) must not already belong to another non-deleted
  `Employee` record — requires a database lookup.
- `managerId` cannot equal the record's own `id` — checked on update, not
  create (a brand-new record's `id` can't be referenced in its own
  creation payload).

## 8. Successful Response

```
201 Created

{
  "employee": {
    "id": "954690da-d433-4b7e-9e04-1c7be03c36bd",
    "userId": "283a2b17-b05d-49aa-8915-d58c5658f2bb",
    "department": "Engineering",
    "jobTitle": "Backend Developer",
    "salary": "75000",
    "dateOfJoining": "2024-01-15T00:00:00.000Z",
    "managerId": null,
    "deletedAt": null,
    "createdAt": "2026-07-05T04:52:52.814Z",
    "updatedAt": "2026-07-05T04:52:52.814Z"
  }
}
```

| Field                | Description                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `employee.id`        | UUID, server-generated.                                                                                                                                                                       |
| `employee.salary`    | **Returned as a string**, not a number — Prisma's `Decimal` type serializes to a string in JSON to avoid floating-point precision loss. Expect this in every response that includes `salary`. |
| `employee.deletedAt` | `null` for a live record — see `DELETE /employees/:id` for the soft-delete value.                                                                                                             |
| `employee.managerId` | `null` unless supplied.                                                                                                                                                                       |

## 9. Error Responses

| Status | Reason                                               | Response (`message`)                                                                       | When                                                                                                                                        |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | Missing required field(s)                            | e.g. `"department: Invalid input: expected string, received undefined"` (joined per field) | Any of `department`/`jobTitle`/`salary`/`dateOfJoining` absent                                                                              |
| `400`  | Negative/zero salary                                 | `"salary: Salary must be a positive number"`                                               | `salary <= 0`                                                                                                                               |
| `400`  | Future `dateOfJoining`                               | `"dateOfJoining: Date of joining cannot be in the future"`                                 | Date is after "now"                                                                                                                         |
| `400`  | Invalid UUID for `userId`/`managerId`                | Zod's default UUID-format message                                                          | Malformed UUID string supplied                                                                                                              |
| `400`  | Malformed JSON body                                  | `"Invalid JSON in request body"`                                                           | Same as every other JSON-body endpoint                                                                                                      |
| `401`  | No/invalid/expired access token                      | Same as every other protected endpoint                                                     | `authMiddleware` failure                                                                                                                    |
| `400`  | `userId`/`managerId` references a nonexistent record | `"userId: references a record that does not exist"` (or `managerId:`)                      | The referenced `User`/`Employee` doesn't exist — a Prisma FK-violation (`P2003`), translated in the service rather than left as a raw `500` |
| `403`  | Roles don't grant `employee:create`                  | `"You do not have permission to perform this action"`                                      | Authenticated as plain `EMPLOYEE`                                                                                                           |
| `409`  | `userId` already has an Employee record              | `"This user already has an employee record"`                                               | Duplicate `userId` (only counts non-deleted records), via pre-check or the DB's own partial-unique-index constraint                         |

## 10. Postman Test Cases

| #   | Case                 | Body                                                                                                                        | Expected                            |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | Valid, with `userId` | `{"userId":"<uuid>","department":"Engineering","jobTitle":"Backend Developer","salary":75000,"dateOfJoining":"2024-01-15"}` | `201`                               |
| 2   | Valid, no `userId`   | Same, minus `userId`                                                                                                        | `201`, `employee.userId: null`      |
| 3   | Duplicate `userId`   | Same `userId` as test 1, run again                                                                                          | `409`                               |
| 4   | Empty body           | `{}`                                                                                                                        | `400`, all 4 required fields listed |
| 5   | Negative salary      | `{..., "salary": -500}`                                                                                                     | `400`                               |
| 6   | Future date          | `{..., "dateOfJoining": "2099-01-01"}`                                                                                      | `400`                               |
| 7   | As `EMPLOYEE` token  | Any valid body                                                                                                              | `403`                               |
| 8   | No token             | Any valid body                                                                                                              | `401`                               |
| 9   | Nonexistent `userId` | `{..., "userId": "00000000-0000-0000-0000-000000000000"}`                                                                   | `400`, not `500`                    |

## 11. Negative Testing

| Payload/Scenario                                        | Expected                                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Wrong data types (`"salary": "not-a-number"`)           | `400` — Zod type-check fails                                                                                   |
| SQL injection attempt in `department`/`jobTitle`        | Stored as literal text — Prisma's parameterized queries neutralize it; no query-structure risk                 |
| XSS attempt (`"jobTitle": "<script>alert(1)</script>"`) | Accepted and stored as-is — same frontend-escaping-is-the-real-boundary reasoning as `register`'s `name` field |
| Very long `department`/`jobTitle` (10,000+ characters)  | Currently accepted — no max-length rule, a real (if minor) gap, same class as `register`'s `name` field        |
| Malformed JSON                                          | `400`, `"Invalid JSON in request body"`                                                                        |
| Tampered/expired JWT                                    | `401`                                                                                                          |
| Wrong role (`EMPLOYEE`)                                 | `403`                                                                                                          |
| Wrong method (`GET` with a body) / wrong URL            | `404`/method-not-allowed via Express's default routing                                                         |

## 12. Edge Cases

| Scenario                                                                                          | Expected Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Concurrent create requests for the same `userId`                                                  | Only one succeeds (`201`); the other gets `409` from the database's partial-unique-index catch, not just the pre-check — **not independently verified under true concurrency**, same honestly-flagged gap as `register`                                                                                                                                                                                                                                                                                                                                                                                                              |
| `userId` referencing a `User` that doesn't exist                                                  | `400`, `"userId: references a record that does not exist"` — **found and fixed while writing this doc**: this originally leaked a raw `500` with the Prisma error text, since nothing caught the `P2003` foreign-key-violation code. Now translated in `employee.service.js`.                                                                                                                                                                                                                                                                                                                                                        |
| `managerId` referencing a non-existent `Employee`                                                 | Same fix, same message shape with `managerId` instead                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Creating an employee, then re-creating one for the same `userId` after the first was soft-deleted | `201` — succeeds. **This required a real fix during Feature 9's own development**: the database's unique constraint on `Employee.userId` was originally a plain (non-partial) unique index, which blocked reuse forever — contradicting the soft-delete design, and caught by testing this exact scenario, not by code review. Fixed with a hand-written partial unique index (`WHERE "deletedAt" IS NULL`), since Prisma's schema DSL has no syntax for partial unique constraints. Verified live: soft-deleting frees the `userId` for a brand-new record, while a genuinely-still-active duplicate still correctly returns `409`. |

## 13. Security Testing

- **Authentication/authorization**: confirm `401` before `403` (no token
  vs. wrong role), same principle as every other protected endpoint.
- **Rate limiting**: not implemented — same acknowledged gap as the rest
  of the API.
- **Mass assignment**: confirm fields not in the schema (`id`, `deletedAt`,
  `createdAt`) cannot be client-supplied and honored — Zod strips
  unrecognized keys by default.
- **BOLA**: not directly applicable to creation (no existing resource is
  looked up by client-supplied ID) — but the `userId` **is** a
  client-supplied reference to another resource; confirm a non-admin
  cannot use this endpoint to link an Employee record to an arbitrary
  `userId` they don't own (mitigated entirely by the permission gate — an
  `EMPLOYEE` can't reach this endpoint at all).
- **Sensitive data exposure**: the response includes `salary` — confirm
  only `ADMIN`/`MANAGER` (who already have `employee:create`) ever see
  this endpoint's response at all.

## 14. Database Impact

- **Tables affected**: `Employee` (insert), `AuditLog` (insert, as of
  Feature 11).
- **Rows inserted**: exactly 1 `Employee` row and exactly 1 `AuditLog`
  row (`action: 'CREATE'`), on success.
- **Transactions**: **as of Feature 11**, the `Employee` insert and the
  `AuditLog` insert happen inside one `prisma.$transaction` — either both
  succeed or neither does, so a mutation can never exist without a
  matching audit entry (or vice versa).
- **Cascade/rollback behavior**: if the transaction fails partway (e.g.
  the duplicate-`userId` race condition), both inserts roll back
  together — no orphaned `Employee` row, no orphaned audit entry.
  Verified live: forcing `400`/`409` failures produces zero new
  `AuditLog` rows.

## 15. Request Lifecycle

```
POST /api/v1/employees
    ↓
(global middleware chain)
    ↓
authMiddleware
    ↓
requirePermission('employee:create')
    ↓ (403 if not granted)
validateMiddleware(createEmployeeSchema)
    ↓ (400 on Zod failure)
employee.controller.create (asyncHandler-wrapped)
    ↓
employee.service.createEmployee(data, { id: req.user.id, ipAddress: req.ip })
    ├─ userId provided? → employeeRepository.findByUserId → exists? → 409
    └─ prisma.$transaction:
         ├─ employeeRepository.create(data, tx)
         └─ auditLogRepository.create({ action: 'CREATE', ... }, tx)
    └─ (catch) Prisma P2002 → 409 (race-condition fallback, transaction rolled back)
    ↓
201 { employee }
```

## 16. Performance Notes

- `findByUserId` uses the `@unique` index on `Employee.userId`.
- **As of Feature 11**: one additional `AuditLog` insert per request,
  inside the same transaction as the `Employee` insert — a second
  round-trip cost in exchange for the atomicity guarantee above.
- Permission resolution for `employee:create` benefits from the same
  in-memory cache as every other permission-gated route.

## 17. Interview Notes

- **Q: Why is `Employee` a separate table from `User` instead of adding
  columns to `User`?** Separation of concerns at the data level — auth
  identity and HR data have different lifecycles and, in a larger system,
  are often owned by different services entirely. See the Feature 9
  planning doc's full data-model discussion.
- **Q: Why does the service pre-check for a duplicate `userId` AND catch
  the database's own unique-constraint error?** The pre-check is for the
  common case (fast, friendly `409` without hitting a constraint
  violation); the catch is for the rare race-condition case a pre-check
  alone can't close, since two requests can both pass the pre-check
  before either commits. The database is the actual source of truth for
  uniqueness — the pre-check is an optimization, not the guarantee.
- **Q: Why is `Employee.userId`'s uniqueness enforced by a hand-written
  partial index instead of a plain `@unique` in `schema.prisma`?**
  Because the real business rule is "at most one **active** Employee per
  user," not "at most one ever" — a plain unique index can't distinguish
  a soft-deleted row from a live one, so it would permanently block
  reusing a `userId` after its Employee record was soft-deleted. A
  `CREATE UNIQUE INDEX ... WHERE "deletedAt" IS NULL` expresses that
  correctly; Prisma's schema DSL has no syntax for partial constraints,
  so this required a hand-written migration rather than a schema
  attribute. This also forced the `User`↔`Employee` relation to be
  modeled as one-to-many (`User.employees: Employee[]`) rather than
  one-to-one, since Prisma requires the FK side of a 1:1 relation to be
  schema-level unique — which, honestly, is the more accurate model
  anyway: a `userId` genuinely can have more than one `Employee` row over
  time (history), just never more than one _live_ one. **This was a real
  bug caught by testing the soft-delete-then-recreate scenario while
  writing this documentation**, not found by code review — worth citing
  as a concrete example of why testing the documented edge cases matters.

## 18. cURL Examples

```bash
curl -i -X POST http://localhost:3000/api/v1/employees \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"department":"Engineering","jobTitle":"Backend Developer","salary":75000,"dateOfJoining":"2024-01-15"}'
```

## 19. Postman Collection Notes

Requires `{{accessToken}}` to resolve to `employee:create` (`ADMIN`/
`MANAGER`). Save the returned `employee.id` to a collection variable
(e.g. `{{employeeId}}`) — every other Employee endpoint needs it.

## 20. Testing Checklist

- ✅ Success with and without `userId`
- ✅ `409` on duplicate (still-active) `userId`
- ✅ `201` re-creating for a `userId` whose prior Employee record was soft-deleted
- ✅ `400` (not `500`) on nonexistent `userId`/`managerId`
- ✅ `400` on missing fields, negative salary, future date
- ✅ `403` as `EMPLOYEE`, `401` with no token
- ✅ `salary` returned as a string, not a number
- ✅ No sensitive data leaked beyond the intended `salary` field
- ✅ Logs verified: no tokens/secrets logged

---

---

# 10. `GET /employees`

## 1. Endpoint Information

```
Feature:            Employee Search, Pagination, Filtering, Sorting (Feature 10)
Endpoint:           List Employees
Description:        Returns a paginated, searchable, filterable, sortable slice of non-deleted Employee records
Method:             GET
URL:                /api/v1/employees
API Version:        v1
Module:             modules/employees
Authentication:     Yes (Bearer access token)
Authorization:      `employee:read:any` permission required (ADMIN, MANAGER as seeded)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: gives HR/management visibility into the full
  workforce, at a scale where returning every row in one response (the
  Feature 9 behavior) stops being practical.
- **Business problem solved**: "who works here, in what role, reporting
  to whom" — plus, as of this feature, "find a specific person or group
  quickly" and "browse a bounded page at a time."
- **Expected callers**: `ADMIN`/`MANAGER` only — a plain `EMPLOYEE` never
  reaches this endpoint (they only ever hold `employee:read:own`, which
  this route doesn't accept).

## 3. Request Headers

| Header                                | Required | Notes                                              |
| ------------------------------------- | -------- | -------------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to the `employee:read:any` permission |

## 4. Path Parameters

None.

## 5. Query Parameters

| Name         | Type   | Default     | Required | Allowed Values                                                   | Notes                                                                                                                                                                        |
| ------------ | ------ | ----------- | -------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`       | number | `1`         | No       | Integer `>= 1`                                                   | `0` or negative → `400`.                                                                                                                                                     |
| `limit`      | number | `10`        | No       | Integer `1`-`100`                                                | `0`, negative, or `> 100` → `400` (rejected, not silently clamped).                                                                                                          |
| `search`     | string | _(none)_    | No       | Any string                                                       | Case-insensitive partial match across `department`, `jobTitle`, the linked `User.name`, and `User.email`. An empty `search=` is treated identically to omitting it entirely. |
| `department` | string | _(none)_    | No       | Any string                                                       | **Exact** match, case-insensitive (not a partial match — use `search` for partial).                                                                                          |
| `jobTitle`   | string | _(none)_    | No       | Any string                                                       | Same as `department`.                                                                                                                                                        |
| `managerId`  | string | _(none)_    | No       | Valid UUID                                                       | Exact match. Invalid UUID format → `400`.                                                                                                                                    |
| `sortBy`     | string | `createdAt` | No       | `department`, `jobTitle`, `salary`, `dateOfJoining`, `createdAt` | Whitelisted — any other value → `400`, never passed through to Prisma's `orderBy` directly.                                                                                  |
| `order`      | string | `desc`      | No       | `asc`, `desc`                                                    | Any other value → `400`.                                                                                                                                                     |

All filters (`department`, `jobTitle`, `managerId`) combine with **AND**;
`search` contributes one **OR** block across its four fields, itself
ANDed with whatever filters are also present.

## 6. Request Body

None.

## 7. Validation Rules

Enforced by `src/modules/employees/employee.validation.js`'s
`listEmployeesQuerySchema` (Zod), via `validateMiddleware(schema, 'query')`
— the first endpoint in this API to validate query parameters rather than
a request body. Every field above is coerced/bounded/whitelisted by that
schema before the service ever sees it; nothing reaches Prisma unvalidated.

## 8. Successful Response

```
200 OK

{
  "employees": [
    {
      "id": "ecb69110-8183-4769-a98b-8b0f69bf2f6a",
      "userId": "283a2b17-b05d-49aa-8915-d58c5658f2bb",
      "department": "Support",
      "jobTitle": "Specialist",
      "salary": "55000",
      "dateOfJoining": "2024-03-01T00:00:00.000Z",
      "managerId": null,
      "deletedAt": null,
      "createdAt": "2026-07-05T05:58:39.416Z",
      "updatedAt": "2026-07-05T05:58:39.416Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 14,
    "totalPages": 2
  }
}
```

Field notes: `employees` is up to `limit` non-deleted rows matching the
search/filters, ordered by `sortBy`/`order` plus an unconditional
secondary `id ASC` tiebreaker for deterministic ordering across repeated/
paged calls. `pagination.page`/`pagination.limit` echo the request.
`pagination.total` is the count across **all** matching pages, not just
this one. `pagination.totalPages` is `Math.ceil(total / limit)`.

## 9. Error Responses

| Status | Reason                                | Response (`message`)                                  | When                                      |
| ------ | ------------------------------------- | ----------------------------------------------------- | ----------------------------------------- |
| `400`  | `page`/`limit` out of bounds          | Zod's bounds-violation message                        | `page < 1`, `limit < 1`, or `limit > 100` |
| `400`  | Invalid `managerId`                   | Zod's UUID-format message                             | Malformed UUID supplied                   |
| `400`  | Invalid `sortBy`                      | Zod's enum message listing the allowed values         | Any value outside the whitelist           |
| `400`  | Invalid `order`                       | Zod's enum message                                    | Any value other than `asc`/`desc`         |
| `401`  | No/invalid/expired access token       | Same as every other protected endpoint                | `authMiddleware` failure                  |
| `403`  | Roles don't grant `employee:read:any` | `"You do not have permission to perform this action"` | Authenticated as plain `EMPLOYEE`         |

## 10. Postman Test Cases

| #   | Case                                  | Query                                  | Expected                                                     |
| --- | ------------------------------------- | -------------------------------------- | ------------------------------------------------------------ |
| 1   | Default call                          | _(none)_                               | `200`, `page: 1`, `limit: 10`                                |
| 2   | Explicit pagination                   | `?page=2&limit=3`                      | `200`, second page of 3, distinct from page 1                |
| 3   | Out-of-bounds `page`                  | `?page=0`                              | `400`                                                        |
| 4   | Out-of-bounds `limit`                 | `?limit=0` or `?limit=500`             | `400`                                                        |
| 5   | Empty search                          | `?search=`                             | `200`, identical `total` to no `search` at all               |
| 6   | Search by department (Employee field) | `?search=Sales`                        | `200`, only `Sales`-department rows                          |
| 7   | Search by linked user's name          | `?search=<a linked User's name>`       | `200`, matches via the `user.name` relation                  |
| 8   | Exact filter, wrong case              | `?department=engineering`              | `200`, still matches `"Engineering"` rows (case-insensitive) |
| 9   | Sort ascending vs. descending         | `?sortBy=salary&order=asc` / `...desc` | `200`, orders reversed between the two calls                 |
| 10  | Invalid `sortBy`                      | `?sortBy=notARealColumn`               | `400`                                                        |
| 11  | As `EMPLOYEE` token                   | _(any)_                                | `403`                                                        |
| 12  | No token                              | _(any)_                                | `401`                                                        |

## 11. Negative Testing

| Scenario                                                                 | Expected                                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Wrong HTTP method (`POST /employees` with no body handled by this route) | `405`/routed to the `POST` handler instead, not this one — confirm the correct handler runs for each verb                       |
| Tampered/expired JWT                                                     | `401`                                                                                                                           |
| Attempting `?role=ADMIN` or similar query tampering                      | No effect — authorization reads `req.user.roles` from the verified token only                                                   |
| `?sortBy=deletedAt` or any real-but-unlisted column name                 | `400` — the whitelist rejects it before it ever reaches Prisma's `orderBy`, regardless of whether the column actually exists    |
| SQL injection attempt in `search`/`department`/`jobTitle`                | Treated as a literal string — Prisma's parameterized `contains`/`equals` neutralizes it; no query-structure risk                |
| Extremely long `search` string (10,000+ characters)                      | Currently accepted, no max length — a minor, honestly-acknowledged gap, same class as other unbounded-string fields in this API |
| Non-numeric `page`/`limit` (e.g. `?page=abc`)                            | `400` — Zod's `coerce.number()` fails, reported as a type-mismatch                                                              |

## 12. Edge Cases

| Scenario                                                                | Expected Behavior                                                                                                                                          |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No employees match the search/filters at all                            | `200`, `{ "employees": [], "pagination": { "total": 0, "totalPages": 0, ... } }` — not an error                                                            |
| `page` beyond the last page (e.g. `page=999` with only 2 real pages)    | `200`, `{ "employees": [] }` — an out-of-range page is simply an empty slice, not a `404`                                                                  |
| Multiple rows sharing the identical `sortBy` value (e.g. same `salary`) | The unconditional `id ASC` secondary sort breaks the tie deterministically — repeating the exact same request always returns the same order, verified live |
| All employees soft-deleted                                              | `200`, `{ "employees": [], "pagination": { "total": 0, ... } }` — soft-deleted rows are invisible to this endpoint, by design                              |
| An `Employee` with `userId: null` and an active `search` term           | Only ever matches via its own `department`/`jobTitle` fields — the `user.name`/`user.email` branches simply never match a null relation, no error          |

## 13. Security Testing

- **Authorization**: confirm every non-`:any`-granting role is rejected.
- **Sensitive data exposure**: `salary` is present for every entry — this
  is exactly why the permission gate matters here more than on most
  endpoints in this API.
- **BOLA**: not applicable — returns a collection, not a client-supplied
  ID lookup (see `GET /employees/:id` for where BOLA actually applies).
- **Query-parameter injection**: confirm `sortBy` is truly whitelisted —
  attempt every real column name that _isn't_ in the allowed list (e.g.
  `deletedAt`, `id`, `userId`) and confirm each is rejected with `400`,
  not silently accepted or passed through to a raw query.
- **Resource exhaustion via `limit`**: confirm the server-side cap
  (`100`) actually rejects a larger request rather than silently
  clamping it — a silent clamp is a valid alternative design, but this
  API's is a hard rejection, and that's the behavior to verify.

## 14. Database Impact

- **Tables affected**: `Employee` (read, filtered/sorted/paginated),
  `User` (read, via relation join — only when `search` is present and
  matches against `user.name`/`user.email`).
- **Rows affected**: none inserted/updated/deleted.
- **Queries per request**: two, run concurrently via `Promise.all` — one
  `findMany` (the page of results) and one `count` (the total across all
  matching pages). Not wrapped in a transaction — see the Performance
  Notes/Interview Notes below for why that's an accepted trade-off here.

## 15. Request Lifecycle

```
GET /api/v1/employees?search=...&department=...&sortBy=...&order=...&page=...&limit=...
    ↓
authMiddleware
    ↓
requirePermission('employee:read:any')
    ↓ (403 if not granted)
validateMiddleware(listEmployeesQuerySchema, 'query')
    ↓ (400 on Zod failure; result lands on req.validatedQuery, not req.query)
employee.controller.list → employee.service.listEmployees(req.validatedQuery)
    ├─ buildEmployeeWhere({ search, department, jobTitle, managerId })
    └─ Promise.all([
         employeeRepository.findAll({ where, orderBy: [{[sortBy]: order}, {id: 'asc'}], skip, take }),
         employeeRepository.count(where),
       ])
    ↓
200 { employees: [...], pagination: {...} }
```

## 16. Performance Notes

- Two queries per request (`findMany` + `count`), run concurrently via
  `Promise.all`, not a `$transaction` — a deliberate choice: a
  transaction would guarantee the list and the count reflect the exact
  same database snapshot even under concurrent writes, but `Promise.all`
  is measurably cheaper and the two queries reflecting slightly
  different moments in time is an acceptable, minor inconsistency for an
  HR application. Revisit only if this specific inconsistency ever
  causes a real problem in practice.
- `search` uses `contains`/`mode: 'insensitive'` (Postgres `ILIKE`) across
  four fields, including a join to `User` — a sequential scan on both
  tables at this data size; a future `pg_trgm` trigram index is the
  documented upgrade path if this table grows large enough for it to
  matter (not needed today).
- Filters (`department`, `jobTitle`, `managerId`) are unindexed exact/
  case-insensitive matches — fine at current scale; `Employee.userId` and
  `Employee.managerId` already have indexes from Feature 9, but exact
  filters on `department`/`jobTitle` do not yet.
- `limit`'s hard cap (100) bounds the worst-case single-request cost
  regardless of what's asked for.

## 17. Interview Notes

- **Q: Why does `EMPLOYEE`'s `employee:read:own` permission not work on
  this route at all, even for their own record?** This route only
  accepts `employee:read:any` — an `EMPLOYEE` reaching it is rejected at
  the middleware layer before any record is even considered, by design:
  "list everyone, searchable/paginated" and "read one specific record you
  own" are different operations with different risk profiles, gated by
  different permission keys.
- **Q: Why `Promise.all` instead of a `$transaction` for the list+count
  pair?** A transaction guarantees both queries see an identical
  snapshot, which matters under heavy concurrent writes; `Promise.all` is
  cheaper and the two queries can, in principle, reflect a row inserted/
  deleted between them. For an HR application (not a financial ledger),
  that inconsistency window is an accepted, explicitly documented
  trade-off, not an oversight.
- **Q: Why validate query parameters into `req.validatedQuery` instead of
  overwriting `req.query`?** `req.query` is a getter-only accessor under
  Express 5 — assigning to it throws in this project's strict-mode ES
  modules (verified directly, not assumed). `validateMiddleware` had to
  be generalized to write query results to a different property while
  keeping `req.body`'s existing overwrite behavior unchanged for every
  other call site.
- **Q: Why is the secondary `id ASC` sort unconditional, applied even
  when `sortBy` is already `createdAt`?** Any `sortBy` column can have
  duplicate values across rows (two employees with the same `salary`, or
  even the same `createdAt` if created in the same request batch) —
  without a tiebreaker, the database is free to return tied rows in any
  order, which can differ between identical repeated requests. `id` is
  always unique, so appending it as a secondary sort guarantees full
  determinism regardless of what the primary sort column is.

## 18. cURL Examples

```bash
# Default
curl -i http://localhost:3000/api/v1/employees -H "Authorization: Bearer $ADMIN_TOKEN"

# Paginated, sorted, filtered
curl -i "http://localhost:3000/api/v1/employees?page=2&limit=5&sortBy=salary&order=desc" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Search across Employee fields and the linked User's name/email
curl -i "http://localhost:3000/api/v1/employees?search=Jane" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Exact filter, case-insensitive
curl -i "http://localhost:3000/api/v1/employees?department=engineering" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 19. Postman Collection Notes

Same `{{accessToken}}` requirement as `POST /employees`. Recommended
Postman environment additions for exercising this endpoint fully:
`{{page}}`, `{{limit}}`, `{{search}}` as empty-by-default variables you
fill in per test run, rather than hard-coding query strings into every
saved request.

## 20. Testing Checklist

- ✅ `200` as `ADMIN`/`MANAGER`, `403` as `EMPLOYEE`, `401` with no token
- ✅ Pagination: default page/limit, explicit page/limit, out-of-range page
- ✅ `400` on `page < 1`, `limit < 1`, `limit > 100`, invalid `sortBy`/`order`/`managerId`
- ✅ Empty `search=` behaves identically to no `search`
- ✅ `search` matches both `Employee` fields and the linked `User`'s name/email
- ✅ Exact filters are case-insensitive
- ✅ Sort order actually reverses between `asc`/`desc`; repeated identical
  calls return identical ordering (stability)
- ✅ Empty array (not an error) when no rows match or all are soft-deleted
- ✅ No sensitive data leaked beyond intended fields

---

---

# 11. `GET /employees/:id`

## 1. Endpoint Information

```
Feature:            Employee CRUD (Feature 9, Stage B)
Endpoint:           Get Employee By ID
Description:        Returns a single Employee record, subject to an ownership check
Method:             GET
URL:                /api/v1/employees/:id
API Version:        v1
Module:             modules/employees
Authentication:     Yes (Bearer access token)
Authorization:      `employee:read:any` OR `employee:read:own` (the latter requires the record's userId to match the caller)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: the one place a plain `EMPLOYEE` can see Employee
  data at all — their own record.
- **Business problem solved**: "what does my own HR record say" for a
  regular employee, and "look up this specific person" for HR/management.
- **Expected callers**: any authenticated user, with two different access
  paths depending on their permissions.

## 3. Request Headers

| Header                                | Required | Notes                                                      |
| ------------------------------------- | -------- | ---------------------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to `employee:read:any` or `employee:read:own` |

## 4. Path Parameters

| Name | Type          | Required | Description              | Example                                |
| ---- | ------------- | -------- | ------------------------ | -------------------------------------- |
| `id` | string (UUID) | **Yes**  | The Employee record's id | `954690da-d433-4b7e-9e04-1c7be03c36bd` |

## 5. Query Parameters

None.

## 6. Request Body

None.

## 7. Validation Rules

No format validation on `id` at all — an invalid UUID or a well-formed
UUID that doesn't exist both simply fail to match any row and produce the
same `404`. This is the two-layer authorization design in action:

1. **Middleware** (`requirePermission('employee:read:any',
'employee:read:own')`): does the caller's roles grant _either_ key?
   If neither, `403` — before the record is even fetched.
2. **Service** (`getEmployeeById`): fetches the record first (`404` if
   missing/soft-deleted), _then_ — only if the caller doesn't have the
   `:any` grant — compares `employee.userId` to the caller's own id,
   throwing `403` on mismatch. The middleware alone cannot do this check;
   it has no record to compare against yet.

## 8. Successful Response

```
200 OK

{
  "employee": {
    "id": "954690da-d433-4b7e-9e04-1c7be03c36bd",
    "userId": "283a2b17-b05d-49aa-8915-d58c5658f2bb",
    "department": "Engineering",
    "jobTitle": "Backend Developer",
    "salary": "75000",
    "dateOfJoining": "2024-01-15T00:00:00.000Z",
    "managerId": null,
    "deletedAt": null,
    "createdAt": "2026-07-05T04:52:52.814Z",
    "updatedAt": "2026-07-05T04:52:52.814Z"
  }
}
```

Same field meanings as `POST /employees`'s response.

## 9. Error Responses

| Status | Reason                                                           | Response (`message`)                                        | When                                                                                                                                  |
| ------ | ---------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `401`  | No/invalid/expired access token                                  | Same as every other protected endpoint                      | `authMiddleware` failure                                                                                                              |
| `403`  | Roles grant neither `employee:read:any` nor `employee:read:own`  | `"You do not have permission to perform this action"`       | Caller has no employee-related read permission at all (should not normally happen given the seeded roles, but fails closed if it did) |
| `403`  | Caller only has `employee:read:own`, and the record isn't theirs | `"You do not have permission to view this employee record"` | A different, more specific message than the middleware's — deliberately distinguishable in logs/testing                               |
| `404`  | No such record, or it's soft-deleted                             | `"Employee not found"`                                      | Invalid/nonexistent/deleted `id`                                                                                                      |

## 10. Postman Test Cases

| #   | Case                                      | Expected                            |
| --- | ----------------------------------------- | ----------------------------------- |
| 1   | `ADMIN`/`MANAGER`, any valid `id`         | `200`                               |
| 2   | Owning `EMPLOYEE`, own `id`               | `200`                               |
| 3   | Different `EMPLOYEE`, someone else's `id` | `403` (the record-specific message) |
| 4   | Valid UUID, nonexistent record            | `404`                               |
| 5   | Malformed (non-UUID) `id`                 | `404` (verified live — no `500`)    |
| 6   | No token                                  | `401`                               |

## 11. Negative Testing

| Scenario                                              | Expected                                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| SQL injection attempt as the `id` (`'; DROP TABLE--`) | `404` — Prisma's parameterized query treats it as a literal string that matches nothing, no query-structure risk |
| Extremely long string as `id`                         | `404` — same as above, just a very long non-matching string                                                      |
| Tampered/expired JWT                                  | `401`                                                                                                            |
| Wrong method (`POST /employees/:id`)                  | `404` (no route registered for `POST` on this path)                                                              |

## 12. Edge Cases

| Scenario                                                                                      | Expected Behavior                                                                                                                        |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Record soft-deleted between listing it and fetching it by id                                  | `404` — the repository's `findById` filters `deletedAt: null`, so a just-deleted record disappears immediately, no stale read window     |
| An `ADMIN` fetching their _own_ Employee record (if they have one)                            | `200` — `:any` short-circuits the ownership check entirely; an admin never needs `:own` to see their own record                          |
| A user with **no** Employee record calling this with someone else's `id`, holding only `:own` | `403` — the ownership check compares against `employee.userId`, which will simply never equal a caller who has no Employee record at all |

## 13. Security Testing

- **BOLA (Broken Object Level Authorization)**: this is the primary BOLA
  test case in this API so far — confirm systematically that an
  `employee:read:own`-only caller **cannot** read any `id` except the one
  whose `userId` matches their own, by testing at least two different
  non-owned ids, not just one.
- **Authorization layering**: confirm the two distinct `403` messages
  above actually correspond to the two different rejection paths
  (middleware vs. service) — useful for distinguishing "wrong permission
  entirely" from "right permission, wrong record" during testing.
- **Sensitive data exposure**: `salary` is visible to the record's own
  owner here (unlike `GET /employees`, which an `EMPLOYEE` can never
  reach) — confirm this is the intended behavior (an employee seeing
  their own salary is expected; seeing anyone else's is not).

## 14. Database Impact

- **Tables affected**: `Employee` (read only, single row).
- **Rows affected**: none inserted/updated/deleted.

## 15. Request Lifecycle

```
GET /api/v1/employees/:id
    ↓
authMiddleware
    ↓
requirePermission('employee:read:any', 'employee:read:own')
    ↓ (403 if neither granted; req.grantedPermissions set otherwise)
employee.controller.getById → employee.service.getEmployeeById(id, { id: req.user.id, grantedPermissions })
    ├─ employeeRepository.findById(id)   [WHERE id = ? AND deletedAt IS NULL]
    │    └─ not found → 404
    ├─ grantedPermissions includes 'employee:read:any'? → skip ownership check
    └─ else: employee.userId !== requester.id → 403
    ↓
200 { employee }
```

## 16. Performance Notes

- `findById` filters on the primary key plus `deletedAt` — cheap,
  index-backed lookup.
- The ownership check is pure in-memory comparison (`===`), no extra
  query.

## 17. Interview Notes

- **Q: Why does the middleware accept _either_ `employee:read:any` or
  `employee:read:own` on the same route, instead of two separate
  routes?** The HTTP contract (`GET /employees/:id`) is identical either
  way — what differs is _whose_ records you can reach, which is a
  data-level concern, not a routing concern. Splitting it into two routes
  would duplicate the endpoint for no benefit; the ownership check
  belongs in the service layer regardless.
- **Q: Could the ownership check be done in the middleware instead?** No
  — the middleware runs before the controller/service ever fetches the
  record, so it has no `employee.userId` to compare against yet. This is
  exactly why this API uses a two-layer model: middleware for the coarse
  "can you do this at all" gate, service for the fine "is this specific
  record yours" gate.

## 18. cURL Examples

```bash
# As the owning EMPLOYEE
curl -i http://localhost:3000/api/v1/employees/$EMPLOYEE_ID \
  -H "Authorization: Bearer $EMPLOYEE_TOKEN"

# As ADMIN, any id
curl -i http://localhost:3000/api/v1/employees/$EMPLOYEE_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 19. Postman Collection Notes

Needs both an `{{adminAccessToken}}` and an `{{employeeAccessToken}}` (the
latter belonging to the user whose `userId` the target Employee record
points to) to exercise both authorization paths.

## 20. Testing Checklist

- ✅ `200` as `ADMIN`/`MANAGER` for any record
- ✅ `200` as the owning `EMPLOYEE`
- ✅ `403` (record-specific message) as a different `EMPLOYEE`
- ✅ `404` for nonexistent and soft-deleted records
- ✅ `404` (not `500`) for a malformed/non-UUID `id`
- ✅ `401` with no token
- ✅ No sensitive data leaked beyond intended fields

---

---

# 12. `PATCH /employees/:id`

## 1. Endpoint Information

```
Feature:            Employee CRUD (Feature 9, Stage B)
Endpoint:           Update Employee
Description:        Partially updates an Employee record
Method:             PATCH
URL:                /api/v1/employees/:id
API Version:        v1
Module:             modules/employees
Authentication:     Yes (Bearer access token)
Authorization:      `employee:update:any` permission required (ADMIN, MANAGER as seeded)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: HR data changes — promotions, department transfers,
  manager reassignment, salary changes.
- **Business problem solved**: keeping HR records current without
  re-creating them.
- **Expected callers**: `ADMIN`/`MANAGER` only — no self-service update
  path exists for `EMPLOYEE` (see Known Gaps).

## 3. Request Headers

| Header                                | Required | Notes                                                |
| ------------------------------------- | -------- | ---------------------------------------------------- |
| `Content-Type: application/json`      | **Yes**  | For any request with a body                          |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to the `employee:update:any` permission |

## 4. Path Parameters

| Name | Type          | Required | Description              | Example                                |
| ---- | ------------- | -------- | ------------------------ | -------------------------------------- |
| `id` | string (UUID) | **Yes**  | The Employee record's id | `954690da-d433-4b7e-9e04-1c7be03c36bd` |

## 5. Query Parameters

None.

## 6. Request Body

Same shape as `POST /employees`, but **every field is optional**
(`updateEmployeeSchema` is `createEmployeeSchema.partial()`). Send only
the fields you want to change.

```json
{
  "department": "Platform Engineering",
  "salary": 82000
}
```

## 7. Validation Rules

Same per-field rules as `POST /employees` (Section 7 there), applied only
to whichever fields are present. Additional business rule, checked in the
service: **`managerId` cannot equal the record's own `id`** — an employee
cannot be their own manager. Verified live: `400`,
`"An employee cannot be their own manager"`.

## 8. Successful Response

```
200 OK

{
  "employee": {
    "id": "954690da-d433-4b7e-9e04-1c7be03c36bd",
    "userId": "283a2b17-b05d-49aa-8915-d58c5658f2bb",
    "department": "Platform Engineering",
    "jobTitle": "Backend Developer",
    "salary": "82000",
    "dateOfJoining": "2024-01-15T00:00:00.000Z",
    "managerId": null,
    "deletedAt": null,
    "createdAt": "2026-07-05T04:52:52.814Z",
    "updatedAt": "2026-07-05T05:10:00.000Z"
  }
}
```

Only `updatedAt` changes automatically among the timestamp fields.

## 9. Error Responses

| Status | Reason                                   | Response (`message`)                                  | When                                                                   |
| ------ | ---------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `400`  | `managerId` equals the record's own `id` | `"An employee cannot be their own manager"`           | Self-management attempt                                                |
| `400`  | Invalid field value(s)                   | Same per-field messages as `POST /employees`          | e.g. negative salary, future date, malformed UUID                      |
| `401`  | No/invalid/expired access token          | Same as every other protected endpoint                | `authMiddleware` failure                                               |
| `403`  | Roles don't grant `employee:update:any`  | `"You do not have permission to perform this action"` | Any `EMPLOYEE`, or a `MANAGER`/`ADMIN` role misconfigured in seed data |
| `404`  | No such record, or it's soft-deleted     | `"Employee not found"`                                | Invalid/nonexistent/deleted `id`                                       |

## 10. Postman Test Cases

| #   | Case                               | Body                                            | Expected                |
| --- | ---------------------------------- | ----------------------------------------------- | ----------------------- |
| 1   | Valid partial update               | `{"department":"Platform Engineering"}`         | `200`                   |
| 2   | Self-management (`managerId = id`) | `{"managerId":"<same id>"}`                     | `400`                   |
| 3   | Nonexistent `id`                   | `{"department":"X"}`                            | `404`                   |
| 4   | As `EMPLOYEE` token                | Any body                                        | `403`                   |
| 5   | Empty body `{}`                    | Valid — no fields required for a partial update | `200`, no fields change |

## 11. Negative Testing

Same category of tests as `POST /employees`'s Negative Testing section
(wrong types, XSS/SQL attempts, malformed JSON, tampered JWT) — all
behave identically, applied to whichever fields are sent.

## 12. Edge Cases

| Scenario                                                    | Expected Behavior                                                                                                                                                           |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Updating a record that was soft-deleted moments earlier     | `404` — `findById`'s `deletedAt: null` filter applies to updates too, not just reads                                                                                        |
| Concurrent updates to the same record from two requests     | Last write wins — no optimistic-locking/version check exists; **not independently verified under true concurrency**, same honestly-flagged gap as elsewhere in this project |
| Setting `managerId` to a _different_, valid Employee's `id` | `200` — no cycle-detection beyond the direct self-reference check (a longer manager cycle, e.g. A→B→A, is **not** currently detected — a known, undemonstrated gap)         |

## 13. Security Testing

- **Mass assignment**: confirm `id`, `deletedAt`, `createdAt`, `updatedAt`
  cannot be client-supplied and honored — same as `POST /employees`.
- **Authorization**: confirm `EMPLOYEE` (which never has `:update:any` or
  any `:update:own`) cannot reach this endpoint at all, for any record
  including their own.
- **BOLA**: not applicable in the ownership sense (`:update:any` doesn't
  distinguish records) — but confirm a `MANAGER` genuinely can update
  _any_ employee, since that's the seeded design, not an oversight.

## 14. Database Impact

- **Tables affected**: `Employee` (update), `AuditLog` (insert, as of
  Feature 11).
- **Rows updated**: exactly 1 `Employee` row; exactly 1 `AuditLog` row
  inserted (`action: 'UPDATE'`), on success.
- **Transactions**: **as of Feature 11**, the `Employee` update and the
  `AuditLog` insert happen inside one `prisma.$transaction` — the audit
  entry's `beforeData` is the record as fetched just before the update,
  `afterData` is the record just after.

## 15. Request Lifecycle

```
PATCH /api/v1/employees/:id
    ↓
authMiddleware
    ↓
requirePermission('employee:update:any')
    ↓ (403 if not granted)
validateMiddleware(updateEmployeeSchema)
    ↓ (400 on Zod failure)
employee.controller.update → employee.service.updateEmployee(id, data, { id: req.user.id, ipAddress: req.ip })
    ├─ employeeRepository.findById(id) → not found → 404
    ├─ assertNotSelfManaged(id, data.managerId) → 400 if equal
    └─ prisma.$transaction:
         ├─ employeeRepository.update(id, data, tx)
         └─ auditLogRepository.create({ action: 'UPDATE', beforeData, afterData, ... }, tx)
    ↓
200 { employee }
```

## 16. Performance Notes

Same profile as `GET /employees/:id` plus one additional `UPDATE`
statement and, **as of Feature 11**, one `AuditLog` insert in the same
transaction — no notable performance concerns at this scale.

## 17. Interview Notes

**Q: Why is `managerId === id` checked in the service instead of the Zod
schema?** The schema validates the _shape_ of a single field in
isolation; this check compares the payload's `managerId` against the
_path parameter_ `id`, which the schema has no access to — cross-field
(and cross-parameter) business rules belong in the service layer, not the
validation schema, by design (see `CLAUDE.md`'s layering rules).

## 18. cURL Examples

```bash
curl -i -X PATCH http://localhost:3000/api/v1/employees/$EMPLOYEE_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"department":"Platform Engineering","salary":82000}'
```

## 19. Postman Collection Notes

Same `{{accessToken}}`/`{{employeeId}}` variables as the other Employee
endpoints.

## 20. Testing Checklist

- ✅ Valid partial update (single field, multiple fields, empty body)
- ✅ `400` on self-management (`managerId = id`)
- ✅ `404` on nonexistent/soft-deleted record
- ✅ `403` as `EMPLOYEE`, `401` with no token
- ✅ Only `updatedAt` changes among timestamps
- ✅ No sensitive data leaked

---

---

# 13. `DELETE /employees/:id`

## 1. Endpoint Information

```
Feature:            Employee CRUD (Feature 9, Stage B)
Endpoint:           Delete Employee (soft delete)
Description:        Marks an Employee record as deleted without removing the row
Method:             DELETE
URL:                /api/v1/employees/:id
API Version:        v1
Module:             modules/employees
Authentication:     Yes (Bearer access token)
Authorization:      `employee:delete:any` permission required (ADMIN, MANAGER as seeded)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: removes an employee from active views (lists,
  lookups) while preserving the historical row — HR data is a classic
  case where hard-deleting is undesirable (audit trail, payroll history).
- **Business problem solved**: offboarding, or correcting an
  accidentally-created record, without losing the record entirely.
- **Expected callers**: `ADMIN`/`MANAGER` only.

## 3. Request Headers

| Header                                | Required | Notes                                                |
| ------------------------------------- | -------- | ---------------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to the `employee:delete:any` permission |

## 4. Path Parameters

| Name | Type          | Required | Description              | Example                                |
| ---- | ------------- | -------- | ------------------------ | -------------------------------------- |
| `id` | string (UUID) | **Yes**  | The Employee record's id | `954690da-d433-4b7e-9e04-1c7be03c36bd` |

## 5. Query Parameters

None.

## 6. Request Body

None.

## 7. Validation Rules

No body to validate — only the permission check and the record's
existence (via the same `findById`, `deletedAt: null`-filtered lookup
used everywhere else).

## 8. Successful Response

```
200 OK

{
  "message": "Employee deleted successfully"
}
```

The response deliberately does **not** echo the deleted record — there is
nothing further the caller needs from it, and this keeps the response
shape simple and consistent.

## 9. Error Responses

| Status | Reason                                  | Response (`message`)                                  | When                                                                                                                                                                                   |
| ------ | --------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401`  | No/invalid/expired access token         | Same as every other protected endpoint                | `authMiddleware` failure                                                                                                                                                               |
| `403`  | Roles don't grant `employee:delete:any` | `"You do not have permission to perform this action"` | Any `EMPLOYEE`                                                                                                                                                                         |
| `404`  | No such record, already soft-deleted    | `"Employee not found"`                                | Invalid/nonexistent/**already-deleted** `id` — **not** `409`, verified live: calling `DELETE` twice on the same `id` returns `404` both times after the first call, not `409 Conflict` |

## 10. Postman Test Cases

| #   | Case                                                          | Expected                                                                |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Valid delete                                                  | `200`                                                                   |
| 2   | Same `id` again (already deleted)                             | `404`, not `409`                                                        |
| 3   | Nonexistent `id`                                              | `404`                                                                   |
| 4   | As `EMPLOYEE` token                                           | `403`                                                                   |
| 5   | No token                                                      | `401`                                                                   |
| 6   | `GET /employees/:id` on the same `id` right after deleting it | `404` — soft-deleted records disappear from every read path immediately |

## 11. Negative Testing

| Scenario                                            | Expected                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Malformed (non-UUID) `id`                           | `404` — same as every other endpoint taking `id` in the path                            |
| Tampered/expired JWT                                | `401`                                                                                   |
| Wrong method (`GET` with delete semantics expected) | Routed to the actual `GET` handler instead — confirm the right handler serves each verb |

## 12. Edge Cases

| Scenario                                                                 | Expected Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deleting a record that has other Employees reporting to it (`managerId`) | The direct reports are **not** cascade-deleted — the `Employee.managerId` FK is `ON DELETE SET NULL`, but that only fires on a real row deletion, not a soft delete (an `UPDATE ... SET deletedAt = now()`), so reports still show the now-soft-deleted manager's `id` until manually reassigned. **A real, undemonstrated-until-writing-this-doc gap**: soft delete does not clean up `managerId` references the way a hard delete's `SET NULL` would. |
| Concurrent delete requests for the same `id`                             | One succeeds (`200`), the other should see `404` (already gone from the `deletedAt: null`-filtered lookup) — **not independently verified under true concurrency**                                                                                                                                                                                                                                                                                      |
| Restoring a soft-deleted record                                          | **No endpoint exists for this** — only a direct database update (`deletedAt: null`) can restore one today, per the Known Gaps section                                                                                                                                                                                                                                                                                                                   |

## 13. Security Testing

- **Authorization**: confirm `EMPLOYEE` cannot delete any record,
  including their own (there is no `:delete:own` permission at all — only
  `ADMIN`/`MANAGER` can delete, matching the confirmed authorization
  matrix).
- **Idempotency under retry**: confirm a client that retries a `DELETE`
  after a network timeout (not knowing if the first attempt succeeded)
  gets a safe, non-destructive `404` on the second attempt rather than an
  error that implies something went wrong.
- **Mass assignment**: N/A — no request body.

## 14. Database Impact

- **Tables affected**: `Employee` (update — `deletedAt` set, row not
  removed), `AuditLog` (insert, as of Feature 11).
- **Rows updated**: exactly 1 `Employee` row, on success. **Zero rows
  deleted** — this is the entire point of a soft delete. Exactly 1
  `AuditLog` row inserted (`action: 'DELETE'`, `beforeData` the
  pre-delete record, `afterData: null`).
- **Transactions**: **as of Feature 11**, the `Employee` update and the
  `AuditLog` insert happen inside one `prisma.$transaction`.
- **Cascade/rollback behavior**: **does not** trigger the `managerId`
  `ON DELETE SET NULL` FK rule — see the Edge Cases finding above. That
  rule only fires on an actual `DELETE` statement, which this endpoint
  never issues.

## 15. Request Lifecycle

```
DELETE /api/v1/employees/:id
    ↓
authMiddleware
    ↓
requirePermission('employee:delete:any')
    ↓ (403 if not granted)
employee.controller.remove → employee.service.softDeleteEmployee(id, { id: req.user.id, ipAddress: req.ip })
    ├─ employeeRepository.findById(id) → not found → 404
    └─ prisma.$transaction:
         ├─ employeeRepository.softDelete(id, tx)   [UPDATE ... SET deletedAt = now()]
         └─ auditLogRepository.create({ action: 'DELETE', beforeData, afterData: null, ... }, tx)
    ↓
200 { message: "Employee deleted successfully" }
```

## 16. Performance Notes

Single indexed lookup plus single indexed update, plus, **as of Feature
11**, one `AuditLog` insert in the same transaction — no notable
performance concerns at this scale.

## 17. Interview Notes

- **Q: Why soft delete instead of a real `DELETE`?** HR data has an
  audit/history expectation that a hard delete would violate — see the
  Feature 9 planning doc's Purpose section. It also mirrors the
  `RefreshToken.revoked` pattern already established in Feature 7 ("flag,
  don't erase").
- **Q: What's the tradeoff of soft delete you found while building this?**
  Foreign-key `ON DELETE` rules (like `managerId`'s `SET NULL`) only fire
  on real deletes — a soft delete is just an `UPDATE`, so any FK-driven
  cleanup you'd get "for free" from a hard delete has to be handled
  explicitly instead. This project does **not** yet handle it (see Edge
  Cases) — a good concrete example of soft delete's cost, not just its
  benefit.

## 18. cURL Examples

```bash
curl -i -X DELETE http://localhost:3000/api/v1/employees/$EMPLOYEE_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 19. Postman Collection Notes

Run this **last** in any test sequence involving a given `{{employeeId}}`
— every other Employee endpoint stops finding the record afterward.

## 20. Testing Checklist

- ✅ Valid delete → `200`
- ✅ Second delete on the same `id` → `404`, not `409`
- ✅ `GET`/`PATCH` on the same `id` after deletion → `404`
- ✅ `403` as `EMPLOYEE`, `401` with no token
- ✅ Confirmed: soft delete does **not** clean up dependent `managerId`
  references (documented gap, not silently ignored)
- ✅ No sensitive data leaked

---

---

# 14. `POST /users/me/profile-picture`

## 1. Endpoint Information

```
Feature:            File Uploads (Feature 12)
Endpoint:           Upload/Replace Profile Picture
Description:        Uploads a new avatar for the authenticated user, replacing any existing one
Method:             POST
URL:                /api/v1/users/me/profile-picture
API Version:        v1
Module:             modules/users
Authentication:     Yes (Bearer access token)
Authorization:      None beyond authentication — always operates on the caller's own record
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: lets any user set/change their own avatar — a
  self-service action, unlike Employee HR data.
- **Business problem solved**: profile personalization.
- **Expected callers**: any authenticated user, for themselves only —
  there is no way to set another user's picture via this API.

## 3. Request Headers

| Header                                | Required | Notes                                                     |
| ------------------------------------- | -------- | --------------------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Identifies whose picture is being set — always the caller |
| `Content-Type: multipart/form-data`   | **Yes**  | Set automatically by any HTTP client sending a file field |

## 4. Path Parameters

None — always operates on `req.user.id`, never a client-supplied id.

## 5. Query Parameters

None.

## 6. Request Body

`multipart/form-data` with a single field:

| Field  | Type | Required | Notes                                            |
| ------ | ---- | -------- | ------------------------------------------------ |
| `file` | file | **Yes**  | The image to upload — see Validation Rules below |

## 7. Validation Rules

- **File presence**: Multer does not reject a request with no file field
  on its own — an explicit `if (!req.file)` check in the service throws
  `400 "A file is required"`.
- **MIME type whitelist**: `image/jpeg`, `image/png`, `image/webp` only —
  enforced by Multer's `fileFilter`, which rejects with our own
  `BadRequestError` directly (a specific message naming the received
  type), not Multer's generic `LIMIT_UNEXPECTED_FILE`.
- **Size limit**: 5 MB, enforced by Multer's `limits.fileSize` — aborts
  mid-stream, not after buffering the full file.

## 8. Successful Response

```
200 OK

{
  "user": {
    "id": "283a2b17-b05d-49aa-8915-d58c5658f2bb",
    "email": "docs-example@example.com",
    "name": "Docs Example",
    "profileImageUrl": "https://res.cloudinary.com/dhfxv7gdp/image/upload/v1783253883/emp-mgmt/development/users/283a2b17-b05d-49aa-8915-d58c5658f2bb/profile-picture.png",
    "profileImagePublicId": "emp-mgmt/development/users/283a2b17-b05d-49aa-8915-d58c5658f2bb/profile-picture",
    "createdAt": "2026-07-05T04:41:20.891Z",
    "updatedAt": "2026-07-05T12:18:04.579Z",
    "roles": ["EMPLOYEE"]
  }
}
```

| Field                       | Description                                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user.profileImageUrl`      | Cloudinary's delivery URL. Includes a version segment (`v1783253883`) that changes on every replacement — cache-busted via `invalidate: true` (see Interview Notes).         |
| `user.profileImagePublicId` | **Fixed and deterministic** — `emp-mgmt/{env}/users/{userId}/profile-picture`, identical across every upload for this user, verified live across 3 consecutive replacements. |

## 9. Error Responses

| Status | Reason                          | Response (`message`)                                                         | When                                                                                                     |
| ------ | ------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `400`  | No file provided                | `"A file is required"`                                                       | `file` field missing entirely                                                                            |
| `400`  | Invalid MIME type               | `"file: must be one of image/jpeg, image/png, image/webp (received <type>)"` | Wrong file type                                                                                          |
| `400`  | File too large                  | `"File exceeds the maximum allowed size"`                                    | File over 5 MB                                                                                           |
| `401`  | No/invalid/expired access token | Same as every other protected endpoint                                       | `authMiddleware` failure                                                                                 |
| `500`  | Cloudinary upload failure       | Generic `"Internal Server Error"`, logged server-side with context           | Cloudinary outage/credential failure — verified: no `User`/`AuditLog` row is created for a failed upload |

## 10. Postman Test Cases

| #   | Case                        | Expected                                     |
| --- | --------------------------- | -------------------------------------------- |
| 1   | Valid image upload          | `200`, `profileImageUrl` populated           |
| 2   | Replace an existing picture | `200`, same `profileImagePublicId` as before |
| 3   | Invalid MIME type           | `400`                                        |
| 4   | Oversized file (> 5 MB)     | `400`                                        |
| 5   | No file field               | `400`                                        |
| 6   | No token                    | `401`                                        |

## 11. Negative Testing

| Scenario                                                 | Expected                                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| SQL/NoSQL injection attempt in the filename              | Irrelevant — the filename is never stored for profile pictures, and the `public_id` is always server-generated |
| Attempting to target another user via a body/query param | No effect — there is no `userId` parameter anywhere on this route; it always operates on `req.user.id`         |
| Malformed multipart body                                 | `400` (Multer/Busboy parsing failure surfaces as a generic request error)                                      |
| Tampered/expired JWT                                     | `401`                                                                                                          |

## 12. Edge Cases

| Scenario                                                      | Expected Behavior                                                                                                                                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Replacing the picture 3 times in a row                        | Exactly one asset ever exists at the fixed `public_id` — verified live, no accumulation, no orphaned intermediate uploads.                                                                                                     |
| Cloudinary upload succeeds but the database transaction fails | The new image is live at Cloudinary; the database briefly shows the previous version's URL until retried — a documented, accepted residual inconsistency (see the planning doc's Cloudinary Consistency Model), not data loss. |
| Concurrent replacement requests for the same user             | Last-write-wins; not independently verified under true concurrency — an honestly-documented limitation, same treatment as other concurrency caveats in this project.                                                           |

## 13. Security Testing

- **Authentication**: the only real gate on this endpoint — confirm `401`
  with no/invalid token.
- **No authorization/permission check by design**: confirm there is no
  way to reach any `userId` other than the caller's own — there's no
  parameter that could even be manipulated (BOLA is structurally
  impossible here, not just permission-gated).
- **File-type/size enforcement**: confirmed via the whitelist and size
  cap; magic-byte sniffing is **not** performed — an honestly-documented
  gap (see the Global Reference's Known Gaps).
- **Sensitive data exposure**: confirm the `AuditLog` entry this endpoint
  creates never contains a `password` field — the one non-negotiable
  check for this feature, verified live across every replacement.

## 14. Database Impact

- **Tables affected**: `User` (update — two columns), `AuditLog` (insert).
- **Transactions**: the `User` update and the `AuditLog` insert commit
  together in one `prisma.$transaction`. The Cloudinary upload happens
  **before** this transaction (not inside it — Cloudinary can't
  participate in a Postgres transaction); if the upload fails, nothing
  in the database is touched.
- **Cascade/rollback behavior**: N/A — no cascading writes.

## 15. Request Lifecycle

```
POST /api/v1/users/me/profile-picture
    ↓
authMiddleware
    ↓
uploadProfilePicture.single('file')   [Multer, memory storage]
    ↓ (400 on MIME rejection via fileFilter, or MulterError → 400 via error.middleware.js)
user.controller.uploadProfilePicture
    ↓
user.service.uploadProfilePicture(userId, file, actor)
    ├─ !file → 400 "A file is required"
    ├─ userRepository.findById(userId)   [captures beforeData for the audit entry]
    ├─ cloudinaryStorage.uploadBuffer(file.buffer, { publicId: fixed, overwrite: true, invalidate: true })
    └─ prisma.$transaction:
         ├─ userRepository.updateProfileImage(userId, { url, publicId }, tx)
         └─ auditLogRepository.create({ entityType: 'User', action: 'UPDATE', beforeData: sanitizeUser(...), afterData: sanitizeUser(...) }, tx)
    ↓
200 { user }
```

## 16. Performance Notes

- Request latency is directly coupled to Cloudinary's own upload latency
  — a deliberate, documented trade-off of server-mediated uploads (see
  the planning doc).
- The fixed `public_id` + `overwrite`/`invalidate` design means no
  separate "find and delete the old asset" round-trip is needed for this
  flow at all — one upload call handles the replacement.

## 17. Interview Notes

- **Q: Why a fixed `public_id` instead of a fresh one per upload?**
  A `User` has exactly one avatar — `overwrite: true` on a deterministic
  path replaces it in place at Cloudinary, removing an entire class of
  "find and delete the old asset" failure mode that a fresh-id-per-upload
  design would need to handle explicitly.
- **Q: Why does `profileImageUrl` change on every upload even though
  `public_id` doesn't?** Cloudinary increments an internal version
  segment in the delivery URL on every `overwrite`, specifically so CDNs
  don't keep serving stale cached content — `invalidate: true` actively
  busts that cache too. **This was verified live, not assumed**: an
  earlier version of this endpoint's delete flow omitted `invalidate`,
  and a deleted asset's URL kept returning `200` from the CDN for a
  period after the origin copy was already gone (confirmed via
  Cloudinary's Admin API) — fixed by adding `invalidate: true`
  everywhere a Cloudinary asset is removed, not just on upload.

## 18. cURL Examples

```bash
curl -i -X POST http://localhost:3000/api/v1/users/me/profile-picture \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@/path/to/avatar.png"
```

## 19. Postman Collection Notes

Use Postman's `form-data` body type with a `file`-type field named
`file`. No environment variables needed beyond `{{accessToken}}`.

## 20. Testing Checklist

- ✅ Valid upload, replacement (same `public_id`, new versioned URL)
- ✅ `400` on invalid MIME type, oversized file, missing file field
- ✅ `401` with no token
- ✅ Real Cloudinary asset confirmed present after upload (not just a
  non-error response)
- ✅ `AuditLog` entry created, `entityType: 'User'`, **no `password`
  field anywhere in `beforeData`/`afterData`**
- ✅ No sensitive data leaked

---

---

# 15. `DELETE /users/me/profile-picture`

## 1. Endpoint Information

```
Feature:            File Uploads (Feature 12)
Endpoint:           Delete Profile Picture
Description:        Removes the authenticated user's avatar
Method:             DELETE
URL:                /api/v1/users/me/profile-picture
API Version:        v1
Module:             modules/users
Authentication:     Yes (Bearer access token)
Authorization:      None beyond authentication — always operates on the caller's own record
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: lets a user remove their avatar entirely, reverting
  to no picture.
- **Expected callers**: any authenticated user, for themselves only.

## 3. Request Headers

| Header                                | Required | Notes                 |
| ------------------------------------- | -------- | --------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Identifies the caller |

## 4. Path Parameters

None.

## 5. Query Parameters

None.

## 6. Request Body

None.

## 7. Validation Rules

No body to validate — only the existence check described below.

## 8. Successful Response

```
200 OK

{
  "user": {
    "id": "283a2b17-b05d-49aa-8915-d58c5658f2bb",
    "email": "docs-example@example.com",
    "name": "Docs Example",
    "profileImageUrl": null,
    "profileImagePublicId": null,
    "createdAt": "2026-07-05T04:41:20.891Z",
    "updatedAt": "2026-07-05T12:20:05.674Z",
    "roles": ["EMPLOYEE"]
  }
}
```

## 9. Error Responses

| Status | Reason                           | Response (`message`)                   | When                                     |
| ------ | -------------------------------- | -------------------------------------- | ---------------------------------------- |
| `401`  | No/invalid/expired access token  | Same as every other protected endpoint | `authMiddleware` failure                 |
| `404`  | No profile picture currently set | `"No profile picture to delete"`       | `profileImagePublicId` is already `null` |

## 10. Postman Test Cases

| #   | Case                       | Expected |
| --- | -------------------------- | -------- |
| 1   | Delete an existing picture | `200`    |
| 2   | Delete again (nothing set) | `404`    |
| 3   | No token                   | `401`    |

## 11. Negative Testing

Same category as every other endpoint taking no body: tampered/expired
JWT → `401`; wrong method/URL → `404`/routed elsewhere.

## 12. Edge Cases

| Scenario                                                         | Expected Behavior                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Delete succeeds in the database but the Cloudinary cleanup fails | The client still gets `200` — the database (source of truth for "does this user have a picture") is already consistent; the orphaned Cloudinary asset is logged at `warn` level, not surfaced to the client. |
| Immediately re-fetching the old `profileImageUrl` after deletion | `404` from Cloudinary's CDN, confirmed live — requires `invalidate: true` on the delete call, not just the origin delete (see Interview Notes on the sibling upload endpoint).                               |

## 13. Security Testing

- **Authentication**: the only gate — confirm `401` with no/invalid token.
- **No BOLA risk**: structurally impossible, same reasoning as the
  upload endpoint — no parameter identifies a target user.
- **Idempotency under retry**: a client retrying after a timeout gets a
  safe `404` on the second attempt, not an error implying something went
  wrong.

## 14. Database Impact

- **Tables affected**: `User` (update — nulls two columns), `AuditLog`
  (insert).
- **Transactions**: the `User` update and `AuditLog` insert commit
  together first; the Cloudinary delete happens **after**, best-effort —
  a failure there is logged, not thrown, and does not fail the request.

## 15. Request Lifecycle

```
DELETE /api/v1/users/me/profile-picture
    ↓
authMiddleware
    ↓
user.controller.deleteProfilePicture
    ↓
user.service.deleteProfilePicture(userId, actor)
    ├─ userRepository.findById(userId) → no profileImagePublicId → 404
    ├─ prisma.$transaction:
    │    ├─ userRepository.clearProfileImage(userId, tx)
    │    └─ auditLogRepository.create({ entityType: 'User', action: 'UPDATE', ... }, tx)
    └─ cloudinaryStorage.deleteAsset(publicId, 'image', context)   [after commit, best-effort]
    ↓
200 { user }
```

## 16. Performance Notes

Single indexed lookup, single update, one best-effort external call after
the response-determining work is already done — no notable performance
concerns.

## 17. Interview Notes

**Q: Why does the database transaction commit _before_ the Cloudinary
delete, rather than after?** The database is this API's source of truth
for "does this user have a profile picture." Committing the DB change
first means the client's `200` response is honest the moment it's sent;
the Cloudinary delete is cleanup of now-unreferenced storage, not
something the response needs to wait on. If the order were reversed and
the DB write failed after a successful Cloudinary delete, the database
would still point at an asset that no longer exists — a user-visible
broken image, not just a harmless orphan.

## 18. cURL Examples

```bash
curl -i -X DELETE http://localhost:3000/api/v1/users/me/profile-picture \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## 19. Postman Collection Notes

No special setup beyond `{{accessToken}}`.

## 20. Testing Checklist

- ✅ Delete an existing picture → `200`
- ✅ Delete again → `404`
- ✅ `401` with no token
- ✅ Real Cloudinary asset confirmed gone (via CDN fetch, not just a
  non-error response) — required adding `invalidate: true`, a real fix
  found during this feature's own verification
- ✅ No sensitive data leaked

---

---

# 16. `POST /employees/:id/documents`

## 1. Endpoint Information

```
Feature:            File Uploads (Feature 12)
Endpoint:           Upload Employee Document
Description:        Uploads a document (resume, ID proof, contract, certificate) attached to an Employee record
Method:             POST
URL:                /api/v1/employees/:id/documents
API Version:        v1
Module:             modules/employees
Authentication:     Yes (Bearer access token)
Authorization:      `employee:update:any` permission required (ADMIN, MANAGER as seeded)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: attaches HR documents to an Employee record — a
  genuine one-to-many, unlike the single-slot profile picture.
- **Expected callers**: `ADMIN`/`MANAGER` only — no self-service upload
  path for the employee themselves, consistent with Feature 9's decision
  that `EMPLOYEE` never gets a write path to their own HR record.

## 3. Request Headers

| Header                                | Required | Notes                                                |
| ------------------------------------- | -------- | ---------------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to the `employee:update:any` permission |
| `Content-Type: multipart/form-data`   | **Yes**  | Set automatically by any HTTP client sending a file  |

## 4. Path Parameters

| Name | Type          | Required | Description              | Example                                |
| ---- | ------------- | -------- | ------------------------ | -------------------------------------- |
| `id` | string (UUID) | **Yes**  | The Employee record's id | `ecb69110-8183-4769-a98b-8b0f69bf2f6a` |

## 5. Query Parameters

None.

## 6. Request Body

`multipart/form-data` with a single field:

| Field  | Type | Required | Notes                               |
| ------ | ---- | -------- | ----------------------------------- |
| `file` | file | **Yes**  | The document — see Validation Rules |

## 7. Validation Rules

- **File presence**: same explicit `!file` check as the profile-picture
  endpoint — `400 "A file is required"` if the field is missing.
- **MIME type whitelist**: `application/pdf`, `image/jpeg`, `image/png`,
  `image/webp`.
- **Size limit**: 10 MB.
- **Employee existence**: the target employee must exist and not be
  soft-deleted — checked **before** any Cloudinary call, so an invalid
  `id` never wastes upload quota on a request that's going to be
  rejected anyway.

## 8. Successful Response

```
201 Created

{
  "document": {
    "id": "0279b82f-16da-4de3-9d46-91efd07fcbd6",
    "employeeId": "ecb69110-8183-4769-a98b-8b0f69bf2f6a",
    "url": "https://res.cloudinary.com/dhfxv7gdp/raw/upload/v1783254636/emp-mgmt/development/employees/ecb69110-8183-4769-a98b-8b0f69bf2f6a/documents/4f0a2ca2-194d-4b71-9a76-24286153f357",
    "publicId": "emp-mgmt/development/employees/ecb69110-8183-4769-a98b-8b0f69bf2f6a/documents/4f0a2ca2-194d-4b71-9a76-24286153f357",
    "resourceType": "raw",
    "fileName": "resume.pdf",
    "mimeType": "application/pdf",
    "size": 500,
    "uploadedBy": "e1b07e0b-3c8d-4f7d-aa1f-fffec7648b21",
    "createdAt": "2026-07-05T12:30:37.008Z"
  }
}
```

| Field                   | Description                                                                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document.publicId`     | A fresh, server-generated UUID per document (`crypto.randomUUID()`) — **never** derived from the original filename, which closes off any path-traversal-style concern on the Cloudinary side.                                                                        |
| `document.resourceType` | Cloudinary's **own** classification of the upload (from its response, not guessed from `mimeType`) — a PDF becomes `"raw"`; a genuine image stays `"image"`. Required later to actually delete the correct asset (see Interview Notes — a real bug was caught here). |
| `document.fileName`     | The original filename, stored for display only — never used to build a storage path.                                                                                                                                                                                 |
| `document.uploadedBy`   | The uploading `ADMIN`/`MANAGER`'s user id.                                                                                                                                                                                                                           |

## 9. Error Responses

| Status | Reason                                  | Response (`message`)                                                                          | When                                                                          |
| ------ | --------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `400`  | No file provided                        | `"A file is required"`                                                                        | `file` field missing                                                          |
| `400`  | Invalid MIME type                       | `"file: must be one of application/pdf, image/jpeg, image/png, image/webp (received <type>)"` | Wrong file type                                                               |
| `400`  | File too large                          | `"File exceeds the maximum allowed size"`                                                     | File over 10 MB                                                               |
| `401`  | No/invalid/expired access token         | Same as every other protected endpoint                                                        | `authMiddleware` failure                                                      |
| `403`  | Roles don't grant `employee:update:any` | `"You do not have permission to perform this action"`                                         | Authenticated as plain `EMPLOYEE`                                             |
| `404`  | Nonexistent/soft-deleted employee       | `"Employee not found"`                                                                        | Invalid `id`, checked before any Cloudinary call                              |
| `500`  | Cloudinary upload failure               | Generic `"Internal Server Error"`, logged server-side with context                            | Verified: no `EmployeeDocument`/`AuditLog` row is created for a failed upload |

## 10. Postman Test Cases

| #   | Case                            | Expected                                                                           |
| --- | ------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Valid PDF upload                | `201`                                                                              |
| 2   | Valid image upload              | `201`                                                                              |
| 3   | Upload the identical file twice | `201` both times — two separate rows, no dedup logic (a deliberate, tested choice) |
| 4   | Invalid file type (e.g. `.exe`) | `400`                                                                              |
| 5   | Oversized file (> 10 MB)        | `400`                                                                              |
| 6   | As `EMPLOYEE` token             | `403`                                                                              |
| 7   | Nonexistent employee `id`       | `404`                                                                              |
| 8   | No token                        | `401`                                                                              |

## 11. Negative Testing

| Scenario                                                       | Expected                                                                                                                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL injection attempt in the filename                          | Stored as a literal string in `fileName` only — never interpolated into a query or a Cloudinary path                                                                          |
| A crafted filename containing `../` or path-traversal segments | No effect whatsoever — `fileName` is display-only; the storage `publicId` is always a fresh, server-generated UUID                                                            |
| Malformed multipart body                                       | `400`                                                                                                                                                                         |
| Tampered/expired JWT                                           | `401`                                                                                                                                                                         |
| Uploading a PDF containing embedded JavaScript                 | Accepted — PDF content is never sanitized (a known, accepted risk category common to any system accepting PDF uploads, real overengineering to solve at this project's scale) |

## 12. Edge Cases

| Scenario                                                      | Expected Behavior                                                                                                                                                          |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uploading to a soft-deleted employee                          | `404` — same treatment as a nonexistent employee, since soft-deleted records are invisible everywhere.                                                                     |
| Cloudinary upload succeeds but the database transaction fails | An orphaned Cloudinary asset (unreferenced by any `EmployeeDocument` row) — harmless, not automatically reconciled. Verified by code inspection, not live fault injection. |
| Concurrent uploads for the same employee                      | Both succeed independently — documents aren't a single slot, so there's no race to resolve, unlike the profile picture.                                                    |

## 13. Security Testing

- **Authorization**: confirm every non-`employee:update:any` caller is
  rejected, including the employee the document is _about_ (no
  self-service upload path exists).
- **BOLA**: N/A for creation (no existing resource is looked up by
  client-supplied id beyond the employee existence check itself).
- **Path traversal**: closed by construction — `publicId` is always
  `emp-mgmt/{env}/employees/{employeeId}/documents/{uuid}`, built only
  from server-generated values, never the original filename.
- **Mass assignment**: confirm no field beyond `file` (e.g. `id`,
  `uploadedBy`, `resourceType`) can be client-supplied and honored.

## 14. Database Impact

- **Tables affected**: `EmployeeDocument` (insert), `AuditLog` (insert).
- **Transactions**: the `EmployeeDocument` insert and the `AuditLog`
  insert commit together in one `prisma.$transaction`. The Cloudinary
  upload happens **before** this transaction — a failed upload touches
  no database row at all.

## 15. Request Lifecycle

```
POST /api/v1/employees/:id/documents
    ↓
authMiddleware
    ↓
requirePermission('employee:update:any')
    ↓ (403 if not granted)
uploadDocument.single('file')   [Multer, memory storage]
    ↓ (400 on MIME rejection, or MulterError → 400)
employeeDocument.controller.upload
    ↓
employeeDocument.service.uploadDocument(employeeId, file, actor)
    ├─ !file → 400 "A file is required"
    ├─ employeeRepository.findById(employeeId) → not found → 404
    ├─ cloudinaryStorage.uploadBuffer(file.buffer, { publicId: freshUuid, resourceType: 'auto' })
    └─ prisma.$transaction:
         ├─ employeeDocumentRepository.create({ ...file metadata, resourceType }, tx)
         └─ auditLogRepository.create({ entityType: 'EmployeeDocument', action: 'CREATE', ... }, tx)
    ↓
201 { document }
```

## 16. Performance Notes

- Employee-existence check runs before the Cloudinary call, bounding
  wasted upload quota on an invalid `id` to Multer's in-memory buffering
  only (unavoidable — the body must be parsed before business rules can
  run).
- `resourceType: 'auto'` costs Cloudinary a content-inspection step but
  removes any need for us to guess the correct type from `mimeType`
  ourselves — and that Cloudinary-determined value is exactly what's
  needed later to delete the asset correctly (see Interview Notes).

## 17. Interview Notes

- **Q: Why store `resourceType` on the `EmployeeDocument` row instead of
  deriving it from `mimeType` when needed?** Because a real bug was
  found doing exactly that during this feature's own verification:
  `cloudinary.uploader.destroy()` defaults to `resource_type: "image"`
  and **silently no-ops** (`{result: "not found"}`, not a thrown error)
  for any asset of a different type. A PDF uploaded via
  `resourceType: 'auto'` is classified by Cloudinary as `"raw"` — guessing
  `"image"` from `mimeType: application/pdf` would be wrong, and the
  delete call would appear to succeed while never actually removing the
  asset. Storing Cloudinary's own classification at upload time is what
  makes the later delete call reliable.
- **Q: Why UUID-based `public_id`s for documents but a fixed one for the
  profile picture?** Cardinality: a `User` has exactly one avatar (fixed
  slot, safe to overwrite in place); an `Employee` can have arbitrarily
  many documents, so each needs its own unique identity — a fresh UUID
  per upload, never reused, never derived from user input.

## 18. cURL Examples

```bash
curl -i -X POST http://localhost:3000/api/v1/employees/$EMPLOYEE_ID/documents \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@/path/to/resume.pdf"
```

## 19. Postman Collection Notes

Requires `{{accessToken}}` to resolve to `employee:update:any`
(`ADMIN`/`MANAGER`). Use `form-data` with a `file`-type field named
`file`.

## 20. Testing Checklist

- ✅ Valid PDF and image upload → `201`
- ✅ Duplicate file upload allowed (no dedup)
- ✅ `400` on invalid type, oversized file, missing file
- ✅ `403` as `EMPLOYEE`, `404` for nonexistent/soft-deleted employee,
  `401` with no token
- ✅ Real Cloudinary asset confirmed present after upload
- ✅ `resourceType` correctly recorded from Cloudinary's own response
- ✅ `AuditLog` entry created, `entityType: 'EmployeeDocument'`
- ✅ No sensitive data leaked

---

---

# 17. `GET /employees/:id/documents`

## 1. Endpoint Information

```
Feature:            File Uploads (Feature 12)
Endpoint:           List Employee Documents
Description:        Returns every document attached to an Employee record
Method:             GET
URL:                /api/v1/employees/:id/documents
API Version:        v1
Module:             modules/employees
Authentication:     Yes (Bearer access token)
Authorization:      `employee:read:any` OR `employee:read:own` permission
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: lets HR/management review an employee's documents,
  and lets the employee themselves view their own.
- **Expected callers**: `ADMIN`/`MANAGER` for any employee; a plain
  `EMPLOYEE` only for their own record — the same two-layer
  authorization shape as `GET /employees/:id`.

## 3. Request Headers

| Header                                | Required | Notes                                                      |
| ------------------------------------- | -------- | ---------------------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to `employee:read:any` or `employee:read:own` |

## 4. Path Parameters

| Name | Type          | Required | Description              | Example                                |
| ---- | ------------- | -------- | ------------------------ | -------------------------------------- |
| `id` | string (UUID) | **Yes**  | The Employee record's id | `ecb69110-8183-4769-a98b-8b0f69bf2f6a` |

## 5. Query Parameters

None — no pagination/search/filter/sort on this list (a real, honestly
acknowledged gap; unbounded number of documents per employee, same
treatment as Feature 10's deferred pagination on other lists before they
were built out).

## 6. Request Body

None.

## 7. Validation Rules

No body/query to validate. Authorization follows `GET
/employees/:id`'s exact two-layer shape: `requirePermission` gates on
"does the caller have either key at all"; the service then compares
`employee.userId` against the caller's own id if only `:own` was granted.

## 8. Successful Response

```
200 OK

{
  "documents": [
    {
      "id": "0279b82f-16da-4de3-9d46-91efd07fcbd6",
      "employeeId": "ecb69110-8183-4769-a98b-8b0f69bf2f6a",
      "url": "https://res.cloudinary.com/dhfxv7gdp/raw/upload/v1783254636/emp-mgmt/development/employees/ecb69110-8183-4769-a98b-8b0f69bf2f6a/documents/4f0a2ca2-194d-4b71-9a76-24286153f357",
      "publicId": "emp-mgmt/development/employees/ecb69110-8183-4769-a98b-8b0f69bf2f6a/documents/4f0a2ca2-194d-4b71-9a76-24286153f357",
      "resourceType": "raw",
      "fileName": "resume.pdf",
      "mimeType": "application/pdf",
      "size": 500,
      "uploadedBy": "e1b07e0b-3c8d-4f7d-aa1f-fffec7648b21",
      "createdAt": "2026-07-05T12:30:37.008Z"
    }
  ]
}
```

`documents` is ordered newest-first (`createdAt DESC`), scoped to
non-soft-deleted employees only.

## 9. Error Responses

| Status | Reason                                                          | Response (`message`)                                        | When                               |
| ------ | --------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------- |
| `401`  | No/invalid/expired access token                                 | Same as every other protected endpoint                      | `authMiddleware` failure           |
| `403`  | Roles grant neither `employee:read:any` nor `employee:read:own` | `"You do not have permission to perform this action"`       | No relevant permission at all      |
| `403`  | Caller only has `employee:read:own`, and it isn't their record  | `"You do not have permission to view this employee record"` | Different, record-specific message |
| `404`  | Nonexistent/soft-deleted employee                               | `"Employee not found"`                                      | Invalid `id`                       |

## 10. Postman Test Cases

| #   | Case                            | Expected |
| --- | ------------------------------- | -------- |
| 1   | `ADMIN`/`MANAGER`, any employee | `200`    |
| 2   | Owning `EMPLOYEE`               | `200`    |
| 3   | A _different_ `EMPLOYEE`        | `403`    |
| 4   | Nonexistent employee `id`       | `404`    |
| 5   | No token                        | `401`    |

## 11. Negative Testing

Same category as `GET /employees/:id`: malformed/non-UUID `id` → `404`
(no `500`); tampered JWT → `401`; wrong method → `404`.

## 12. Edge Cases

| Scenario                                                                                    | Expected Behavior                                                                                     |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Employee with zero documents                                                                | `200`, `{ "documents": [] }` — not an error                                                           |
| A document whose Cloudinary asset was orphaned (DB row exists, Cloudinary delete never ran) | Still listed normally — this endpoint only reads the database, never verifies against Cloudinary live |

## 13. Security Testing

- **BOLA**: the primary test here, identical in shape to `GET
/employees/:id` — confirm an `employee:read:own`-only caller cannot
  list a _different_ employee's documents by id.
- **Sensitive data exposure**: document URLs may point to sensitive HR
  documents (ID proof, contracts) — confirm the permission gate is the
  only thing standing between a caller and this list, and that it's
  enforced correctly on every test.

## 14. Database Impact

- **Tables affected**: `EmployeeDocument` (read), `Employee` (read, for
  the existence/ownership check).
- **Rows affected**: none inserted/updated/deleted.

## 15. Request Lifecycle

```
GET /api/v1/employees/:id/documents
    ↓
authMiddleware
    ↓
requirePermission('employee:read:any', 'employee:read:own')
    ↓ (403 if neither granted)
employeeDocument.controller.list
    ↓
employeeDocument.service.listDocuments(employeeId, { id: req.user.id, grantedPermissions })
    ├─ employeeRepository.findById(employeeId) → not found → 404
    ├─ grantedPermissions includes 'employee:read:any'? → skip ownership check
    ├─ else: employee.userId !== requester.id → 403
    └─ employeeDocumentRepository.findAllByEmployeeId(employeeId)
    ↓
200 { documents: [...] }
```

## 16. Performance Notes

Unfiltered `SELECT ... WHERE employeeId = ? AND employee.deletedAt IS
NULL`, indexed on `employeeId` — fine at this feature's current, small
per-employee document counts; pagination is a natural future addition if
that ever changes, not built now.

## 17. Interview Notes

**Q: Why does this list have no pagination when `GET /employees` does
(since Feature 10)?** Document counts per employee are expected to stay
small (a handful of HR documents, not thousands) — pagination here would
be solving a problem that doesn't exist yet. Documented as a deliberate,
honestly-acknowledged simplification, not an oversight, the same
treatment `GET /employees` itself received before Feature 10 closed that
gap for a workload that actually needed it.

## 18. cURL Examples

```bash
curl -i http://localhost:3000/api/v1/employees/$EMPLOYEE_ID/documents \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 19. Postman Collection Notes

Needs both an `{{adminAccessToken}}` and an `{{employeeAccessToken}}`
(belonging to the target employee's linked user) to exercise both
authorization paths, same as `GET /employees/:id`.

## 20. Testing Checklist

- ✅ `200` as `ADMIN`/`MANAGER` for any employee
- ✅ `200` as the owning `EMPLOYEE`, `403` as a different `EMPLOYEE`
- ✅ `404` for nonexistent/soft-deleted employee
- ✅ `401` with no token
- ✅ Empty array (not an error) when no documents exist
- ✅ No sensitive data leaked beyond intended fields

---

---

# 18. `DELETE /employees/:id/documents/:documentId`

## 1. Endpoint Information

```
Feature:            File Uploads (Feature 12)
Endpoint:           Delete Employee Document
Description:        Permanently removes a document from an Employee record
Method:             DELETE
URL:                /api/v1/employees/:id/documents/:documentId
API Version:        v1
Module:             modules/employees
Authentication:     Yes (Bearer access token)
Authorization:      `employee:update:any` permission required (ADMIN, MANAGER as seeded)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: removes an incorrectly-uploaded or no-longer-needed
  document.
- **Expected callers**: `ADMIN`/`MANAGER` only — same as upload.

## 3. Request Headers

| Header                                | Required | Notes                                                |
| ------------------------------------- | -------- | ---------------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to the `employee:update:any` permission |

## 4. Path Parameters

| Name         | Type          | Required | Description              | Example                                |
| ------------ | ------------- | -------- | ------------------------ | -------------------------------------- |
| `id`         | string (UUID) | **Yes**  | The Employee record's id | `ecb69110-8183-4769-a98b-8b0f69bf2f6a` |
| `documentId` | string (UUID) | **Yes**  | The document's id        | `0279b82f-16da-4de3-9d46-91efd07fcbd6` |

## 5. Query Parameters

None.

## 6. Request Body

None.

## 7. Validation Rules

No body to validate — only the employee and document existence checks
described in the Request Lifecycle below. A `documentId` that exists but
belongs to a _different_ employee is treated identically to a
nonexistent one (`404`), since the repository's lookup is always scoped
to `(documentId, employeeId)` together.

## 8. Successful Response

```
200 OK

{
  "message": "Document deleted successfully"
}
```

Deliberately doesn't echo the deleted document — nothing further the
caller needs, same convention as `DELETE /employees/:id`.

## 9. Error Responses

| Status | Reason                                                   | Response (`message`)                                  | When                                                                 |
| ------ | -------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| `401`  | No/invalid/expired access token                          | Same as every other protected endpoint                | `authMiddleware` failure                                             |
| `403`  | Roles don't grant `employee:update:any`                  | `"You do not have permission to perform this action"` | Any `EMPLOYEE`                                                       |
| `404`  | Nonexistent/soft-deleted employee                        | `"Employee not found"`                                | Invalid `id`                                                         |
| `404`  | Nonexistent document, or belongs to a different employee | `"Document not found"`                                | Invalid `documentId`, or a real document id under the wrong employee |

## 10. Postman Test Cases

| #   | Case                               | Expected         |
| --- | ---------------------------------- | ---------------- |
| 1   | Valid delete                       | `200`            |
| 2   | Delete the same `documentId` again | `404`, not `409` |
| 3   | Nonexistent `documentId`           | `404`            |
| 4   | Nonexistent employee `id`          | `404`            |
| 5   | As `EMPLOYEE` token                | `403`            |
| 6   | No token                           | `401`            |

## 11. Negative Testing

Same category as `DELETE /employees/:id`: malformed/non-UUID ids → `404`;
tampered JWT → `401`; wrong method → `404`.

## 12. Edge Cases

| Scenario                                                            | Expected Behavior                                                                                                                                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /employees/:id/documents` immediately after deleting one       | The deleted document no longer appears — hard delete, not soft (the `AuditLog`'s `beforeData` already preserves its historical metadata, making a parallel soft-delete on `EmployeeDocument` redundant).                              |
| Database delete succeeds but the Cloudinary cleanup fails afterward | The client still gets `200`; the orphaned Cloudinary asset is logged, not surfaced — the database is already consistent by the time the response is sent.                                                                             |
| Re-fetching the deleted document's URL immediately after deletion   | `404` from Cloudinary's CDN, confirmed live — requires both the correct `resource_type` on the delete call **and** `invalidate: true` (see Interview Notes — two real bugs, both found and fixed during this feature's verification). |

## 13. Security Testing

- **Authorization**: confirm `EMPLOYEE` cannot delete any document,
  including one attached to their own record — there is no
  `employee:update:own` permission at all (Feature 9's decision).
- **Idempotency under retry**: a retried `DELETE` after a timeout gets a
  safe `404` on the second attempt.
- **Mass assignment**: N/A — no request body.

## 14. Database Impact

- **Tables affected**: `EmployeeDocument` (hard delete), `AuditLog`
  (insert).
- **Transactions**: the `EmployeeDocument` delete and the `AuditLog`
  insert commit together first; the Cloudinary delete happens **after**,
  best-effort, never blocking or failing the response.

## 15. Request Lifecycle

```
DELETE /api/v1/employees/:id/documents/:documentId
    ↓
authMiddleware
    ↓
requirePermission('employee:update:any')
    ↓ (403 if not granted)
employeeDocument.controller.remove
    ↓
employeeDocument.service.deleteDocument(employeeId, documentId, actor)
    ├─ employeeRepository.findById(employeeId) → not found → 404
    ├─ employeeDocumentRepository.findById(documentId, employeeId) → not found → 404
    ├─ prisma.$transaction:
    │    ├─ employeeDocumentRepository.deleteById(documentId, tx)
    │    └─ auditLogRepository.create({ entityType: 'EmployeeDocument', action: 'DELETE', beforeData, afterData: null, ... }, tx)
    └─ cloudinaryStorage.deleteAsset(document.publicId, document.resourceType, context)   [after commit, best-effort]
    ↓
200 { message: "Document deleted successfully" }
```

## 16. Performance Notes

Two indexed lookups plus one delete plus one best-effort external call —
no notable performance concerns at this scale.

## 17. Interview Notes

- **Q: Walk through the two real bugs found while verifying this
  specific endpoint.** (1) `cloudinary.uploader.destroy()` defaults to
  `resource_type: "image"` and silently returns `{result: "not found"}` —
  not an error — for any other type. A PDF document (Cloudinary's own
  classification: `"raw"`) appeared to delete successfully (the API
  returned `200`) but the asset was still live on Cloudinary, confirmed
  by re-fetching its URL. Fixed by storing `resourceType` on the
  `EmployeeDocument` row at upload time (from Cloudinary's response, not
  guessed from `mimeType`) and passing it explicitly to every `destroy()`
  call. (2) Even after fixing that, a re-fetch of the just-deleted
  asset's URL still returned `200` — the origin asset _was_ actually gone
  (confirmed via Cloudinary's Admin API), but the CDN kept serving a
  stale cached copy. Fixed by adding `invalidate: true` to every
  `destroy()` call, not just uploads. Both were caught by testing the
  actual deletion against the real Cloudinary account, not by trusting
  that "no error was thrown" meant "the asset is gone."
- **Q: Why is `EmployeeDocument` a hard delete when `Employee` is soft?**
  The `AuditLog`'s `beforeData` already captures the document's full
  metadata at the moment of deletion — exactly what a soft-delete flag
  would otherwise exist to preserve. Adding a parallel soft-delete
  mechanism here would duplicate what Feature 11's audit trail already
  provides.

## 18. cURL Examples

```bash
curl -i -X DELETE http://localhost:3000/api/v1/employees/$EMPLOYEE_ID/documents/$DOCUMENT_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 19. Postman Collection Notes

Run this **after** `POST /employees/:id/documents` in any test sequence
— save the returned `document.id` as `{{documentId}}` beforehand.

## 20. Testing Checklist

- ✅ Valid delete → `200`
- ✅ Second delete on the same `documentId` → `404`, not `409`
- ✅ `GET /employees/:id/documents` no longer lists the deleted document
- ✅ `403` as `EMPLOYEE`, `401` with no token
- ✅ `404` for nonexistent employee, nonexistent document, and a document
  under the wrong employee
- ✅ Real Cloudinary asset confirmed gone (verified via Cloudinary's
  Admin API, not just a non-error response) — required both the
  `resourceType` fix and the `invalidate: true` fix, both caught live
- ✅ No sensitive data leaked
