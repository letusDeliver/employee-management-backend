# API Endpoints Handbook

A living, implementation-accurate reference for every endpoint in this
API. Updated after every feature that adds or modifies an endpoint (see
`CLAUDE.md`'s standing rule). Every example in this document was captured
from the actual running server — not hand-written from memory — so it can
be used to test the API in Postman without reading any source code.

**Last synchronized with**: Feature 9, Stage A (RBAC redesign). Covers all
8 endpoints that exist as of this feature. Stage A did not add or remove
any endpoints — it replaced the authorization mechanism underneath four
of them (`/auth/register`, `/auth/login`, `/auth/me`, `/users`). Stage B
(Employee CRUD) will add five new endpoints in a follow-up update to this
document.

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
7. `POST /auth/refresh`
8. `POST /auth/logout`
9. `POST /auth/refresh` again (expect `401` — the token was just revoked)

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

---

## Endpoint Index

| #   | Feature   | Method | Path             | Auth                      | Required Permission | Public/Protected   |
| --- | --------- | ------ | ---------------- | ------------------------- | ------------------- | ------------------ |
| 1   | Health    | `GET`  | `/health`        | No                        | —                   | Public             |
| 2   | Readiness | `GET`  | `/ready`         | No                        | —                   | Public             |
| 3   | Auth      | `POST` | `/auth/register` | No                        | —                   | Public             |
| 4   | Auth      | `POST` | `/auth/login`    | No                        | —                   | Public             |
| 5   | Auth      | `POST` | `/auth/refresh`  | Refresh cookie            | —                   | Protected (cookie) |
| 6   | Auth      | `POST` | `/auth/logout`   | Refresh cookie (optional) | —                   | Protected (cookie) |
| 7   | Auth      | `GET`  | `/auth/me`       | Access token              | Any authenticated   | Protected          |
| 8   | Users     | `GET`  | `/users`         | Access token              | `user:list`         | Protected          |

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
    "roles": ["EMPLOYEE"]
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."
}
```

**As of Feature 9**: `user.role` (a single string) is now `user.roles` (an
array of role names). Every new registration is assigned exactly one role
— `EMPLOYEE` — via a `UserRole` row created in the same database
transaction as the user itself (see Request Lifecycle below), so
`roles` is never empty for a freshly registered account.

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
    "roles": ["EMPLOYEE"]
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."
}
```

Same `Set-Cookie` behavior as register. Field meanings are identical to
register's response — see that section. `user.roles` reflects the
account's **current** role assignments at the moment of login (read fresh
from `UserRole`), not whatever it was at registration — this is precisely
what makes logging in again the fix for the "stale role" scenario
documented in `GET /users`'s Edge Cases/Security Testing sections.

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
    "id": "cc5d98db-0a0a-49bb-ab80-1d18d295bbf8",
    "email": "stale-check-1783226574582@example.com",
    "name": "Stale Check",
    "createdAt": "2026-07-05T04:42:54.720Z",
    "updatedAt": "2026-07-05T04:42:54.720Z",
    "roles": ["ADMIN"]
  }
}
```

Same field meanings as register/login's `user` object — see Endpoint 3.
`password` is never present. **`roles` here is always fresh from the
database** — `getCurrentUser` re-queries `UserRole` on every call rather
than trusting the access token's embedded `roles` claim (verified live:
calling `/me` with a token issued _before_ a role change still correctly
shows the _new_ role — see the edge case below for why this is a
narrower guarantee than it sounds).

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
      "createdAt": "2026-07-04T13:56:29.996Z",
      "updatedAt": "2026-07-04T13:56:29.996Z",
      "roles": []
    },
    {
      "id": "e1b07e0b-3c8d-4f7d-aa1f-fffec7648b21",
      "email": "stagea-test1@example.com",
      "name": "Stage A Test",
      "createdAt": "2026-07-05T04:35:57.265Z",
      "updatedAt": "2026-07-05T04:35:57.265Z",
      "roles": ["ADMIN"]
    }
  ]
}
```

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
