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
- ~~**`GET /users` has no pagination**~~ — **closed** by the Users
  Server-Side Pagination/Sorting/Filtering pass (2026-07-26); see that
  endpoint's current entry.
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
- ~~**`GET /users` still has no pagination**~~ — the identical gap `GET
  /employees` had before Feature 10 closed it there; out of scope for
  Feature 10 itself, but **closed** by the later Users Server-Side
  Pagination/Sorting/Filtering pass (2026-07-26).
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
| 19  | Branches  | `POST`   | `/branches`                            | Access token              | `branch:create`                                | Protected          |
| 20  | Branches  | `GET`    | `/branches`                            | Access token              | `branch:read`                                  | Protected          |
| 21  | Branches  | `GET`    | `/branches/:id`                        | Access token              | `branch:read`                                  | Protected          |
| 22  | Branches  | `PATCH`  | `/branches/:id`                        | Access token              | `branch:update`                                | Protected          |
| 23  | Branches  | `DELETE` | `/branches/:id`                        | Access token              | `branch:delete`                                | Protected          |
| 24  | Departments | `POST`   | `/departments`                        | Access token              | `department:create`                            | Protected          |
| 25  | Departments | `GET`    | `/departments`                        | Access token              | `department:read`                              | Protected          |
| 26  | Departments | `GET`    | `/departments/:id`                    | Access token              | `department:read`                              | Protected          |
| 27  | Departments | `PATCH`  | `/departments/:id`                    | Access token              | `department:update`                            | Protected          |
| 28  | Departments | `DELETE` | `/departments/:id`                    | Access token              | `department:delete`                            | Protected          |
| 29  | Designations | `POST`   | `/designations`                       | Access token              | `designation:create`                           | Protected          |
| 30  | Designations | `GET`    | `/designations`                       | Access token              | `designation:read`                             | Protected          |
| 31  | Designations | `GET`    | `/designations/:id`                   | Access token              | `designation:read`                             | Protected          |
| 32  | Designations | `PATCH`  | `/designations/:id`                   | Access token              | `designation:update`                           | Protected          |
| 33  | Designations | `DELETE` | `/designations/:id`                   | Access token              | `designation:delete`                           | Protected          |
| 34  | Holiday Calendars | `POST`   | `/holiday-calendars`                              | Access token          | `holidayCalendar:create`                       | Protected          |
| 35  | Holiday Calendars | `GET`    | `/holiday-calendars`                              | Access token          | `holidayCalendar:read`                         | Protected          |
| 36  | Holiday Calendars | `GET`    | `/holiday-calendars/:id`                          | Access token          | `holidayCalendar:read`                         | Protected          |
| 37  | Holiday Calendars | `PATCH`  | `/holiday-calendars/:id`                          | Access token          | `holidayCalendar:update`                       | Protected          |
| 38  | Holiday Calendars | `DELETE` | `/holiday-calendars/:id`                          | Access token          | `holidayCalendar:delete`                       | Protected          |
| 39  | Holiday Calendars | `POST`   | `/holiday-calendars/:id/holidays`                 | Access token          | `holidayCalendar:update`                       | Protected          |
| 40  | Holiday Calendars | `GET`    | `/holiday-calendars/:id/holidays`                 | Access token          | `holidayCalendar:read`                         | Protected          |
| 41  | Holiday Calendars | `PATCH`  | `/holiday-calendars/:id/holidays/:holidayId`      | Access token          | `holidayCalendar:update`                       | Protected          |
| 42  | Holiday Calendars | `DELETE` | `/holiday-calendars/:id/holidays/:holidayId`      | Access token          | `holidayCalendar:update`                       | Protected          |
| 43  | Shifts    | `POST`   | `/shifts`                              | Access token              | `shift:create`                                 | Protected          |
| 44  | Shifts    | `GET`    | `/shifts`                              | Access token              | `shift:read`                                   | Protected          |
| 45  | Shifts    | `GET`    | `/shifts/:id`                          | Access token              | `shift:read`                                   | Protected          |
| 46  | Shifts    | `PATCH`  | `/shifts/:id`                          | Access token              | `shift:update`                                 | Protected          |
| 47  | Shifts    | `DELETE` | `/shifts/:id`                          | Access token              | `shift:delete`                                 | Protected          |

**As of the Branch domain (2026-09-13)**, `Employee` create/update also
accept an optional `branchId` — see endpoints 9 and 12 above, whose
Validation Rules sections should be read alongside endpoints 19-23 below.

**As of the Department domain (2026-09-13) — BREAKING CHANGE**: `Employee`'s
free-text `department` (`String`) field was **removed entirely** and
replaced by a mandatory `departmentId` (UUID, references `Department.id`).
Every existing Employee row was backfilled (`prisma/backfill-department.js`)
before the column was dropped — see endpoints 9, 10, and 12 above (their
Request Body/Validation Rules sections are updated in place, not
duplicated here) and endpoints 24-28 below.

**As of the Designation domain (2026-09-13) — BREAKING CHANGE**: `Employee`'s
free-text `jobTitle` (`String`) field was **removed entirely** and
replaced by a mandatory `designationId` (UUID, references `Designation.id`)
— the identical transformation `department` → `departmentId` already went
through, one feature earlier. Every existing Employee row was backfilled
(`prisma/backfill-designation.js`, 30 rows / 17 distinct free-text
`jobTitle` values) before the column was dropped — see endpoints 9, 10,
and 12 above (their Request Body/Validation Rules sections are updated in
place, not duplicated here) and endpoints 29-33 below.

**As of the Employment Type domain (2026-09-13)**: `Employee` gained a new
**required** field, `employmentType` — one of exactly four code-defined
values, `FULL_TIME`/`PART_TIME`/`CONTRACT`/`INTERN` (a Prisma enum, not a
managed master-data table like Branch/Department/Designation above; see
`docs/domain-employment-type.md` ADR-ET01). Unlike the `department` →
`departmentId` and `jobTitle` → `designationId` changes above, this is
**not** a breaking rename of an existing field — there was no free-text
`employmentType`/equivalent column before, so nothing was backfilled from
real data; the one-time migration
(`prisma/migrations/20260913205319_add_employment_type`) assigned every
pre-existing row `FULL_TIME` via a temporary column `DEFAULT` that was
dropped in the same migration statement, so every future `POST`/`PATCH`
must supply `employmentType` explicitly (ADR-ET02: no "unknown" state).
No new endpoint, module, permission, or `AuditLog` entity type was added
— conversions are captured by Employee's existing audit logging with zero
new code. See endpoints 9, 10, and 12 above (their Request Body/Query
Parameters/Validation Rules sections are updated in place, not duplicated
here).

**As of the Holiday Calendar domain (2026-09-13)**: a new fifth
master-data domain, and the first **parent-child aggregate** among
them — `HolidayCalendar` (`id`, `name` — **unique, case-sensitive, no
`code` field**, unlike Branch/Department/Designation above — `status`,
timestamps) owns a child `Holiday` collection (`id`, `holidayCalendarId`,
`date`, `name`, `isOptional` — defaults to `false` — timestamps), with a
compound-unique constraint on `(holidayCalendarId, date)` enforced at the
database level: no two entries on the same date within one calendar. See
endpoints 34-38 below for calendar-level CRUD (`POST`/`GET`/`GET`/`PATCH`/
`DELETE /holiday-calendars`) and endpoints 39-42 for the nested Holiday
CRUD (`/holiday-calendars/:id/holidays`), following the same parent-child
shape as Employee/EmployeeDocument (endpoints 16-18) — a `GET
/holiday-calendars/:id` deliberately does **not** embed its Holiday
entries; they're fetched separately via endpoint 40. Holiday entries
cascade-delete automatically at the database level (`onDelete: Cascade`)
whenever their parent calendar is hard-deleted; the calendar itself can
never be hard-deleted while any `Branch` references it (`409`, the same
"deactivate it instead" pattern already used by Branch/Department/
Designation's own delete guards — see endpoint 38). `Branch` also gained
a new optional field, `holidayCalendarId` (UUID, nullable, references
`HolidayCalendar.id`, `onDelete: Restrict`) — see endpoints 19 and 22
above (their Request Body/Validation Rules/Successful Response sections
are updated in place, not duplicated here). Mutations require
`holidayCalendar:create`/`update`/`delete` (`ADMIN` only, as seeded);
`holidayCalendar:read` is granted to every role, the same broad
reference-data reasoning already applied to `branch:read`/
`department:read`/`designation:read`.

**As of the Shift domain (2026-09-15)**: a sixth master-data domain, and,
like Designation, a single **flat aggregate** with no nested child (unlike
Holiday Calendar's Holiday) — `Shift` (`id`, `name` — unique, case-
insensitive, no `code` field, same shape as Holiday Calendar's `name` —
`startTime`/`endTime` as `"HH:mm"` strings, `workingDays` — a non-empty
array of `Weekday` enum values — `status`, timestamps). See endpoints
43-47 below for `POST`/`GET`/`GET`/`PATCH`/`DELETE /shifts`. `Employee`
gained a new **optional** field, `shiftId` (UUID, nullable, references
`Shift.id`, `onDelete: Restrict`) — mirroring `branchId`'s optional
treatment rather than `departmentId`/`designationId`'s mandatory one, since
not every employee necessarily operates under a fixed-hours expectation
(`docs/domain-shift.md` §3, ADR-SH02) — see endpoints 9, 10, and 12 above
(their Request Body/Query Parameters/Validation Rules/Successful Response
sections are updated in place, not duplicated here). A Shift can never be
hard-deleted while referenced by any Employee (`409`, the same "deactivate
it instead" pattern already used by Branch/Department/Designation/Holiday
Calendar's own delete guards — see endpoint 47); deactivating a Shift never
touches existing `Employee.shiftId` references, only blocks *future*
assignment. Mutations require `shift:create`/`update`/`delete` (`ADMIN`
only, as seeded, ADR-SH05); `shift:read` is granted to every role, the same
broad reference-data reasoning already applied to `branch:read`/
`department:read`/`designation:read`/`holidayCalendar:read`.

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
- **Multi-tab/session fix (2026-07-26)**: revoking the refresh token alone
  used to leave any **access token** already issued to this user — in any
  other tab, or any other device sharing the same login — fully valid
  until its own natural expiry (`authMiddleware` verified signature+expiry
  only, no session-state check). A user who logged out in one browser tab
  could still perform authenticated mutations (e.g. `DELETE /employees/:id`)
  from a second, already-open tab for up to `JWT_ACCESS_EXPIRES_IN`. Fixed
  by also stamping `User.tokensValidAfter = now()` on every successful
  logout; `authMiddleware` now rejects any access token whose `iat` claim
  predates that timestamp, so logout takes effect on this user's very next
  request anywhere, not just in the tab that called this endpoint.

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

- **Tables affected**: `RefreshToken` and `User` (both conditionally
  updated, only if a valid, not-already-revoked `RefreshToken` record
  matching the cookie's hash exists).
- **Rows updated**: at most 1 `RefreshToken` (`revoked: true`) + at most 1
  `User` (`tokensValidAfter: <now>`). Zero rows affected either way if the
  cookie is missing, garbage, or already revoked.
- **Rows deleted**: none.
- **Transactions**: yes — both writes happen in one `prisma.$transaction`,
  so a logout can never revoke the refresh token without also stamping
  `tokensValidAfter`, or the reverse (mirrors Feature 11's audit-log
  transaction pattern: a mutation and its dependent write succeed or fail
  together).

## 15. Request Lifecycle

```
POST /api/v1/auth/logout
    ↓
(global middleware chain)
    ↓
auth.controller.logout
    ├─ reads req.cookies.refreshToken
    ├─ if present: auth.service.logout(token)
    │      ├─ refreshTokenRepository.findValidByHash(...) → revoke if found (silently no-ops otherwise)
    │      └─ if found: userRepository.invalidateTokensIssuedBefore(userId, now)
    │             — this is what makes logout affect every tab/device this user has open,
    │               not just the one that sent this request (see §2's 2026-07-26 fix)
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
- ✅ Database verification: `User.tokensValidAfter` is stamped to the
  logout moment
- ✅ **Multi-tab regression test** (verified live, 2026-07-26): register
  (Tab A) → `/auth/refresh` reusing the same cookie jar to simulate Tab B
  bootstrapping (`200`) → confirm both tabs' access tokens work (`200`,
  `200`) → Tab B calls `/auth/logout` → Tab A's still-unexpired,
  pre-logout access token now gets `401` on its very next request
  (`GET /auth/me` and `GET /users` both confirmed) instead of continuing
  to work until its natural expiry
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
Feature:            Users Server-Side Pagination, Sorting, Filtering (2026-07-26)
Endpoint:           List Users
Description:        Returns a paginated, searchable, filterable, sortable slice of registered users
Method:             GET
URL:                /api/v1/users
API Version:        v1
Module:             modules/users
Authentication:     Yes (Bearer access token)
Authorization:      `user:list` permission required (ADMIN only, as seeded)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: gives an administrator visibility into all
  registered accounts — this project's first real, concrete use of a
  permission check and the first authorization-gated endpoint. As of this
  pass, it also scales the way `GET /employees` already does (Feature 10)
  — returning a bounded page instead of the entire table.
- **Business problem solved**: user management/oversight — "who is
  registered in this system," plus, as of this pass, "find a specific
  person quickly" and "see everyone with a given role."
- **Expected callers**: any user whose roles resolve to the `user:list`
  permission — only `ADMIN`, per the seeded `RolePermission` grants.
  Also called internally, with `limit=100` and no other params, by the
  frontend's `UserDirectoryService` to build its name-resolution cache
  for Employees (see Performance Notes below for the cap this implies).

## 3. Request Headers

| Header                                | Required | Notes                                                                   |
| ------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must belong to a user whose roles resolve to the `user:list` permission |

## 4. Path Parameters

None.

## 5. Query Parameters

| Name      | Type   | Default     | Required | Allowed Values           | Notes                                                                                          |
| --------- | ------ | ----------- | -------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| `page`    | number | `1`         | No       | Integer `>= 1`            | `0` or negative → `400`.                                                                        |
| `limit`   | number | `10`        | No       | Integer `1`-`100`         | `0`, negative, or `> 100` → `400` (rejected, not silently clamped).                             |
| `search`  | string | _(none)_    | No       | Any string                 | Case-insensitive partial match across `name` and `email`. An empty `search=` is treated identically to omitting it entirely. |
| `role`    | string | _(none)_    | No       | Any string                 | Case-insensitive **exact** match against a role **name** (e.g. `ADMIN`, `admin`, and `Admin` all match) via the `userRoles`/`Role` relation. Not validated against the real `Role` table — an unmatched value simply returns zero rows, same behavior as Employees' `departmentId`/`designationId` filters. |
| `sortBy`  | string | `createdAt` | No       | `name`, `email`, `createdAt` | Whitelisted — any other value → `400`, never passed through to Prisma's `orderBy` directly. Roles are multi-valued and deliberately not sortable. |
| `order`   | string | `desc`      | No       | `asc`, `desc`               | Any other value → `400`.                                                                        |

`search` and `role` combine with **AND** when both are present.

## 6. Request Body

None.

## 7. Validation Rules

Enforced by the new `src/modules/users/user.validation.js`'s
`listUsersQuerySchema` (Zod), via `validateMiddleware(schema, 'query')` —
mirrors `employee.validation.js`'s `listEmployeesQuerySchema` exactly.
Every field above is coerced/bounded/whitelisted before the service ever
sees it; nothing reaches Prisma unvalidated.

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
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

`users` is up to `limit` sanitized rows (no `password`) matching the
search/filter, ordered by `sortBy`/`order` plus an unconditional
secondary `id ASC` tiebreaker for deterministic ordering across
repeated/paged calls. Each entry's `roles` array is resolved only for
the users on this page, not the whole table. Note `jane.doe@example.com`
above: an account created **before** the Feature 9 migration, still
showing `roles: []` — its old `role` enum value was dropped, not
migrated (see the Global Reference's Known Gaps). `pagination` is the
same shape `GET /employees` already returns: `page`/`limit` echo the
request, `total` is the count across **all** matching pages, and
`totalPages` is `Math.ceil(total / limit)`.

## 9. Error Responses

| Status | Reason                                         | Response (`message`)                                                                      | When                                                                    |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `400`  | `page`/`limit` out of bounds                   | Zod's bounds-violation message                                                            | `page < 1`, `limit < 1`, or `limit > 100`                               |
| `400`  | Invalid `sortBy`                               | Zod's enum message listing the allowed values                                             | Any value outside `name`/`email`/`createdAt`                            |
| `400`  | Invalid `order`                                | Zod's enum message                                                                         | Any value other than `asc`/`desc`                                       |
| `401`  | No/invalid/expired access token                | Same messages as `/auth/me` (`"Authentication required"` or `"Invalid or expired token"`) | `authMiddleware` runs first, identically to every other protected route |
| `403`  | Valid token, but roles don't grant `user:list` | `"You do not have permission to perform this action"`                                     | Any authenticated `EMPLOYEE` or `MANAGER`                               |

## 10. Postman Test Cases

| #   | Case                          | Query                      | Expected                                                              |
| --- | ----------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| 1   | Default call                  | _(none)_                   | `200`, `page: 1`, `limit: 10`                                         |
| 2   | Explicit pagination           | `?page=2&limit=1`           | `200`, a different single row than page 1                            |
| 3   | Out-of-bounds `page`/`limit`  | `?page=0` / `?limit=999`    | `400`                                                                 |
| 4   | Search by name or email       | `?search=jane`               | `200`, only matching rows                                             |
| 5   | Role filter, real role        | `?role=ADMIN`                | `200`, only users holding that role                                   |
| 5b  | Role filter, different case   | `?role=admin` / `?role=Admin` | `200`, identical `total` to `?role=ADMIN` — case-insensitive          |
| 6   | Role filter, unknown value    | `?role=NOT_A_REAL_ROLE`      | `200`, `{ "users": [], "pagination": { "total": 0 } }` — not an error |
| 7   | Sort ascending vs. descending | `?sortBy=name&order=asc/desc` | `200`, order reversed between the two calls                          |
| 8   | Invalid `sortBy`              | `?sortBy=password`           | `400`                                                                 |
| 9   | As `EMPLOYEE` token           | _(any)_                    | `403`                                                                 |
| 10  | No token                      | _(any)_                    | `401`                                                                 |

## 11. Negative Testing

| Scenario                                                                          | Expected                                                                                                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A `roles` claim manually crafted into a forged JWT (signed with the wrong secret) | `401` — fails signature verification before authorization is even checked                                                                                           |
| Wrong HTTP method (`POST /users`)                                                 | `404` — no route registered for `POST` on this path                                                                                                                 |
| `?sortBy=password` or any real-but-unlisted `User` column                        | `400` — the whitelist rejects it before it ever reaches Prisma's `orderBy`, regardless of whether the column actually exists                                       |
| SQL injection attempt in `search`/`role`                                          | Treated as a literal string — Prisma's parameterized `contains`/`equals` neutralizes it; no query-structure risk                                                    |
| Non-numeric `page`/`limit` (e.g. `?page=abc`)                                     | `400` — Zod's `coerce.number()` fails, reported as a type-mismatch                                                                                                  |

## 12. Edge Cases

| Scenario                                                                                                                   | Expected Behavior                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A user is promoted to `ADMIN` in the database, but calls this endpoint using their still-valid, pre-promotion access token | `403` — the token's `roles` claim is frozen at issuance; a fresh login or `/refresh` is required before the promotion takes effect. **Directly observed and verified live**, both during Feature 8's original testing and again after the Feature 9 permission-based rewrite — the specific mechanism changed (role → permission resolution), but the stale-token propagation delay behaves identically. |
| No users match the search/filter/role at all                                                                              | `200`, `{ "users": [], "pagination": { "total": 0, "totalPages": 0, ... } }` — not an error                                                                                                                                                                                                                                                                                                              |
| `page` beyond the last page (e.g. `page=999` with only 3 real pages)                                                      | `200`, `{ "users": [] }` — an out-of-range page is an empty slice, not a `404`                                                                                                                                                                                                                                                                                                                          |
| Multiple users sharing the identical `sortBy` value (e.g. same `createdAt` second)                                        | The unconditional `id ASC` secondary sort breaks the tie deterministically — verified live with repeated identical calls returning the same order                                                                                                                                                                                                                                                       |
| A user with zero roles (`roles: []`) and an active `?role=` filter                                                        | Never matches any `role` filter value — correctly excluded, no error                                                                                                                                                                                                                                                                                                                                     |

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
- **BOLA (Broken Object Level Authorization)**: not directly applicable —
  returns a filtered collection, not a client-supplied ID lookup — but
  this is exactly the kind of endpoint where BOLA becomes relevant the
  moment a `GET /users/:id` variant is ever added.
- **Sensitive data exposure**: verify **every single entry** in the
  `users` array is missing `password`, not just spot-checking the first
  one.
- **Query-parameter injection**: confirm `sortBy` is truly whitelisted —
  attempt every real `User` column that isn't in the allowed list (e.g.
  `password`, `id`, `tokensValidAfter`) and confirm each is rejected with
  `400`, not silently accepted or passed through to a raw query.
- **Resource exhaustion via `limit`**: confirm the server-side cap
  (`100`) actually rejects a larger request rather than silently
  clamping it.

## 14. Database Impact

- **Tables affected**: `User` (read, filtered/sorted/paginated),
  `UserRole`+`Role` (read, batched once for just the current page's user
  ids — not the whole table), `Role`/`Permission`/`RolePermission` (read,
  via the permission cache, to authorize the request itself).
- **Rows affected**: none inserted/updated/deleted.
- **Queries per request**: two, run concurrently via `Promise.all` — one
  `findMany` (the page of results) and one `count` (the total across all
  matching pages), the same pattern and accepted non-transactional
  trade-off as `GET /employees` (Feature 10).

## 15. Request Lifecycle

```
GET /api/v1/users?search=...&role=...&sortBy=...&order=...&page=...&limit=...
Authorization: Bearer <accessToken>
    ↓
authMiddleware
    ├─ fails → 401
    └─ succeeds → req.user = { id, roles }
    ↓
requirePermission('user:list')
    ↓ (403 if not granted)
validateMiddleware(listUsersQuerySchema, 'query')
    ↓ (400 on Zod failure; result lands on req.validatedQuery, not req.query)
user.controller.list → user.service.listUsers(req.validatedQuery)
    ├─ buildUserWhere({ search, role })
    ├─ Promise.all([
    │    userRepository.findAll({ where, orderBy: [{[sortBy]: order}, {id: 'asc'}], skip, take }),
    │    userRepository.count(where),
    │  ])
    └─ rbacRepository.getRoleNamesForUsers(pageUserIds)   [one batched query, page-scoped]
    ↓
200 { users: [...], pagination: {...} }
```

## 16. Performance Notes

- Two queries per request (`findMany` + `count`), run concurrently via
  `Promise.all`, not a `$transaction` — identical trade-off to
  `GET /employees` (Feature 10): the two queries can reflect slightly
  different moments under concurrent writes, accepted as fine for an HR
  application.
- Role resolution (`getRoleNamesForUsers`) is now scoped to the current
  page's user ids, not the whole table — strictly cheaper than the
  pre-pagination behavior, not just neutral.
- `search` uses `contains`/`mode: 'insensitive'` (Postgres `ILIKE`) across
  `name`/`email` — a sequential scan at this data size, same documented
  trade-off as Employees' search (a future `pg_trgm` index is the upgrade
  path if this table grows large enough to matter; not needed today).
  Unlike Employees, this search needs no join — both fields live directly
  on `User`.
- `email` already carries a real unique-constraint B-tree index; `name`
  does not — a deliberate, explicitly-considered choice, left unindexed
  for now. This precedent used to be Employees' own unindexed `jobTitle`
  column; as of the Designation domain, that free-text column is gone —
  `departmentId`/`designationId` themselves are indexed FK columns, and
  `Department.name`/`Designation.name` each carry their own
  unique-constraint index, but a search into either still requires a join,
  and `User.name` has no analogous index of its own. Revisit only if
  sorting/searching by name is measurably slow at real scale.
- **A real cross-cutting constraint worth knowing**: the frontend's
  `UserDirectoryService` (used by Employees for name-resolution
  enrichment) calls this same endpoint with `limit=100` and no other
  params, relying on it to represent "the whole directory." If this
  organization's registered-user count ever exceeds 100, that cache
  silently stops containing every user — enrichment degrades gracefully
  (a name just won't resolve, never a crash), but this is a known, named
  cap worth remembering if the user base grows past three digits.
- `limit`'s hard cap (100) bounds the worst-case single-request cost
  regardless of what's asked for.

## 17. Interview Notes

See `handbook/08-rbac.md` for the original permission-check reasoning
(unchanged by this pass) and Feature 10's entry for the pagination/
sorting/filtering pattern this endpoint now mirrors. The single most
important pre-existing question for this endpoint: _"A user was just
promoted to `ADMIN` — why can't they access this endpoint yet with their
current session?"_ — answered fully in `handbook/08-rbac.md`, and
directly observed during both this endpoint's original development and
its Feature 9 rewrite. Two questions specific to this pass:

- **Q: Why does `GET /users` return a bounded page instead of everyone,
  when the frontend's directory-enrichment cache actually wants
  everyone?** Because always paginating keeps one uniform endpoint
  contract — Swagger describes one shape, not "paginated sometimes,
  everyone other times" depending on which params happen to be present.
  The directory service adapts by requesting the maximum allowed page
  size instead of the endpoint growing a second, inconsistent mode.
- **Q: Why filter by role *name* through a relation instead of adding a
  denormalized role column to `User`?** `User`↔`Role` is genuinely
  many-to-many (`UserRole`) — a user can hold more than one role
  (observably true in this dataset). A single denormalized column
  couldn't represent that; the relation filter (`userRoles: { some: {
  role: { name } } }`) compiles to one `EXISTS` subquery, no N+1.

## 18. cURL Examples

```bash
# As ADMIN, default pagination
curl -i http://localhost:3000/api/v1/users -H "Authorization: Bearer $ADMIN_TOKEN"

# Search + role filter + sort
curl -i "http://localhost:3000/api/v1/users?search=jane&role=ADMIN&sortBy=name&order=asc" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

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

- ✅ Success as `ADMIN` (`200`, default `page: 1`/`limit: 10`)
- ✅ Pagination math correct across pages; `page` beyond the last page
  returns an empty array, not a `404`
- ✅ Search matches `name`/`email`, case-insensitive
- ✅ Role filter matches real roles; an unmatched role returns zero rows,
  not an error
- ✅ Sort ascending/descending both confirmed, including the deterministic
  `id ASC` tiebreaker on repeated identical calls
- ✅ `400` on out-of-bounds `page`/`limit` and on any `sortBy`/`order`
  outside the whitelist
- ✅ `403` as `EMPLOYEE`/`MANAGER`
- ✅ `401` with no token (confirms auth runs before authorization)
- ✅ `401` with garbage token
- ✅ Every entry in the response missing `password`
- ✅ Role-promotion propagation delay confirmed (stale token still `403`
  until a fresh login)
- ✅ Frontend's `UserDirectoryService` (Employees' name-enrichment cache)
  re-verified live against the new paginated contract, not just this
  endpoint in isolation
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
  "departmentId": "c74add11-d421-429d-b46c-a118fc5f817d",
  "designationId": "5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7d",
  "employmentType": "FULL_TIME",
  "salary": 75000,
  "dateOfJoining": "2024-01-15",
  "managerId": null,
  "branchId": null,
  "shiftId": null
}
```

| Field           | Type              | Required | Notes                                                                                                                                                           |
| --------------- | ----------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `userId`        | string (UUID)     | No       | Links this Employee to a login account. Omit for an HR-only record with no system access.                                                                       |
| `departmentId`  | string (UUID)     | **Yes**  | **Changed by the Department domain (2026-09-13) — was free-text `department: string`, now a mandatory FK.** Must reference an existing Department whose `status` is `ACTIVE` — checked via `departmentService.assertDepartmentAssignable`, the same synchronous-read shape as `branchId`'s check (see endpoint 24's domain). Rejects with `400 departmentId: Invalid input: expected string, received undefined` (missing entirely), `400 departmentId: references a record that does not exist`, or `400 departmentId: this department is not active and cannot be assigned`. Verified live, including the missing-field case. |
| `designationId` | string (UUID)     | **Yes**  | **Changed by the Designation domain (2026-09-13) — was free-text `jobTitle: string`, now a mandatory FK, same reasoning and same transformation as `departmentId` above.** Must reference an existing Designation whose `status` is `ACTIVE` — checked via `designationService.assertDesignationAssignable`, the same synchronous-read shape as `departmentId`'s check (see endpoint 29's domain). Rejects with `400 designationId: Invalid input: expected string, received undefined` (missing entirely), `400 designationId: references a record that does not exist`, or `400 designationId: this designation is not active and cannot be assigned`. Verified live, including the missing-field case. |
| `employmentType` | string (enum)    | **Yes**  | **Added by the Employment Type domain (2026-09-13).** One of exactly four values: `FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERN`. A closed, code-defined enum, not an FK — unlike `departmentId`/`designationId` there is no existence/status check to perform in the service, only Zod's enum validation. Missing entirely, or any other value (e.g. `"FREELANCER"`), both produce the identical `400` — `"employmentType: Invalid option: expected one of "FULL_TIME"\|"PART_TIME"\|"CONTRACT"\|"INTERN""` (Zod's enum-validation message doesn't distinguish "missing" from "invalid"). Verified live for both. |
| `salary`        | number            | Yes      | Must be a positive number, capped at 100,000,000 (a sanity ceiling, not a real business limit).                                                                |
| `dateOfJoining` | string (ISO date) | Yes      | Coerced to a `Date`. Cannot be in the future.                                                                                                                   |
| `managerId`     | string (UUID)     | No       | Must reference an existing `Employee.id`. Cannot equal the created record's own id (checked in the service, since the id doesn't exist yet at validation time). |
| `branchId`      | string (UUID)     | No       | **Added by the Branch domain (2026-09-13).** Must reference an existing Branch whose `status` is `ACTIVE` — checked via `branchService.assertBranchAssignable`, a synchronous cross-module read, not just a raw FK-exists check (see endpoint 19's domain). Rejects with `400 branchId: references a record that does not exist` or `400 branchId: this branch is not active and cannot be assigned`. Verified live. |
| `shiftId`       | string (UUID)     | No       | **Added by the Shift domain (2026-09-15).** Optional, same nullable/optional treatment as `branchId` — not every employee necessarily operates under a fixed-hours expectation (`docs/domain-shift.md` ADR-SH02). Must reference an existing Shift whose `status` is `ACTIVE` — checked via `shiftService.assertShiftAssignable`, the same synchronous-read shape as `branchId`'s check (see endpoint 43's domain). Rejects with `400 shiftId: references a record that does not exist` or `400 shiftId: this shift is not active and cannot be assigned`. Verified live. |

## 7. Validation Rules

Enforced by `src/modules/employees/employee.validation.js`'s
`createEmployeeSchema` (Zod), via `validateMiddleware`.

- `userId`/`managerId`/`departmentId`/`designationId`/`branchId`/`shiftId`:
  if present, must be syntactically valid UUIDs (Zod's `.uuid()`).
  `departmentId` and `designationId` are the only two of these six that
  are **required**, not optional — an entirely missing `departmentId` or
  `designationId` produces
  `"departmentId: Invalid input: expected string, received undefined"` or
  `"designationId: Invalid input: expected string, received undefined"`
  respectively, verified live.
- `designationId`: **Changed by the Designation domain (2026-09-13) — was
  free-text `jobTitle: string`, now a mandatory FK, structurally identical
  to `departmentId`'s own migration.** Existence + `ACTIVE`-status is
  checked via `designationService.assertDesignationAssignable`
  (business-rule validation, not Zod) — see the field table above and
  endpoint 29's domain for the full FK-guard write-up. Designation's own
  trimming/uniqueness rule now lives on `Designation.name` instead (see
  endpoint 29), since `jobTitle` is no longer a free-text field on
  Employee at all.
- `shiftId`: **Added by the Shift domain (2026-09-15).** Optional — unlike
  `departmentId`/`designationId`, there is no "always required" history to
  preserve here; mirrors `branchId`'s own optional treatment instead.
  Existence + `ACTIVE`-status is checked via
  `shiftService.assertShiftAssignable` (business-rule validation, not
  Zod) only when a `shiftId` is actually provided — see the field table
  above and endpoint 43's domain. Verified live: a nonexistent `shiftId`
  and an `INACTIVE` `shiftId` both produce their respective `400`s.
- `employmentType`: **Added by the Employment Type domain (2026-09-13).**
  `z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'])` — the closed
  list is hard-coded in `employee.validation.js`'s own `EMPLOYMENT_TYPES`
  array, mirrored 1:1 against the Prisma `EmploymentType` enum (there is
  no repository/service to own it, since it's not a managed aggregate —
  `docs/domain-employment-type.md` ADR-ET01). Required, with no
  `.optional()` and no schema-level `@default` (ADR-ET02: "no unknown
  state"). Both a missing `employmentType` and an invalid one (e.g.
  `"FREELANCER"`) produce the exact same message, since Zod's enum
  validation doesn't distinguish the two cases:
  `"employmentType: Invalid option: expected one of "FULL_TIME"|"PART_TIME"|"CONTRACT"|"INTERN""`.
  Verified live for both. Unlike `departmentId`/`designationId`, there is
  no business-rule validation step in the service — a plain enum value has
  no existence/status to check.
- `salary`: must be a positive number, capped at 100,000,000. Custom
  messages: `"Salary must be a positive number"` /
  `"Salary seems unreasonably high"`. The cap is a sanity ceiling meant
  to catch garbled input (an extra digit, a pasted-in-error value), not
  a real business constraint.
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
    "departmentId": "c74add11-d421-429d-b46c-a118fc5f817d",
    "designationId": "5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7d",
    "employmentType": "FULL_TIME",
    "salary": "75000",
    "dateOfJoining": "2024-01-15T00:00:00.000Z",
    "managerId": null,
    "branchId": null,
    "shiftId": null,
    "deletedAt": null,
    "createdAt": "2026-07-05T04:52:52.814Z",
    "updatedAt": "2026-07-05T04:52:52.814Z"
  }
}
```

| Field                | Description                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `employee.id`        | UUID, server-generated.                                                                                                                                                                       |
| `employee.employmentType` | Echoes the request value exactly — one of `FULL_TIME`/`PART_TIME`/`CONTRACT`/`INTERN`. **Added by the Employment Type domain (2026-09-13).**                                          |
| `employee.salary`    | **Returned as a string**, not a number — Prisma's `Decimal` type serializes to a string in JSON to avoid floating-point precision loss. Expect this in every response that includes `salary`. |
| `employee.deletedAt` | `null` for a live record — see `DELETE /employees/:id` for the soft-delete value.                                                                                                             |
| `employee.managerId` | `null` unless supplied.                                                                                                                                                                       |
| `employee.shiftId`   | `null` unless supplied. **Added by the Shift domain (2026-09-15).**                                                                                                                           |

## 9. Error Responses

| Status | Reason                                               | Response (`message`)                                                                       | When                                                                                                                                        |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | Missing required field(s)                            | e.g. `"departmentId: Invalid input: expected string, received undefined"` (joined per field) | Any of `departmentId`/`designationId`/`employmentType`/`salary`/`dateOfJoining` absent — verified live for `departmentId` and `employmentType` |
| `400`  | Negative/zero salary                                 | `"salary: Salary must be a positive number"`                                               | `salary <= 0`                                                                                                                               |
| `400`  | Salary over the sanity ceiling                       | `"salary: Salary seems unreasonably high"`                                                 | `salary > 100,000,000`                                                                                                                       |
| `400`  | `departmentId` doesn't exist or is inactive          | `"departmentId: references a record that does not exist"` / `"departmentId: this department is not active and cannot be assigned"` | Verified live for both                                                                                                                       |
| `400`  | `designationId` doesn't exist or is inactive         | `"designationId: references a record that does not exist"` / `"designationId: this designation is not active and cannot be assigned"` | Verified live for both — same shape as `departmentId`'s equivalent check                                                                     |
| `400`  | `shiftId` doesn't exist or is inactive                | `"shiftId: references a record that does not exist"` / `"shiftId: this shift is not active and cannot be assigned"` | **Added by the Shift domain (2026-09-15).** Verified live for both — same shape as `departmentId`'s/`designationId`'s equivalent check |
| `400`  | `employmentType` missing or not one of the 4 allowed values | `"employmentType: Invalid option: expected one of "FULL_TIME"\|"PART_TIME"\|"CONTRACT"\|"INTERN""` | **Added by the Employment Type domain (2026-09-13).** Identical message for both "missing" and "invalid" (e.g. `"FREELANCER"`) — Zod's enum validation doesn't distinguish the two. Verified live for both. |
| `400`  | Future `dateOfJoining`                               | `"dateOfJoining: Date of joining cannot be in the future"`                                 | Date is after "now"                                                                                                                         |
| `400`  | Invalid UUID for `userId`/`managerId`/`departmentId`/`designationId`/`branchId`/`shiftId` | Zod's default UUID-format message                              | Malformed UUID string supplied                                                                                                              |
| `400`  | Malformed JSON body                                  | `"Invalid JSON in request body"`                                                           | Same as every other JSON-body endpoint                                                                                                      |
| `401`  | No/invalid/expired access token                      | Same as every other protected endpoint                                                     | `authMiddleware` failure                                                                                                                    |
| `400`  | `userId`/`managerId`/`branchId`/`departmentId`/`designationId`/`shiftId` references a nonexistent record | `"userId: references a record that does not exist"` (or `managerId:`/`branchId:`/`departmentId:`/`designationId:`/`shiftId:`) | The referenced record doesn't exist — a Prisma FK-violation (`P2003`), translated in the service rather than left as a raw `500`, or (for `branchId`/`departmentId`/`designationId`/`shiftId`) rejected earlier by the assignability check before the DB is even touched |
| `403`  | Roles don't grant `employee:create`                  | `"You do not have permission to perform this action"`                                      | Authenticated as plain `EMPLOYEE`                                                                                                           |
| `409`  | `userId` already has an Employee record              | `"This user already has an employee record"`                                               | Duplicate `userId` (only counts non-deleted records), via pre-check or the DB's own partial-unique-index constraint                         |

## 10. Postman Test Cases

| #   | Case                 | Body                                                                                                                        | Expected                            |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | Valid, with `userId` | `{"userId":"<uuid>","departmentId":"<uuid>","designationId":"<uuid>","employmentType":"FULL_TIME","salary":75000,"dateOfJoining":"2024-01-15"}` | `201`                               |
| 2   | Valid, no `userId`   | Same, minus `userId`                                                                                                        | `201`, `employee.userId: null`      |
| 3   | Duplicate `userId`   | Same `userId` as test 1, run again                                                                                          | `409`                               |
| 4   | Empty body           | `{}`                                                                                                                        | `400`, `departmentId`/`designationId`/`employmentType`/`salary`/`dateOfJoining` all listed |
| 5   | Negative salary      | `{..., "salary": -500}`                                                                                                     | `400`                               |
| 6   | Future date          | `{..., "dateOfJoining": "2099-01-01"}`                                                                                      | `400`                               |
| 7   | As `EMPLOYEE` token  | Any valid body                                                                                                              | `403`                               |
| 8   | No token             | Any valid body                                                                                                              | `401`                               |
| 9   | Nonexistent `userId` | `{..., "userId": "00000000-0000-0000-0000-000000000000"}`                                                                   | `400`, not `500`                    |
| 10  | Nonexistent `departmentId` | `{..., "departmentId": "00000000-0000-0000-0000-000000000000"}`                                                       | `400`, not `500` — verified live    |
| 11  | Inactive `departmentId` | `{..., "departmentId": "<id of an INACTIVE department>"}`                                                                 | `400` — verified live               |
| 12  | Nonexistent `designationId` | `{..., "designationId": "00000000-0000-0000-0000-000000000000"}`                                                     | `400`, not `500` — verified live    |
| 13  | Inactive `designationId` | `{..., "designationId": "<id of an INACTIVE designation>"}`                                                             | `400` — verified live               |
| 14  | Missing `employmentType` | Same as test 1, minus `employmentType`                                                                                 | `400` — verified live               |
| 15  | Invalid `employmentType` | `{..., "employmentType": "FREELANCER"}`                                                                                | `400` — same message as test 14, verified live |
| 16  | Nonexistent `shiftId`    | `{..., "shiftId": "00000000-0000-0000-0000-000000000000"}`                                                             | `400`, not `500` — verified live. **Added by the Shift domain (2026-09-15).** |
| 17  | Inactive `shiftId`       | `{..., "shiftId": "<id of an INACTIVE shift>"}`                                                                        | `400` — verified live. **Added by the Shift domain (2026-09-15).** |
| 18  | Valid `shiftId`, omitted entirely | Same as test 2 (no `shiftId`)                                                                                 | `201`, `employee.shiftId: null` — verified live. **Added by the Shift domain (2026-09-15).** |

## 11. Negative Testing

| Payload/Scenario                                        | Expected                                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Wrong data types (`"salary": "not-a-number"`)           | `400` — Zod type-check fails                                                                                   |
| Invalid `employmentType` enum value (`"FREELANCER"`)    | `400` — same message as a missing `employmentType`, since Zod's enum validation doesn't distinguish the two   |
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
| `shiftId` omitted entirely                                                                        | Stored as `null` — "no fixed-hours expectation," never an error, same positive-allowlist framing as `branchId`'s own omission (ADR-SH02). **Added by the Shift domain (2026-09-15).** Verified live. |

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
  Feature 11), plus a read of `Shift` when `shiftId` is provided (the
  assignability check — **added by the Shift domain, 2026-09-15**).
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
    ├─ shiftId provided? → shiftService.assertShiftAssignable(shiftId) → 400 if missing/inactive
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
  -d '{"departmentId":"'"$DEPARTMENT_ID"'","designationId":"'"$DESIGNATION_ID"'","employmentType":"FULL_TIME","salary":75000,"dateOfJoining":"2024-01-15"}'
```

```bash
# With an optional shiftId (added by the Shift domain, 2026-09-15)
curl -i -X POST http://localhost:3000/api/v1/employees \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"departmentId":"'"$DEPARTMENT_ID"'","designationId":"'"$DESIGNATION_ID"'","employmentType":"FULL_TIME","salary":75000,"dateOfJoining":"2024-01-15","shiftId":"'"$SHIFT_ID"'"}'
```

## 19. Postman Collection Notes

Requires `{{accessToken}}` to resolve to `employee:create` (`ADMIN`/
`MANAGER`). Save the returned `employee.id` to a collection variable
(e.g. `{{employeeId}}`) — every other Employee endpoint needs it. Save
`{{shiftId}}` from `POST /shifts` (endpoint 43) beforehand if exercising
the assignment cases.

## 20. Testing Checklist

- ✅ Success with and without `userId`
- ✅ `409` on duplicate (still-active) `userId`
- ✅ `201` re-creating for a `userId` whose prior Employee record was soft-deleted
- ✅ `400` (not `500`) on nonexistent `userId`/`managerId`/`branchId`/`departmentId`/`designationId`/`shiftId`
- ✅ `400` on inactive `departmentId`/`branchId`/`designationId`/`shiftId`, missing fields, negative salary, future date
- ✅ Valid create with an `ACTIVE` `shiftId` → `201`, field echoed back (verified live). **Added by the Shift domain (2026-09-15).**
- ✅ `shiftId` omitted → stored/returned as `null`
- ✅ `400` on missing or invalid `employmentType` (e.g. `"FREELANCER"`) — identical message for both, verified live
- ✅ `403` as `EMPLOYEE`, `401` with no token
- ✅ `salary` returned as a string, not a number
- ✅ `employmentType` echoed back exactly as sent
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
| `search`      | string | _(none)_    | No       | Any string                                                       | Case-insensitive partial match against the linked **Department's name** (a relation, not a column — see the Department domain, 2026-09-13), the linked **Designation's name** (a relation, not a column — see the Designation domain, 2026-09-13), the linked `User.name`, and `User.email`. An empty `search=` is treated identically to omitting it entirely. |
| `departmentId` | string | _(none)_   | No       | Valid UUID                                                       | **Changed by the Department domain (2026-09-13) — was a case-insensitive exact-match `department: string` filter.** Now an exact UUID FK match. Invalid UUID format → `400`. |
| `designationId` | string | _(none)_   | No       | Valid UUID                                                       | **Changed by the Designation domain (2026-09-13) — was a case-insensitive exact-match `jobTitle: string` filter.** Now an exact UUID FK match, the identical transformation `department` → `departmentId` already went through. Invalid UUID format → `400`. |
| `employmentType` | string | _(none)_  | No       | `FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERN`                    | **Added by the Employment Type domain (2026-09-13).** Exact-match filter on the plain scalar column — unlike `departmentId`/`designationId` there is no FK/relation involved at all, since `employmentType` isn't a foreign key. Any value outside the 4-item whitelist → `400` (Zod enum rejection), same enum-validation shape as `POST`/`PATCH`'s body field. |
| `managerId`  | string | _(none)_    | No       | Valid UUID                                                       | Exact match. Invalid UUID format → `400`.                                                                                                                                    |
| `shiftId`    | string | _(none)_    | No       | Valid UUID                                                       | **Added by the Shift domain (2026-09-15).** Exact UUID FK match, the identical filter shape as `departmentId`/`designationId`. Invalid UUID format → `400`.                  |
| `sortBy`     | string | `createdAt` | No       | `department`, `designation`, `employmentType`, `salary`, `dateOfJoining`, `createdAt`, `shift` | Whitelisted — any other value → `400`, never passed through to Prisma's `orderBy` directly. `department` sorts by the linked Department's `name`, and `designation` sorts by the linked Designation's `name`, each via a nested one-hop `orderBy` (a relation sort, not a column sort). **`employmentType` (added by the Employment Type domain, 2026-09-13) is a plain scalar sort** — `orderBy: { employmentType: order }` directly, no nested relation object, since it isn't a foreign key — the same shape as `salary`/`dateOfJoining`/`createdAt`, not the relation-sort shape `department`/`designation` use. **`shift` (added by the Shift domain, 2026-09-15) sorts by the linked Shift's `name`** — the same one-hop nested relation-sort shape as `department`/`designation`, not the plain-scalar shape `employmentType` uses. The query-string values stayed `department`/`designation`/`shift` for API stability even though the underlying fields are `departmentId`/`designationId`/`shiftId`. |
| `order`      | string | `desc`      | No       | `asc`, `desc`                                                    | Any other value → `400`.                                                                                                                                                     |

All filters (`departmentId`, `designationId`, `employmentType`, `managerId`,
`shiftId`) combine with **AND**; `search` contributes one **OR** block
across its four fields, itself ANDed with whatever filters are also
present. `shiftId` is **not** one of the fields `search` matches against
— it's an exact-match filter only, same as `managerId`.

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
      "departmentId": "adcb7061-89b8-427d-aa4c-b854cb79bfcc",
      "designationId": "5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7d",
      "employmentType": "FULL_TIME",
      "salary": "55000",
      "dateOfJoining": "2024-03-01T00:00:00.000Z",
      "managerId": null,
      "branchId": null,
      "shiftId": null,
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
| `400`  | Invalid `managerId`/`departmentId`/`designationId`/`shiftId` | Zod's UUID-format message                | Malformed UUID supplied                   |
| `400`  | Invalid `employmentType` filter value | Zod's enum message listing the 4 allowed values — same shape as `POST`/`PATCH`'s body-field error | **Added by the Employment Type domain (2026-09-13).** Any value outside `FULL_TIME`/`PART_TIME`/`CONTRACT`/`INTERN` |
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
| 6   | Search by department name (relation) | `?search=Sales`                        | `200`, only rows whose linked Department's name matches `Sales` |
| 7   | Search by designation name (relation) | `?search=Engineer`                     | `200`, only rows whose linked Designation's name matches `Engineer` |
| 8   | Search by linked user's name          | `?search=<a linked User's name>`       | `200`, matches via the `user.name` relation                  |
| 9   | Exact filter by departmentId          | `?departmentId=<a real Department id>` | `200`, only rows with that exact `departmentId`               |
| 10  | Exact filter by designationId         | `?designationId=<a real Designation id>` | `200`, only rows with that exact `designationId`             |
| 11  | Sort ascending vs. descending         | `?sortBy=salary&order=asc` / `...desc` | `200`, orders reversed between the two calls                 |
| 12  | Invalid `sortBy`                      | `?sortBy=notARealColumn`               | `400`                                                        |
| 13  | As `EMPLOYEE` token                   | _(any)_                                | `403`                                                        |
| 14  | No token                              | _(any)_                                | `401`                                                        |
| 15  | Exact filter by `employmentType`      | `?employmentType=INTERN`               | `200`, only rows with that exact `employmentType`             |
| 16  | Sort by `employmentType`, ascending vs. descending | `?sortBy=employmentType&order=asc` / `...desc` | `200`, a plain scalar sort — orders reversed between the two calls |
| 17  | Invalid `employmentType` filter value | `?employmentType=FREELANCER`           | `400`                                                        |
| 18  | Exact filter by `shiftId`             | `?shiftId=<a real Shift id>`           | `200`, only rows with that exact `shiftId`. **Added by the Shift domain (2026-09-15).** |
| 19  | Sort by `shift` (relation), ascending vs. descending | `?sortBy=shift&order=asc` / `...desc` | `200`, a nested relation sort by the linked Shift's `name` — orders reversed between the two calls. **Added by the Shift domain (2026-09-15).** |
| 20  | Invalid `shiftId` filter value        | `?shiftId=not-a-uuid`                  | `400`. **Added by the Shift domain (2026-09-15).** |

## 11. Negative Testing

| Scenario                                                                 | Expected                                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Wrong HTTP method (`POST /employees` with no body handled by this route) | `405`/routed to the `POST` handler instead, not this one — confirm the correct handler runs for each verb                       |
| Tampered/expired JWT                                                     | `401`                                                                                                                           |
| Attempting `?role=ADMIN` or similar query tampering                      | No effect — authorization reads `req.user.roles` from the verified token only                                                   |
| `?sortBy=deletedAt` or any real-but-unlisted column name                 | `400` — the whitelist rejects it before it ever reaches Prisma's `orderBy`, regardless of whether the column actually exists    |
| `?employmentType=FREELANCER` or any value outside the 4-item enum        | `400` — Zod's enum rejection, same shape as `POST`/`PATCH`'s body-field validation                                             |
| SQL injection attempt in `search`                                        | Treated as a literal string — Prisma's parameterized `contains`/`equals` neutralizes it; no query-structure risk                |
| Extremely long `search` string (10,000+ characters)                      | Currently accepted, no max length — a minor, honestly-acknowledged gap, same class as other unbounded-string fields in this API |
| Non-numeric `page`/`limit` (e.g. `?page=abc`)                            | `400` — Zod's `coerce.number()` fails, reported as a type-mismatch                                                              |

## 12. Edge Cases

| Scenario                                                                | Expected Behavior                                                                                                                                          |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No employees match the search/filters at all                            | `200`, `{ "employees": [], "pagination": { "total": 0, "totalPages": 0, ... } }` — not an error                                                            |
| `page` beyond the last page (e.g. `page=999` with only 2 real pages)    | `200`, `{ "employees": [] }` — an out-of-range page is simply an empty slice, not a `404`                                                                  |
| Multiple rows sharing the identical `sortBy` value (e.g. same `salary`) | The unconditional `id ASC` secondary sort breaks the tie deterministically — repeating the exact same request always returns the same order, verified live |
| All employees soft-deleted                                              | `200`, `{ "employees": [], "pagination": { "total": 0, ... } }` — soft-deleted rows are invisible to this endpoint, by design                              |
| An `Employee` with `userId: null` and an active `search` term           | Only ever matches via its linked Department's `name` or its linked Designation's `name` — the `user.name`/`user.email` branches simply never match a null relation, no error |
| An `Employee` matched via `sortBy=department`/`sortBy=designation`/`sortBy=shift` when two employees share the same Department/Designation/Shift | Same deterministic `id ASC` tiebreaker applies — nested relation sorts get the same tie-break guarantee as column sorts, verified live. `sortBy=shift` **added by the Shift domain (2026-09-15).** |
| `shiftId` filter combined with an `Employee` whose `shiftId` is `null` | Never matches a `?shiftId=<uuid>` filter — a `null` FK column can't equal any concrete UUID, same reasoning as `managerId`'s equivalent case. **Added by the Shift domain (2026-09-15).** |
| `sortBy=employmentType`, where only 4 distinct values exist across potentially many rows | Every row ties with several others on the primary sort key — the unconditional `id ASC` secondary sort does most of the actual ordering work here, more visibly than for higher-cardinality columns like `salary`, but the behavior itself is identical, not a special case |

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
  matches against `user.name`/`user.email`), `Department` (read, via
  relation join — whenever `search` is present, since it matches against
  the linked Department's `name`, and whenever `sortBy=department`),
  `Designation` (read, via relation join — whenever `search` is present,
  since it matches against the linked Designation's `name`, and whenever
  `sortBy=designation`), `Shift` (read, via relation join — only whenever
  `sortBy=shift`; unlike Department/Designation, `search` never matches
  against the linked Shift's `name` — **added by the Shift domain,
  2026-09-15**). `employmentType` (added by the Employment Type
  domain, 2026-09-13) never triggers an extra join — it's a plain column
  on `Employee` itself, not a relation. `shiftId` (added by the Shift
  domain, 2026-09-15), like `departmentId`/`designationId`/`managerId`,
  is an exact FK-column filter and never triggers a join by itself.
- **Rows affected**: none inserted/updated/deleted.
- **Queries per request**: two, run concurrently via `Promise.all` — one
  `findMany` (the page of results) and one `count` (the total across all
  matching pages). Not wrapped in a transaction — see the Performance
  Notes/Interview Notes below for why that's an accepted trade-off here.

## 15. Request Lifecycle

```
GET /api/v1/employees?search=...&departmentId=...&designationId=...&employmentType=...&shiftId=...&sortBy=...&order=...&page=...&limit=...
    ↓
authMiddleware
    ↓
requirePermission('employee:read:any')
    ↓ (403 if not granted)
validateMiddleware(listEmployeesQuerySchema, 'query')
    ↓ (400 on Zod failure; result lands on req.validatedQuery, not req.query)
employee.controller.list → employee.service.listEmployees(req.validatedQuery)
    ├─ buildEmployeeWhere({ search, departmentId, designationId, employmentType, managerId, shiftId })
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
  four fields, including joins to `User`, `Department`, and `Designation`
  — a sequential scan on all four tables at this data size; a future
  `pg_trgm` trigram index is the documented upgrade path if this table
  grows large enough for it to matter (not needed today).
- `departmentId`, `designationId`, and (**added by the Shift domain,
  2026-09-15**) `shiftId` are all **exact, indexed** matches
  (`@@index([departmentId])`, `@@index([designationId])`,
  `@@index([shiftId])`) — no unindexed exact-match filter remains on
  Employee after the Shift migration. `Employee.userId` and
  `Employee.managerId` already have indexes from Feature 9.
- `sortBy=department`/`sortBy=designation`/`sortBy=shift` are each a
  nested one-hop relation sort (`orderBy: { department: { name: order } }`,
  `orderBy: { designation: { name: order } }`, `orderBy: { shift: { name:
  order } }`) rather than a direct column sort — one extra join, not a
  separate query; no measurable difference at current scale. `sortBy=shift`
  **added by the Shift domain (2026-09-15)**.
- **`employmentType` (added by the Employment Type domain, 2026-09-13) is
  a plain scalar filter/sort** — `where.employmentType = employmentType` /
  `orderBy: { employmentType: order }` directly on `Employee`, no join at
  all, structurally cheaper than `departmentId`/`designationId`'s FK
  matches. It has **no `@@index`** — a deliberate omission, not an
  oversight: with only 4 possible values, a B-tree index has poor
  selectivity (each value matches roughly a quarter of all rows) and
  Postgres's planner would likely ignore it in favor of a sequential scan
  anyway at any realistic table size; revisit only if this table grows
  large enough for a value distribution to make an index worthwhile.
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

# Exact filter by departmentId, and a relation sort by department name
curl -i "http://localhost:3000/api/v1/employees?departmentId=$DEPARTMENT_ID&sortBy=department&order=asc" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Exact filter by designationId, and a relation sort by designation name
curl -i "http://localhost:3000/api/v1/employees?designationId=$DESIGNATION_ID&sortBy=designation&order=asc" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Exact filter by employmentType, and a plain scalar sort by employmentType
curl -i "http://localhost:3000/api/v1/employees?employmentType=INTERN&sortBy=employmentType&order=asc" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Exact filter by shiftId, and a relation sort by shift name (added by the Shift domain, 2026-09-15)
curl -i "http://localhost:3000/api/v1/employees?shiftId=$SHIFT_ID&sortBy=shift&order=asc" \
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
- ✅ `400` on `page < 1`, `limit < 1`, `limit > 100`, invalid `sortBy`/`order`/`managerId`/`departmentId`/`designationId`/`employmentType`/`shiftId`
- ✅ Empty `search=` behaves identically to no `search`
- ✅ `search` matches the linked Department's name, the linked Designation's name, and the linked `User`'s name/email (never the linked Shift's name)
- ✅ `departmentId` exact filter; `designationId` exact filter; `employmentType` exact filter (plain scalar, no relation); `shiftId` exact filter (indexed FK match). **`shiftId` added by the Shift domain (2026-09-15).**
- ✅ Sort order actually reverses between `asc`/`desc`, including
  `sortBy=department`'s, `sortBy=designation`'s, and `sortBy=shift`'s
  relation sorts and `sortBy=employmentType`'s plain scalar sort;
  repeated identical calls return identical ordering (stability)
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
    "departmentId": "c74add11-d421-429d-b46c-a118fc5f817d",
    "designationId": "5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7d",
    "salary": "75000",
    "dateOfJoining": "2024-01-15T00:00:00.000Z",
    "managerId": null,
    "branchId": null,
    "shiftId": null,
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
  "departmentId": "0b680ff5-4d81-43e5-9744-279211adcf03",
  "salary": 82000
}
```

**`userId`/`managerId`/`branchId`/`shiftId` additionally accept explicit
`null`** (widened beyond `createEmployeeSchema`'s own `.optional()`-only
rule for these four fields — `shiftId` **added by the Shift domain,
2026-09-15**, the identical widening `branchId` already went through) —
this is the only way to *clear* an existing link. Omitting the key
entirely means "leave it as-is"; sending `null` means "unset it":

```json
{ "userId": null }
```

**`departmentId`, `designationId`, and (as of the Employment Type domain,
2026-09-13) `employmentType` are the exceptions — none of the three
accepts `null`.** Unlike `userId`/`managerId`/`branchId`/`shiftId`, Department and
Designation are both mandatory (docs/domain-department.md ADR-D07,
docs/domain-designation.md ADR-DS07), and Employment Type is mandatory for
a different reason — it's not an FK at all, it's a closed enum with no
"unassigned" state (docs/domain-employment-type.md ADR-ET02): omitting the
key means "leave the current value as-is"; a new value is re-validated
(for `departmentId`/`designationId`) against the same assignability check
as creation, or (for `employmentType`) against the same 4-value enum
check as creation; but `{ "departmentId": null }`, `{ "designationId":
null }`, or `{ "employmentType": null }` all fail Zod's validation —
`departmentId: Invalid input: expected string, received null` /
`designationId: Invalid input: expected string, received null` /
`employmentType: Invalid option: expected one of "FULL_TIME"|"PART_TIME"|"CONTRACT"|"INTERN"`
— since there is no valid "employee has no department"/"employee has no
designation"/"employee has no employment type" state to represent. A
**conversion** (e.g. `INTERN` → `FULL_TIME`) is fully supported and
requires no special handling — just send the new value, same as any other
scalar field change:

```json
{ "employmentType": "FULL_TIME" }
```

## 7. Validation Rules

Same per-field rules as `POST /employees` (Section 7 there), applied only
to whichever fields are present. Additional business rules, checked in
the service:

- **`managerId` cannot equal the record's own `id`** — an employee cannot
  be their own manager. Verified live: `400`,
  `"An employee cannot be their own manager"`.
- **`branchId`, when being set to a non-null value, is re-validated
  against the same assignability check as creation** (must exist and be
  `ACTIVE`) — added by the Branch domain (2026-09-13), verified live.
  Setting `branchId: null` (clearing it) skips this check entirely, since
  there's nothing to validate.
- **`shiftId`, when being set to a non-null value, is re-validated
  against the same assignability check as creation** (must exist and be
  `ACTIVE`, via `shiftService.assertShiftAssignable`) — added by the
  Shift domain (2026-09-15), the identical shape as `branchId`'s own
  re-validation, verified live. Setting `shiftId: null` (clearing it)
  skips this check entirely, since there's nothing to validate.
- **`designationId`, when present, is re-validated against the same
  assignability check as creation** (must exist and be `ACTIVE`) — added
  by the Designation domain (2026-09-13), same shape as `departmentId`'s
  re-validation. Unlike `branchId`, there is no "clear it" path, since
  `designationId` cannot be `null` (see §6 above).
- **`employmentType`, when present, is re-validated by the same Zod
  `z.enum([...])` check as creation** — added by the Employment Type
  domain (2026-09-13). Unlike `departmentId`/`designationId`, there is
  **no service-layer business-rule check at all** for a new
  `employmentType` value: it's a closed, code-defined enum, not an FK, so
  Zod's enum validation is the entire guard, both on create and on
  update. A conversion (e.g. `INTERN` → `FULL_TIME`) is otherwise treated
  as an ordinary field change — no extra business rule, no cycle/history
  check. Unlike `branchId` (which **can** be nulled to clear the link),
  `employmentType` joins `departmentId`/`designationId` in having no
  "clear it" path at all — there is no valid unset state for it (see §6).

## 8. Successful Response

```
200 OK

{
  "employee": {
    "id": "954690da-d433-4b7e-9e04-1c7be03c36bd",
    "userId": "283a2b17-b05d-49aa-8915-d58c5658f2bb",
    "departmentId": "0b680ff5-4d81-43e5-9744-279211adcf03",
    "designationId": "5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7d",
    "employmentType": "FULL_TIME",
    "salary": "82000",
    "dateOfJoining": "2024-01-15T00:00:00.000Z",
    "managerId": null,
    "branchId": null,
    "shiftId": null,
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
| `400`  | `departmentId: null`                     | `"departmentId: Invalid input: expected string, received null"` | departmentId is mandatory — unlike `userId`/`managerId`/`branchId`, it cannot be cleared, verified live via Zod directly |
| `400`  | `designationId: null`                    | `"designationId: Invalid input: expected string, received null"` | designationId is mandatory — same reasoning as `departmentId`, cannot be cleared, verified live via Zod directly |
| `400`  | `employmentType: null`                   | `"employmentType: Invalid option: expected one of "FULL_TIME"\|"PART_TIME"\|"CONTRACT"\|"INTERN""` | **Added by the Employment Type domain (2026-09-13).** employmentType is mandatory — same reasoning as `departmentId`/`designationId`, cannot be cleared; identical message to a missing/invalid value, since Zod's enum validation doesn't distinguish any of the three cases. Verified live. |
| `400`  | New `departmentId` doesn't exist or is inactive | Same messages as `POST /employees`               | Re-validated on every change, not just at creation                     |
| `400`  | New `designationId` doesn't exist or is inactive | Same messages as `POST /employees`              | Re-validated on every change, not just at creation                     |
| `400`  | New `shiftId` doesn't exist or is inactive | Same messages as `POST /employees`              | **Added by the Shift domain (2026-09-15).** Re-validated on every non-null change, not just at creation — same shape as `branchId`'s equivalent |
| `400`  | New `employmentType` not one of the 4 allowed values | Same message as `POST /employees`           | **Added by the Employment Type domain (2026-09-13).** Re-validated on every change, not just at creation — but purely a Zod enum check, no service-layer existence/status check (it isn't an FK) |
| `400`  | Invalid field value(s)                   | Same per-field messages as `POST /employees`          | e.g. negative salary, future date, malformed UUID                      |
| `401`  | No/invalid/expired access token          | Same as every other protected endpoint                | `authMiddleware` failure                                               |
| `403`  | Roles don't grant `employee:update:any`  | `"You do not have permission to perform this action"` | Any `EMPLOYEE`, or a `MANAGER`/`ADMIN` role misconfigured in seed data |
| `404`  | No such record, or it's soft-deleted     | `"Employee not found"`                                | Invalid/nonexistent/deleted `id`                                       |

## 10. Postman Test Cases

| #   | Case                               | Body                                            | Expected                |
| --- | ---------------------------------- | ----------------------------------------------- | ----------------------- |
| 1   | Valid partial update               | `{"departmentId":"<a real, active Department id>"}` | `200`                   |
| 2   | Self-management (`managerId = id`) | `{"managerId":"<same id>"}`                     | `400`                   |
| 3   | Nonexistent `id`                   | `{"salary":90000}`                              | `404`                   |
| 4   | As `EMPLOYEE` token                | Any body                                        | `403`                   |
| 5   | Empty body `{}`                    | Valid — no fields required for a partial update | `200`, no fields change |
| 6   | `departmentId: null`               | `{"departmentId":null}`                         | `400` — mandatory, cannot be cleared |
| 7   | Nonexistent/inactive `departmentId` | `{"departmentId":"<bad or inactive id>"}`      | `400`                   |
| 8   | `designationId: null`              | `{"designationId":null}`                        | `400` — mandatory, cannot be cleared |
| 9   | Nonexistent/inactive `designationId` | `{"designationId":"<bad or inactive id>"}`    | `400`                   |
| 10  | Conversion, `INTERN` → `FULL_TIME` | `{"employmentType":"FULL_TIME"}` (on a record currently `INTERN`) | `200`, `employee.employmentType: "FULL_TIME"` |
| 11  | `employmentType: null`             | `{"employmentType":null}`                       | `400` — mandatory, cannot be cleared, verified live |
| 12  | Invalid `employmentType`           | `{"employmentType":"FREELANCER"}`               | `400` — same message as test 11         |
| 13  | Assign a valid, `ACTIVE` `shiftId` | `{"shiftId":"<a real, active Shift id>"}`       | `200` — verified live. **Added by the Shift domain (2026-09-15).** |
| 14  | Nonexistent/inactive `shiftId`     | `{"shiftId":"<bad or inactive id>"}`            | `400` — verified live. **Added by the Shift domain (2026-09-15).** |
| 15  | Unassign via `{"shiftId": null}`   | `{"shiftId":null}`                              | `200`, `employee.shiftId` becomes `null` — verified live. **Added by the Shift domain (2026-09-15).** |

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
| Sending `{"userId": null}` (or `managerId`) to clear an existing link | `200` — the column is set to `NULL`. Verified live: linked a real `Employee` to a `User`, sent `{"userId": null}`, confirmed the response and a fresh `GET` both show `userId: null`. Omitting the key instead of sending `null` leaves the previous value untouched — the two are not equivalent. |
| Converting `employmentType` (e.g. `INTERN` → `FULL_TIME`) | `200` — treated as an ordinary scalar field change, no special-cased "conversion" endpoint or business rule. **Added by the Employment Type domain (2026-09-13)**: verified live, including that the resulting `AuditLog` `UPDATE` row's `beforeData`/`afterData` both correctly reflect the old/new `employmentType` value. |
| Sending `{"shiftId": null}` to clear an existing assignment | `200` — the column is set to `NULL`, identical mechanics to `branchId`'s own clear-via-null case (§6/§12 above). **Added by the Shift domain (2026-09-15)**: verified live. Omitting the key instead leaves the previous value untouched. |
| Deactivating a `Shift` that is still assigned to an Employee via `PATCH /shifts/:id` | This Employee's `shiftId` link is **untouched** — verified live; deactivation only blocks *future* assignment of that shift to any employee, mirroring Branch's/Holiday Calendar's own deactivation semantics. **Added by the Shift domain (2026-09-15).** |

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
- **`employmentType` conversions require zero new audit code** — added by
  the Employment Type domain (2026-09-13). A `PATCH` changing
  `employmentType` flows through the exact same `AuditLog` write path as
  every other Employee field change (`AUDIT_ENTITY_TYPES.EMPLOYEE`,
  `action: 'UPDATE'`, full before/after `Employee` state) — verified live.
  No Employee-field audit gap exists for `employmentType`.
- **`shiftId` assignment adds a read of `Shift`** when set to a non-null
  value (the assignability check — added by the Shift domain,
  2026-09-15), the identical pattern as `branchId`'s equivalent check. No
  extra read when clearing via `shiftId: null`.

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
  -d '{"departmentId":"'"$DEPARTMENT_ID"'","salary":82000}'

# Employment Type conversion (e.g. INTERN -> FULL_TIME)
curl -i -X PATCH http://localhost:3000/api/v1/employees/$EMPLOYEE_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"employmentType":"FULL_TIME"}'

# Assign a shift (added by the Shift domain, 2026-09-15)
curl -i -X PATCH http://localhost:3000/api/v1/employees/$EMPLOYEE_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"shiftId":"'"$SHIFT_ID"'"}'

# Unassign it again via explicit null (added by the Shift domain, 2026-09-15)
curl -i -X PATCH http://localhost:3000/api/v1/employees/$EMPLOYEE_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"shiftId":null}'
```

## 19. Postman Collection Notes

Same `{{accessToken}}`/`{{employeeId}}` variables as the other Employee
endpoints.

## 20. Testing Checklist

- ✅ Valid partial update (single field, multiple fields, empty body)
- ✅ `400` on self-management (`managerId = id`)
- ✅ `400` on `departmentId: null` (mandatory, cannot be cleared) — verified via Zod directly
- ✅ `400` on `designationId: null` (mandatory, cannot be cleared) — verified via Zod directly
- ✅ `400` on `employmentType: null` (mandatory, cannot be cleared) — verified via Zod directly
- ✅ New `departmentId`/`designationId` re-validated for existence + `ACTIVE` status
- ✅ New `employmentType` re-validated against the 4-value enum (no existence/status check — not an FK)
- ✅ Conversion success (e.g. `employmentType`: `INTERN` → `FULL_TIME`)
- ✅ `404` on nonexistent/soft-deleted record
- ✅ `403` as `EMPLOYEE`, `401` with no token
- ✅ Only `updatedAt` changes among timestamps
- ✅ `employmentType` change produces a normal `AuditLog` `UPDATE` row (full before/after state) — verified live
- ✅ New `shiftId` re-validated for existence + `ACTIVE` status (verified live). **Added by the Shift domain (2026-09-15).**
- ✅ `shiftId: null` clears an existing assignment (verified live); deactivating an assigned `Shift` leaves the Employee link untouched
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

---

---

# 19. `POST /branches`

## 1. Endpoint Information

```
Feature:            Branch Domain (2026-09-13, feature/15-branch-domain)
Endpoint:           Create Branch
Description:        Creates a new physical/legal work location
Method:             POST
URL:                /api/v1/branches
API Version:        v1
Module:             modules/branches
Authentication:     Yes (Bearer access token)
Authorization:      `branch:create` permission required (ADMIN only, as seeded)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: closes a named gap in `docs/domain-branch.md` —
  `Employee.department`/`jobTitle` were, at the time, plain free-text
  strings with no location concept anywhere in the schema. (Both have
  since become governed FKs of their own — `departmentId` and
  `designationId` — see endpoints 24 and 29.)
- **Business problem solved**: lets an organization model more than one
  work location as real, referenceable data instead of a free-text field.
- **Expected callers**: `ADMIN` only — deliberately tighter than
  `employee:*`, where `MANAGER` has parity with `ADMIN` (see ADR-B07).

## 3. Request Headers

| Header                                | Required | Notes                                       |
| -------------------------------------- | -------- | -------------------------------------------- |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `branch:create` permission |
| `Content-Type: application/json`      | **Yes**  |                                              |

## 4. Path Parameters

None.

## 5. Query Parameters

None.

## 6. Request Body

```json
{
  "name": "Bengaluru HQ",
  "code": "BLR-01",
  "holidayCalendarId": "f1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
}
```

| Field               | Type   | Required | Description                                             |
| ------------------- | ------ | -------- | -------------------------------------------------------- |
| `name`              | string | **Yes**  | Trimmed, non-empty, unique across all branches            |
| `code`              | string | No       | Trimmed, non-empty when provided, unique when provided    |
| `holidayCalendarId` | string (UUID) | No | **Added by the Holiday Calendar domain (2026-09-13).** Optional — omit entirely for "no holidays applied." When provided, must reference an existing `HolidayCalendar` whose `status` is `ACTIVE`. |

## 7. Validation Rules

- `name`: required, `.trim().min(1)` — a whitespace-only value fails.
- `code`: optional; when present, `.trim().min(1)` — same whitespace rule.
- `status` is **not** accepted at creation — every new branch starts
  `ACTIVE` (`BranchStatus` default in `schema.prisma`); status can only be
  changed afterward via `PATCH /branches/:id`.
- `holidayCalendarId`: optional (`.optional()` only, not nullable — same
  shape as `code`, unlike its widened `.nullable().optional()` form on
  `PATCH`, see endpoint 22). When present, it's validated by
  `holidayCalendarService.assertHolidayCalendarAssignable` — the exact
  same positive-allowlist pattern already used for `branchId`/
  `departmentId`/`designationId` on Employee (ADR-B06/D06/DS06's shape,
  reused here with Branch as the consumer instead of Employee):
  - the referenced `HolidayCalendar` must exist, else
    `400 "holidayCalendarId: references a record that does not exist"`;
  - it must additionally be `status: "ACTIVE"`, else
    `400 "holidayCalendarId: this holiday calendar is not active and cannot be assigned"`.
  A raw foreign-key violation (Prisma `P2003` — the race-condition case
  where the calendar is deleted between the check and the insert) is also
  translated to the same "does not exist" `400`, never a raw `500`.

## 8. Successful Response

```
201 Created

{
  "branch": {
    "id": "c42c7743-72d5-4839-8f88-e3f87e9954f2",
    "name": "Bengaluru HQ",
    "code": "BLR-01",
    "status": "ACTIVE",
    "holidayCalendarId": "f1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "createdAt": "2026-09-13T09:54:38.817Z",
    "updatedAt": "2026-09-13T09:54:38.817Z"
  }
}
```

Verified live against the real dev server, including the
`holidayCalendarId`-assigned case above; `holidayCalendarId` is `null`
when omitted (**added by the Holiday Calendar domain, 2026-09-13** — every
Branch response now includes this field).

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                | When                                                                 |
| ------ | ------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `400`  | Validation failed                   | e.g. `"name: Branch name is required"`                | Empty/whitespace-only `name`                                          |
| `400`  | `holidayCalendarId` does not reference an existing record | `"holidayCalendarId: references a record that does not exist"` | **Added by the Holiday Calendar domain (2026-09-13).** Nonexistent id, verified live |
| `400`  | `holidayCalendarId` references an `INACTIVE` calendar | `"holidayCalendarId: this holiday calendar is not active and cannot be assigned"` | **Added by the Holiday Calendar domain (2026-09-13).** Verified live |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                | `authMiddleware` failure                                              |
| `403`  | Caller lacks `branch:create`         | `"You do not have permission to perform this action"` | `EMPLOYEE` or `MANAGER` token — verified live                          |
| `409`  | Duplicate `name` or `code`           | `"A branch with this name or code already exists"`     | Verified live: creating the same `name` twice returns `409` on the 2nd |

## 10. Postman Test Cases

| #   | Case                              | Expected |
| --- | ---------------------------------- | -------- |
| 1   | Valid create, `name` only          | `201`    |
| 2   | Valid create, `name` + `code`      | `201`    |
| 3   | Duplicate `name`                  | `409`    |
| 4   | Duplicate `code`, different `name` | `409`    |
| 5   | Empty/whitespace `name`            | `400`    |
| 6   | As `MANAGER`/`EMPLOYEE` token       | `403`    |
| 7   | No token                          | `401`    |
| 8   | Valid create with an `ACTIVE` `holidayCalendarId` | `201` — verified live. **Added by the Holiday Calendar domain (2026-09-13).** |
| 9   | Create with a nonexistent `holidayCalendarId`     | `400` — verified live. **Added by the Holiday Calendar domain (2026-09-13).** |
| 10  | Create with an `INACTIVE` `holidayCalendarId`     | `400` — verified live. **Added by the Holiday Calendar domain (2026-09-13).** |

## 11. Negative Testing

| Scenario                          | Expected                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Malformed JSON body                | `400` from Express's own JSON body-parser, before this route's handler runs |
| Tampered/expired JWT               | `401`                                                                       |
| `name`/`code` as a number/array   | `400` — Zod's `.string()` rejects non-string types                          |
| Extremely long `name` (thousands of chars) | Not separately bounded by an explicit max-length rule today — a known, undemonstrated gap, not verified live in this pass |
| `holidayCalendarId` not a valid UUID | `400` — Zod's `.uuid()` rejects malformed values. **Added by the Holiday Calendar domain (2026-09-13).** |

## 12. Edge Cases

| Scenario                                                        | Expected Behavior                                                                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent creates with the same `name`                          | One succeeds, the other gets `409` — the pre-check can be beaten by a race, but the database's own unique constraint on `name`/`code` is the real guarantee (same pattern as Employee's `userId` uniqueness), translated from Prisma's `P2002` |
| `code` omitted entirely                                          | Stored as `null` — no uniqueness conflict with other branches that also have no `code`                                                                |
| `holidayCalendarId` omitted entirely                             | Stored as `null` — "no holidays applied," never an error (ADR-HC03's positive-allowlist framing extended to Branch itself). **Added by the Holiday Calendar domain (2026-09-13).** |

## 13. Security Testing

- **Authorization**: confirm `MANAGER` cannot create a branch — verified
  live. This is a deliberate departure from Employee's scoping, where
  `MANAGER` has full parity with `ADMIN`.
- **Mass assignment**: only `name`/`code`/`holidayCalendarId` are read
  from the body — Zod's schema strips anything else (e.g. an attempted
  `status: "ACTIVE"` or `id` in the body is silently ignored, not
  applied).

## 14. Database Impact

- **Tables affected**: `Branch` (insert), `AuditLog` (insert), plus a read
  of `HolidayCalendar` when `holidayCalendarId` is provided (the
  assignability check — **added by the Holiday Calendar domain,
  2026-09-13**).
- **Transactions**: the `Branch` insert and the `AuditLog` insert happen
  inside one `prisma.$transaction` — same pattern as Employee's mutations.
  The `holidayCalendarId` assignability check runs **before** this
  transaction, same ordering as the name/code duplicate pre-check.

## 15. Request Lifecycle

```
POST /api/v1/branches
    ↓
authMiddleware
    ↓
requirePermission('branch:create')
    ↓ (403 if not granted)
validateMiddleware(createBranchSchema)
    ↓ (400 if invalid)
branch.controller.create → branch.service.createBranch(data, actor)
    ├─ branchRepository.findByNameOrCode(name, code) → existing → 409
    ├─ (if holidayCalendarId provided) holidayCalendarService.assertHolidayCalendarAssignable(holidayCalendarId) → 400 if missing/inactive
    └─ prisma.$transaction:
         ├─ branchRepository.create(data, tx)
         └─ auditLogRepository.create({ action: 'CREATE', afterData, ... }, tx)
    ↓
201 { branch }
```

## 16. Performance Notes

Two indexed lookups (name/code uniqueness pre-check), plus one more
indexed lookup when `holidayCalendarId` is provided (the assignability
check — **added by the Holiday Calendar domain, 2026-09-13**), plus one
insert plus one audit-log insert in the same transaction — no notable
performance concerns at current scale.

## 17. Interview Notes

- **Q: Why is `code` optional but `name` required?** `name` is the
  human-facing identifier that must always exist; `code` is a
  recommended-but-not-mandatory addition anticipating Payroll/reporting's
  likely future need for a stable identifier distinct from the
  human-editable display name (`docs/domain-branch.md §3`).
- **Q: Why `ADMIN`-only here when Employee mutations allow `MANAGER`
  too?** Branch is foundational org-structure master data shared
  system-wide — a mistake here has a wider blast radius than a single
  Employee record (ADR-B07).
- **Q: Why does `holidayCalendarId` reuse `branchId`'s exact
  assignability-check shape instead of something new?** **Added by the
  Holiday Calendar domain (2026-09-13).** Consistency — every FK-style
  optional/mandatory assignment field introduced so far (`branchId`,
  `departmentId`, `designationId` on Employee) already follows the same
  "exists + `ACTIVE`" positive-allowlist check, returning the same
  `field: references a record that does not exist` / `field: this <thing>
  is not active and cannot be assigned` message shape. `holidayCalendarId`
  is simply the first case where Branch is the *consumer* of this pattern
  rather than only ever being its subject.

## 18. cURL Examples

```bash
curl -i -X POST http://localhost:3000/api/v1/branches \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Bengaluru HQ","code":"BLR-01"}'
```

```bash
# With an optional holidayCalendarId (added by the Holiday Calendar domain, 2026-09-13)
curl -i -X POST http://localhost:3000/api/v1/branches \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Bengaluru HQ","code":"BLR-01","holidayCalendarId":"'"$HOLIDAY_CALENDAR_ID"'"}'
```

## 19. Postman Collection Notes

Save the returned `branch.id` as `{{branchId}}` — used by every other
Branch endpoint and by `POST /employees`'s `branchId` field. Save
`{{holidayCalendarId}}` from `POST /holiday-calendars` (endpoint 34)
beforehand if exercising the assignment cases.

## 20. Testing Checklist

- ✅ Valid create (with and without `code`) → `201`
- ✅ Duplicate `name` → `409`
- ✅ Empty/whitespace `name` → `400`
- ✅ `403` as `MANAGER`/`EMPLOYEE`, `401` with no token
- ✅ `AuditLog` row created with correct `beforeData: null`/`afterData`
- ✅ Valid create with an `ACTIVE` `holidayCalendarId` → `201`, field echoed back (verified live). **Added by the Holiday Calendar domain (2026-09-13).**
- ✅ Nonexistent `holidayCalendarId` → `400` (verified live)
- ✅ `INACTIVE` `holidayCalendarId` → `400` (verified live)
- ✅ `holidayCalendarId` omitted → stored/returned as `null`

---

---

# 20. `GET /branches`

## 1. Endpoint Information

```
Feature:            Branch Domain (2026-09-13, feature/15-branch-domain)
Endpoint:           List Branch records
Description:        Paginated, searchable, filterable, sortable list of branches
Method:             GET
URL:                /api/v1/branches
API Version:        v1
Module:             modules/branches
Authentication:     Yes (Bearer access token)
Authorization:      `branch:read` permission (granted to ADMIN, MANAGER, EMPLOYEE)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: lets any authenticated user browse/search branches —
  needed for admin management screens and for populating a branch picker
  when creating/updating an Employee.
- **Business problem solved**: discoverability of existing branches
  without a dedicated admin UI reading the database directly.
- **Expected callers**: every role — `branch:read` is deliberately broad,
  since Branch is non-sensitive reference data. (`jobTitle` was, at the
  time this was written, still a plain visible field on Employee for the
  same reason; both `department` and `jobTitle` have since become
  governed FKs — `departmentId` with its own identical `department:read`
  grant (endpoint 25) and `designationId` with its own identical
  `designation:read` grant (endpoint 30) — extending, not contradicting,
  this same reasoning.)

## 3. Request Headers

| Header                               | Required | Notes                                      |
| -------------------------------------- | -------- | -------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to the `branch:read` permission |

## 4. Path Parameters

None.

## 5. Query Parameters

| Name      | Type    | Required | Default     | Description                              |
| ----------- | ------- | -------- | ------------- | ------------------------------------------- |
| `page`    | integer | No       | `1`         | 1-indexed page number                     |
| `limit`   | integer | No       | `10` (max 100) | Page size                                |
| `search`  | string  | No       | —           | Matches `name` and `code` (case-insensitive) |
| `status`  | enum    | No       | —           | `ACTIVE` or `INACTIVE`                    |
| `sortBy`  | enum    | No       | `createdAt` | `name`, `code`, `status`, `createdAt`     |
| `order`   | enum    | No       | `desc`      | `asc` or `desc`                           |

## 6. Request Body

None.

## 7. Validation Rules

Same shape as `GET /employees`'s `listEmployeesQuerySchema` (`limit`
capped at 100, `sortBy` restricted to an allowlist, `page`/`limit`
coerced from query strings to integers).

## 8. Successful Response

```
200 OK

{
  "branches": [
    {
      "id": "c42c7743-72d5-4839-8f88-e3f87e9954f2",
      "name": "Bengaluru HQ",
      "code": "BLR-01",
      "status": "ACTIVE",
      "holidayCalendarId": null,
      "createdAt": "2026-09-13T09:54:38.817Z",
      "updatedAt": "2026-09-13T09:54:38.817Z"
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

Verified live, including `search` matching a branch by partial name.
`holidayCalendarId` (nullable) is present on every Branch object as of
the Holiday Calendar domain (2026-09-13) — this list endpoint's own
`GET`/`Query Parameters` shape is otherwise unchanged (no
`holidayCalendarId` filter exists in `listBranchesQuerySchema`).

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                  | When                                       |
| ------ | ------------------------------------ | -------------------------------------------------------- | --------------------------------------------- |
| `400`  | A query parameter failed validation | e.g. `"limit: Too big: expected number to be <=100"`      | Out-of-bounds `limit`, invalid `sortBy`/`status` |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                  | `authMiddleware` failure                   |
| `403`  | Caller lacks `branch:read`          | `"You do not have permission to perform this action"`   | Not expected in practice — every seeded role has this grant |

## 10. Postman Test Cases

| #   | Case                          | Expected |
| --- | -------------------------------- | -------- |
| 1   | Default pagination              | `200`, up to 10 results |
| 2   | `search` matches an existing branch | `200`, filtered results |
| 3   | `status=INACTIVE` filter         | `200`, only inactive branches |
| 4   | `sortBy=name&order=asc`          | `200`, alphabetical      |
| 5   | `limit=101`                     | `400`    |
| 6   | As any authenticated role (ADMIN/MANAGER/EMPLOYEE) | `200` — verified live for both ADMIN and EMPLOYEE |
| 7   | No token                        | `401`    |

## 11. Negative Testing

| Scenario                        | Expected                                                   |
| ----------------------------------- | -------------------------------------------------------------- |
| `sortBy` value outside the allowlist | `400`                                                          |
| `status` value outside the enum    | `400`                                                          |
| Tampered/expired JWT               | `401`                                                          |

## 12. Edge Cases

| Scenario                             | Expected Behavior                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `page` beyond the last page             | `200` with an empty `branches` array, not an error — same convention as `GET /employees`                    |
| Two branches with identical `createdAt` (unlikely but possible) | Deterministic ordering via the unconditional secondary `id ASC` tiebreaker, same pattern as Employees/Users |

## 13. Security Testing

- **Authorization**: `branch:read` is intentionally broad — there is no
  `:own` scope for Branch (unlike Employee), since a branch has no
  concept of ownership by a specific user. Confirmed no BOLA concern
  arises from this, since there's nothing to leak beyond the branch's own
  (non-sensitive) fields.

## 14. Database Impact

Read-only — `Branch.findMany` + `Branch.count`, run in parallel via
`Promise.all` (same pattern as Employees/Users list endpoints), not a
`$transaction`.

## 15. Request Lifecycle

```
GET /api/v1/branches
    ↓
authMiddleware
    ↓
requirePermission('branch:read')
    ↓ (403 if not granted)
validateMiddleware(listBranchesQuerySchema, 'query')
    ↓ (400 if invalid)
branch.controller.list → branch.service.listBranches(query)
    └─ Promise.all([branchRepository.findAll(...), branchRepository.count(...)])
    ↓
200 { branches, pagination }
```

## 16. Performance Notes

Two parallel indexed queries; branch counts are expected to be modest
(`docs/domain-branch.md §8` — tens, not tens of thousands), so pagination
exists for consistency with the rest of the API rather than a demonstrated
scale problem today.

## 17. Interview Notes

- **Q: Why does `EMPLOYEE` get `branch:read` when it doesn't get
  `employee:read:any`?** Branch is non-sensitive reference data with no
  ownership dimension — there's no equivalent of "read your own branch
  only" the way Employee has `:own`, so the simplest correct grant is
  read access for everyone.

## 18. cURL Examples

```bash
curl -s "http://localhost:3000/api/v1/branches?search=Bengaluru&status=ACTIVE" \
  -H "Authorization: Bearer $ANY_ROLE_TOKEN"
```

## 19. Postman Collection Notes

Run after `POST /branches` to confirm the created branch is discoverable
via `search`.

## 20. Testing Checklist

- ✅ Default pagination, explicit `page`/`limit`
- ✅ `search` across `name`/`code`
- ✅ `status` filter
- ✅ Sort both directions with deterministic tiebreaker
- ✅ `200` for ADMIN and EMPLOYEE tokens alike (verified live)
- ✅ `400` on out-of-bounds `limit`

---

---

# 21. `GET /branches/:id`

## 1. Endpoint Information

```
Feature:            Branch Domain (2026-09-13, feature/15-branch-domain)
Endpoint:           Get one Branch record
Method:             GET
URL:                /api/v1/branches/:id
API Version:        v1
Module:             modules/branches
Authentication:     Yes (Bearer access token)
Authorization:      `branch:read` permission (granted to every role)
Public/Protected:   Protected
```

## 2. Purpose

Fetch a single branch's current details, e.g. to populate an edit form.

## 3. Request Headers

| Header                               | Required | Notes                                      |
| -------------------------------------- | -------- | -------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to the `branch:read` permission |

## 4. Path Parameters

| Name | Type          | Required | Description       |
| ---- | ------------- | -------- | -------------------- |
| `id` | string (UUID) | **Yes**  | The Branch record's id |

## 5. Query Parameters

None.

## 6. Request Body

None.

## 7. Validation Rules

No body — only the permission check and the record's existence.

## 8. Successful Response

```
200 OK

{
  "branch": {
    "id": "c42c7743-72d5-4839-8f88-e3f87e9954f2",
    "name": "Bengaluru HQ",
    "code": "BLR-01",
    "status": "ACTIVE",
    "holidayCalendarId": null,
    "createdAt": "2026-09-13T09:54:38.817Z",
    "updatedAt": "2026-09-13T09:54:53.078Z"
  }
}
```

Verified live. `holidayCalendarId` (nullable) is present as of the
Holiday Calendar domain (2026-09-13).

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                | When                              |
| ------ | ------------------------------------ | ---------------------------------------------------------- | ------------------------------------ |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                  | `authMiddleware` failure           |
| `403`  | Caller lacks `branch:read`           | `"You do not have permission to perform this action"`   | Not expected in practice           |
| `404`  | No such branch                      | `"Branch not found"`                                    | Invalid/nonexistent `id`, verified live |

## 10. Postman Test Cases

| #   | Case             | Expected |
| --- | ------------------ | -------- |
| 1   | Existing `id`      | `200`    |
| 2   | Nonexistent `id`   | `404`    |
| 3   | No token           | `401`    |

## 11. Negative Testing

| Scenario                   | Expected |
| ----------------------------- | -------- |
| Malformed (non-UUID) `id`     | `404` — same as every other endpoint taking `id` in the path |
| Tampered/expired JWT          | `401`    |

## 12. Edge Cases

None beyond the standard existence check — Branch has no soft-delete
concept, so there is no "exists but deleted" state to distinguish (unlike
Employee's `deletedAt`).

## 13. Security Testing

No BOLA concern — Branch has no ownership dimension; every grant of
`branch:read` sees identical data regardless of who's asking.

## 14. Database Impact

Read-only — single indexed `Branch.findUnique`.

## 15. Request Lifecycle

```
GET /api/v1/branches/:id
    ↓
authMiddleware
    ↓
requirePermission('branch:read')
    ↓ (403 if not granted)
branch.controller.getById → branch.service.getBranchById(id)
    └─ branchRepository.findById(id) → not found → 404
    ↓
200 { branch }
```

## 16. Performance Notes

Single indexed lookup by primary key — no notable performance concerns.

## 17. Interview Notes

- **Q: Why no `:own` scope here, unlike `GET /employees/:id`?** Branch
  records aren't owned by a specific user the way an Employee record is
  — there's nothing for a `:own` grant to compare against.

## 18. cURL Examples

```bash
curl -s http://localhost:3000/api/v1/branches/$BRANCH_ID \
  -H "Authorization: Bearer $ANY_ROLE_TOKEN"
```

## 19. Postman Collection Notes

Uses `{{branchId}}` saved from `POST /branches`.

## 20. Testing Checklist

- ✅ Valid `id` → `200`
- ✅ Nonexistent `id` → `404`
- ✅ `401` with no token

---

---

# 22. `PATCH /branches/:id`

## 1. Endpoint Information

```
Feature:            Branch Domain (2026-09-13, feature/15-branch-domain)
Endpoint:           Update a Branch, including activating/deactivating it
Method:             PATCH
URL:                /api/v1/branches/:id
API Version:        v1
Module:             modules/branches
Authentication:     Yes (Bearer access token)
Authorization:      `branch:update` permission required (ADMIN only)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: covers both ordinary field edits (`name`/`code`) and
  the lifecycle transition (`status`) — there is no separate
  activate/deactivate endpoint, mirroring Employee's single-PATCH
  pattern.
- **Business problem solved**: lets an admin correct branch details or
  retire a branch from future assignment without losing history.

## 3. Request Headers

| Header                                | Required | Notes                                           |
| -------------------------------------- | -------- | -------------------------------------------------- |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `branch:update` permission     |
| `Content-Type: application/json`      | **Yes**  |                                                     |

## 4. Path Parameters

| Name | Type          | Required | Description       |
| ---- | ------------- | -------- | -------------------- |
| `id` | string (UUID) | **Yes**  | The Branch record's id |

## 5. Query Parameters

None.

## 6. Request Body

```json
{ "status": "INACTIVE" }
```

| Field               | Type   | Required | Description                                    |
| ------------------- | ------ | -------- | -------------------------------------------------- |
| `name`              | string | No       | Trimmed, non-empty when provided                    |
| `code`              | string | No       | Nullable — `null` clears it; trimmed, non-empty otherwise |
| `status`            | enum   | No       | `ACTIVE` or `INACTIVE`                              |
| `holidayCalendarId` | string (UUID) | No | **Added by the Holiday Calendar domain (2026-09-13).** Nullable — send `null` to explicitly unassign; omit to leave unchanged; a UUID value (re-)assigns, and must reference an existing, `ACTIVE` `HolidayCalendar`. |

All fields are independently optional (partial update) — send only the
field(s) being changed.

## 7. Validation Rules

Same trimming/non-empty rules as creation for `name`/`code`; `status`
restricted to the `BranchStatus` enum.

`holidayCalendarId` is `.nullable().optional()` here — widened from
creation's `.optional()`-only form, the same widening already applied to
Employee's `userId`/`managerId`/`branchId` (**added by the Holiday
Calendar domain, 2026-09-13**):

- **omitted** (`undefined`): left as-is, no check re-run (already
  validated when originally assigned);
- **explicit `null`**: unassigns — no existence/status check needed;
- **a UUID value**: re-validated by
  `holidayCalendarService.assertHolidayCalendarAssignable`, exactly as at
  creation — nonexistent → `400 "holidayCalendarId: references a record
  that does not exist"`; `INACTIVE` → `400 "holidayCalendarId: this
  holiday calendar is not active and cannot be assigned"`. A raw `P2003`
  foreign-key violation is translated to the same "does not exist" `400`.

## 8. Successful Response

```
200 OK

{
  "branch": {
    "id": "c42c7743-72d5-4839-8f88-e3f87e9954f2",
    "name": "Bengaluru HQ",
    "code": "BLR-01",
    "status": "INACTIVE",
    "holidayCalendarId": null,
    "createdAt": "2026-09-13T09:54:38.817Z",
    "updatedAt": "2026-09-13T09:54:53.078Z"
  }
}
```

Verified live, including the `status` transition shown above, and
(**added by the Holiday Calendar domain, 2026-09-13**) `holidayCalendarId`
present in every response and settable to a valid `ACTIVE` calendar id or
explicitly cleared back to `null`.

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                | When                                       |
| ------ | ------------------------------------ | -------------------------------------------------------- | ---------------------------------------------- |
| `400`  | Validation failed                   | e.g. `"name: Branch name is required"`                  | Empty/whitespace-only `name`, invalid `status` |
| `400`  | `holidayCalendarId` does not reference an existing record | `"holidayCalendarId: references a record that does not exist"` | **Added by the Holiday Calendar domain (2026-09-13).** Nonexistent id |
| `400`  | `holidayCalendarId` references an `INACTIVE` calendar | `"holidayCalendarId: this holiday calendar is not active and cannot be assigned"` | **Added by the Holiday Calendar domain (2026-09-13).** Verified live |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                  | `authMiddleware` failure                    |
| `403`  | Caller lacks `branch:update`        | `"You do not have permission to perform this action"`   | Verified live for `EMPLOYEE`                |
| `404`  | No such branch                      | `"Branch not found"`                                    | Invalid/nonexistent `id`                    |
| `409`  | Duplicate `name`/`code`             | `"A branch with this name or code already exists"`       | Renaming to a name/code already used by a different branch |

## 10. Postman Test Cases

| #   | Case                              | Expected |
| --- | ------------------------------------ | -------- |
| 1   | Update `name` only                   | `200`    |
| 2   | Deactivate (`status: "INACTIVE"`)    | `200` — verified live |
| 3   | Reactivate (`status: "ACTIVE"`)      | `200`    |
| 4   | Rename to another branch's existing `name` | `409` |
| 5   | Nonexistent `id`                     | `404`    |
| 6   | As `EMPLOYEE`/`MANAGER` token         | `403`    |
| 7   | No token                             | `401`    |
| 8   | Assign a valid `ACTIVE` `holidayCalendarId` | `200` — verified live. **Added by the Holiday Calendar domain (2026-09-13).** |
| 9   | Assign a nonexistent `holidayCalendarId`    | `400` — verified live. **Added by the Holiday Calendar domain (2026-09-13).** |
| 10  | Assign an `INACTIVE` `holidayCalendarId`    | `400` — verified live. **Added by the Holiday Calendar domain (2026-09-13).** |
| 11  | Unassign via `{"holidayCalendarId": null}`  | `200`, `branch.holidayCalendarId` becomes `null` — verified live. **Added by the Holiday Calendar domain (2026-09-13).** |

## 11. Negative Testing

| Scenario                     | Expected |
| -------------------------------- | -------- |
| `status` outside the enum        | `400`    |
| Empty body `{}`                  | `200`, no-op update (no fields to change) — not separately verified live in this pass |
| Tampered/expired JWT             | `401`    |
| `holidayCalendarId` not a valid UUID (and not `null`) | `400` — Zod's `.uuid()` rejects malformed values. **Added by the Holiday Calendar domain (2026-09-13).** |

## 12. Edge Cases

| Scenario                                                        | Expected Behavior                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Deactivating a branch with active Employee assignments             | Succeeds; existing `Employee.branchId` references are **untouched** — verified live. Only *future* assignment attempts are blocked (see `POST /employees`'s branch-assignability check). |
| Reactivating a branch                                              | Immediately assignable again — the positive-allowlist check only looks at current `status`, not history                    |
| Deactivating a `HolidayCalendar` that is still assigned to this branch | This branch's `holidayCalendarId` link is **untouched** — verified live; deactivation only blocks *future* assignment of that calendar to a *different* branch, mirroring Branch's own deactivation semantics. **Added by the Holiday Calendar domain (2026-09-13).** |
| Unassigning (`holidayCalendarId: null`) then re-assigning the same, now possibly-inactive, calendar | Re-assignment re-runs the full existence+`ACTIVE` check — `null` never short-circuits future validation. **Added by the Holiday Calendar domain (2026-09-13).** |

## 13. Security Testing

- **Authorization**: confirm `MANAGER` cannot update a branch — same
  `ADMIN`-only scoping as create/delete (ADR-B07).
- **Mass assignment**: only `name`/`code`/`status`/`holidayCalendarId`
  are read from the body — Zod strips anything else (e.g. an attempted
  `id` or `createdAt` in the body is ignored).

## 14. Database Impact

- **Tables affected**: `Branch` (update), `AuditLog` (insert), plus a
  read of `HolidayCalendar` when `holidayCalendarId` is a non-null,
  non-omitted value (the assignability check — **added by the Holiday
  Calendar domain, 2026-09-13**).
- **Transactions**: the `Branch` update and the `AuditLog` insert happen
  inside one `prisma.$transaction`.
- **Cascade behavior**: none — deactivating never touches `Employee` rows,
  nor does it touch `Holiday` rows on any assigned calendar.

## 15. Request Lifecycle

```
PATCH /api/v1/branches/:id
    ↓
authMiddleware
    ↓
requirePermission('branch:update')
    ↓ (403 if not granted)
validateMiddleware(updateBranchSchema)
    ↓ (400 if invalid)
branch.controller.update → branch.service.updateBranch(id, data, actor)
    ├─ branchRepository.findById(id) → not found → 404
    ├─ (if name/code changing) branchRepository.findByNameOrCode(...) → conflict → 409
    ├─ (if holidayCalendarId is a truthy value) holidayCalendarService.assertHolidayCalendarAssignable(holidayCalendarId) → 400 if missing/inactive
    └─ prisma.$transaction:
         ├─ branchRepository.update(id, data, tx)
         └─ auditLogRepository.create({ action: 'UPDATE', beforeData, afterData, ... }, tx)
    ↓
200 { branch }
```

## 16. Performance Notes

Single indexed lookup, optional uniqueness pre-check, plus one more
indexed lookup when a non-null `holidayCalendarId` is being (re-)assigned
(**added by the Holiday Calendar domain, 2026-09-13**), one update, one
audit-log insert — no notable performance concerns.

## 17. Interview Notes

- **Q: Why no separate activate/deactivate endpoint?** Consistent with
  Employee's single-PATCH pattern already established in this API —
  status is just another field, not a distinct resource action.
- **Q: What actually happens to already-assigned employees when a
  branch is deactivated?** Nothing — `docs/domain-branch.md`'s Decision
  is explicit that deactivation never modifies or nulls existing
  `Employee.branchId` references, only blocks *future* assignment.
  Verified live.
- **Q: Why does `holidayCalendarId` need `null` to unassign instead of
  just omitting it, like `code` does to leave it unchanged?** **Added by
  the Holiday Calendar domain (2026-09-13).** Zod (and every service
  method here) treats `undefined` as "field not present in this patch"
  and `null` as "explicitly set to empty" — two different intents that a
  single `.optional()` can't express. This is the identical
  `.nullable().optional()` widening already used for Employee's
  `userId`/`managerId`/`branchId`, applied here for the first time to a
  field on Branch itself.

## 18. cURL Examples

```bash
curl -i -X PATCH http://localhost:3000/api/v1/branches/$BRANCH_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"INACTIVE"}'
```

```bash
# Assign a holiday calendar (added by the Holiday Calendar domain, 2026-09-13)
curl -i -X PATCH http://localhost:3000/api/v1/branches/$BRANCH_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"holidayCalendarId":"'"$HOLIDAY_CALENDAR_ID"'"}'
```

```bash
# Unassign it again via explicit null (added by the Holiday Calendar domain, 2026-09-13)
curl -i -X PATCH http://localhost:3000/api/v1/branches/$BRANCH_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"holidayCalendarId":null}'
```

## 19. Postman Collection Notes

Run a deactivate/reactivate pair back-to-back to confirm both transitions
work, then re-run `POST /employees` with `{{branchId}}` while inactive to
confirm the `400` from the assignability check. For `holidayCalendarId`,
run assign → unassign (`null`) → re-assign in sequence against
`{{holidayCalendarId}}` from endpoint 34.

## 20. Testing Checklist

- ✅ Field-only update, status-only update, both together
- ✅ Deactivate → existing Employee links untouched (verified live)
- ✅ Deactivate → future assignment rejected with `400` (verified live)
- ✅ `409` on rename collision
- ✅ `403` as `EMPLOYEE`, `401` with no token
- ✅ `AuditLog` row created with correct before/after snapshots
- ✅ Assign a valid `ACTIVE` `holidayCalendarId` → `200` (verified live)
- ✅ Assign a nonexistent/`INACTIVE` `holidayCalendarId` → `400` (verified live)
- ✅ Unassign via `{"holidayCalendarId": null}` → `200`, becomes `null` (verified live)
- ✅ Omitting `holidayCalendarId` leaves the existing value unchanged

---

---

# 23. `DELETE /branches/:id`

## 1. Endpoint Information

```
Feature:            Branch Domain (2026-09-13, feature/15-branch-domain)
Endpoint:           Hard-delete a Branch
Description:        Permanently removes a Branch row - only when zero Employee records reference it
Method:             DELETE
URL:                /api/v1/branches/:id
API Version:        v1
Module:             modules/branches
Authentication:     Yes (Bearer access token)
Authorization:      `branch:delete` permission required (ADMIN only)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: covers the genuine data-entry-mistake case (a branch
  created in error, with zero employees ever assigned to it) — per
  `docs/domain-branch.md §11`, this is deliberately the *only* hard-delete
  path; a referenced branch must be deactivated instead.
- **Business problem solved**: cleanup without leaving orphaned rows for
  branches that were never actually used.

## 3. Request Headers

| Header                                | Required | Notes                                       |
| -------------------------------------- | -------- | -------------------------------------------- |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `branch:delete` permission |

## 4. Path Parameters

| Name | Type          | Required | Description       |
| ---- | ------------- | -------- | -------------------- |
| `id` | string (UUID) | **Yes**  | The Branch record's id |

## 5. Query Parameters

None.

## 6. Request Body

None.

## 7. Validation Rules

No body — only the permission check, the record's existence, and the
zero-reference check described below.

## 8. Successful Response

```
200 OK

{
  "message": "Branch deleted successfully"
}
```

Verified live for a branch with zero Employee references.

## 9. Error Responses

| Status | Reason                                      | Response (`message`)                                                                | When                                                                 |
| ------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `401`  | Missing/invalid/expired access token           | Same as every other protected endpoint                                                  | `authMiddleware` failure                                                 |
| `403`  | Caller lacks `branch:delete`                    | `"You do not have permission to perform this action"`                                    | Verified live for `EMPLOYEE`                                             |
| `404`  | No such branch                                 | `"Branch not found"`                                                                     | Invalid/nonexistent `id`                                                  |
| `409`  | Branch is referenced by one or more Employees   | `"This branch has Employee records referencing it and cannot be deleted - deactivate it instead"` | Verified live — including when the only reference is a **soft-deleted** Employee (see Edge Cases) |

## 10. Postman Test Cases

| #   | Case                                          | Expected |
| --- | ------------------------------------------------ | -------- |
| 1   | Delete a branch with zero Employee references     | `200` — verified live |
| 2   | Delete a branch with an active Employee reference | `409` — verified live |
| 3   | Nonexistent `id`                                  | `404`    |
| 4   | As `EMPLOYEE`/`MANAGER` token                      | `403`    |
| 5   | No token                                          | `401`    |

## 11. Negative Testing

| Scenario              | Expected |
| ------------------------ | -------- |
| Malformed (non-UUID) `id` | `404`    |
| Tampered/expired JWT      | `401`    |

## 12. Edge Cases

| Scenario                                                                 | Expected Behavior                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch referenced **only** by a soft-deleted Employee (`deletedAt` set)      | Still `409` — the reference count deliberately includes soft-deleted Employee rows, not just active ones, since the schema's `onDelete: Restrict` on `Employee.branchId` would refuse the actual delete at the database level regardless of `deletedAt`. Documented explicitly in `branch.repository.js`, not separately re-verified with a live soft-deleted fixture in this pass. |
| Concurrent delete requests for the same `id`                                 | One succeeds, the other sees `404` — not independently verified under true concurrency (same caveat as Employee's equivalent case)                                                       |

## 13. Security Testing

- **Authorization**: confirm `MANAGER` cannot delete a branch — verified
  live, same `ADMIN`-only scoping as create/update.
- **Idempotency under retry**: a retried `DELETE` after a timeout gets a
  safe `404` on the second attempt, not a destructive side effect.

## 14. Database Impact

- **Tables affected**: `Branch` (delete — this is the one Branch
  operation that is a real row deletion, not a status update),
  `AuditLog` (insert).
- **Rows deleted**: exactly 1 `Branch` row, only when zero Employee
  references exist.
- **Transactions**: the `Branch` delete and the `AuditLog` insert happen
  inside one `prisma.$transaction`.
- **DB-level backstop**: `Employee.branchId`'s `onDelete: Restrict` means
  even if this service-layer check were somehow bypassed, Postgres itself
  would refuse the delete with a foreign-key-violation error rather than
  silently orphaning Employee rows.

## 15. Request Lifecycle

```
DELETE /api/v1/branches/:id
    ↓
authMiddleware
    ↓
requirePermission('branch:delete')
    ↓ (403 if not granted)
branch.controller.remove → branch.service.deleteBranch(id, actor)
    ├─ branchRepository.findById(id) → not found → 404
    ├─ branchRepository.countEmployeesForBranch(id) → count > 0 → 409
    └─ prisma.$transaction:
         ├─ branchRepository.remove(id, tx)
         └─ auditLogRepository.create({ action: 'DELETE', beforeData, afterData: null, ... }, tx)
    ↓
200 { message: "Branch deleted successfully" }
```

## 16. Performance Notes

One indexed existence lookup, one `Employee` count query, one delete, one
audit-log insert — no notable performance concerns at current scale.

## 17. Interview Notes

- **Q: Why hard-delete for Branch when Employee only ever soft-deletes?**
  Branch's lifecycle model uses a `status` field for the normal
  "retire this branch" case (ADR-B04) — hard delete exists only as a
  narrow escape hatch for a branch that was never actually used, which is
  a fundamentally different scenario from offboarding an employee who
  has real history to preserve.
- **Q: Why count soft-deleted Employees too, not just active ones?**
  Because the DB-level `onDelete: Restrict` constraint would block the
  delete anyway regardless of `deletedAt` — checking only active
  references would let this service-layer check pass while the actual
  delete still throws a raw, untranslated foreign-key error.

## 18. cURL Examples

```bash
curl -i -X DELETE http://localhost:3000/api/v1/branches/$BRANCH_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 19. Postman Collection Notes

Run this **last** for any `{{branchId}}` with zero Employee references;
for a referenced branch, expect and assert on the `409`, not a `200`.

## 20. Testing Checklist

- ✅ Delete with zero references → `200` (verified live)
- ✅ Delete with an active reference → `409` (verified live)
- ✅ `403` as `EMPLOYEE`, `401` with no token
- ✅ `404` for nonexistent `id`
- ✅ `AuditLog` row created for the deletion

---

---

# 24. `POST /departments`

## 1. Endpoint Information

```
Feature:            Department Domain (2026-09-13, feature/16-department-domain)
Endpoint:           Create Department
Description:        Creates a new functional/organizational classification
Method:             POST
URL:                /api/v1/departments
API Version:        v1
Module:             modules/departments
Authentication:     Yes (Bearer access token)
Authorization:      `department:create` permission required (ADMIN only, as seeded)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: closes the same kind of gap Branch closed for
  location — `docs/domain-department.md` found `Employee.department` was
  a plain, ungoverned `String`, verified live in this dev database to
  actually contain 12 distinct free-text values across 30 Employee rows,
  including test-data noise (`"wefswedf"`, `"A"`, `"Eng"` as a separate
  value from `"Engineering"`) alongside real ones.
- **Business problem solved**: department attribution becomes governed,
  correctable in one place, and queryable ("all Engineering employees")
  without a fragile string match.
- **Expected callers**: `ADMIN` only — same scoping decision as Branch (ADR-B07/ADR-D08), deliberately tighter than `employee:*`.

## 3. Request Headers

| Header                                 | Required | Notes                                             |
| --------------------------------------- | -------- | ---------------------------------------------------- |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `department:create` permission     |
| `Content-Type: application/json`      | **Yes**  |                                                     |

## 4. Path Parameters

None.

## 5. Query Parameters

None.

## 6. Request Body

```json
{
  "name": "Engineering",
  "code": "ENG"
}
```

| Field  | Type   | Required | Description                                             |
| ------ | ------ | -------- | -------------------------------------------------------- |
| `name` | string | **Yes**  | Trimmed, non-empty, **unique case-insensitively** across all departments (`"Engineering"` and `"engineering"` conflict) |
| `code` | string | No       | Trimmed, non-empty when provided, unique (case-sensitive) when provided |

## 7. Validation Rules

- `name`: required, `.trim().min(1)` — a whitespace-only value fails.
- `code`: optional; when present, `.trim().min(1)`.
- `status` is **not** accepted at creation — every new department starts
  `ACTIVE`; status can only be changed afterward via `PATCH /departments/:id`.
- **Case-insensitive uniqueness on `name` is a genuine divergence from
  Branch** — Branch's equivalent check is case-sensitive (`domain-branch.md`
  never made this an explicit requirement; `domain-department.md §3`
  explicitly does: "unique (case-insensitive) among non-archived
  departments"). Verified live: creating `"engineering"` after
  `"Engineering"` already exists returns `409`, not `201`.

## 8. Successful Response

```
201 Created

{
  "department": {
    "id": "b8d4b0b3-a9af-4cf2-9134-69860ede3a98",
    "name": "Engineering",
    "code": "ENG",
    "status": "ACTIVE",
    "createdAt": "2026-09-13T10:17:55.470Z",
    "updatedAt": "2026-09-13T10:17:55.470Z"
  }
}
```

Verified live against the real dev server.

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                | When                                                                 |
| ------ | ------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `400`  | Validation failed                   | e.g. `"name: Department name is required"`             | Empty/whitespace-only `name`                                          |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                | `authMiddleware` failure                                              |
| `403`  | Caller lacks `department:create`     | `"You do not have permission to perform this action"` | `EMPLOYEE`/`MANAGER` token                                             |
| `409`  | Duplicate `name` (case-insensitive) or `code` | `"A department with this name or code already exists"` | Verified live: `"engineering"` after `"Engineering"` exists → `409`  |

## 10. Postman Test Cases

| #   | Case                              | Expected |
| --- | ---------------------------------- | -------- |
| 1   | Valid create, `name` only          | `201`    |
| 2   | Valid create, `name` + `code`      | `201`    |
| 3   | Duplicate `name`, different case  | `409` — verified live |
| 4   | Duplicate `code`, different `name` | `409`    |
| 5   | Empty/whitespace `name`            | `400`    |
| 6   | As `MANAGER`/`EMPLOYEE` token       | `403`    |
| 7   | No token                          | `401`    |

## 11. Negative Testing

| Scenario                          | Expected                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Malformed JSON body                | `400` from Express's own JSON body-parser                                  |
| Tampered/expired JWT               | `401`                                                                       |
| `name`/`code` as a number/array   | `400` — Zod's `.string()` rejects non-string types                          |
| Extremely long `name`              | Not separately bounded by an explicit max-length rule today — a known, undemonstrated gap, same class as `Branch.name`/`Designation.name` |

## 12. Edge Cases

| Scenario                                                        | Expected Behavior                                                                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent creates with the same name (any case)                | One succeeds, the other gets `409` via the DB's own unique constraint on the exact-case `name` column (the case-insensitive pre-check can be beaten by a race the same way Branch's/Employee's can) |
| `code` omitted entirely                                          | Stored as `null` — no uniqueness conflict with other departments that also have no `code`                                                             |

## 13. Security Testing

- **Authorization**: confirm `MANAGER` cannot create a department —
  verified live, same `ADMIN`-only scoping as Branch.
- **Mass assignment**: only `name`/`code` are read from the body.

## 14. Database Impact

- **Tables affected**: `Department` (insert), `AuditLog` (insert).
- **Transactions**: the `Department` insert and the `AuditLog` insert
  happen inside one `prisma.$transaction`.

## 15. Request Lifecycle

```
POST /api/v1/departments
    ↓
authMiddleware
    ↓
requirePermission('department:create')
    ↓ (403 if not granted)
validateMiddleware(createDepartmentSchema)
    ↓ (400 if invalid)
department.controller.create → department.service.createDepartment(data, actor)
    ├─ departmentRepository.findByNameOrCode(name, code) [case-insensitive on name] → existing → 409
    └─ prisma.$transaction:
         ├─ departmentRepository.create(data, tx)
         └─ auditLogRepository.create({ action: 'CREATE', afterData, ... }, tx)
    ↓
201 { department }
```

## 16. Performance Notes

Two lookups (case-insensitive `name` + exact `code`) plus one insert plus
one audit-log insert — no notable performance concerns.

## 17. Interview Notes

- **Q: Why is Department's name uniqueness case-insensitive when
  Branch's isn't?** `docs/domain-department.md §3` makes this an explicit
  business rule ("unique (case-insensitive) among non-archived
  departments"), directly motivated by the exact free-text mess this
  domain was built to fix (`"Engineering"` vs `"engineering"` vs
  `"Enginering"` coexisting). Branch's sign-off never made the equivalent
  requirement explicit, so its check stayed case-sensitive — a real,
  intentional difference between two structurally similar domains, not
  an inconsistency.

## 18. cURL Examples

```bash
curl -i -X POST http://localhost:3000/api/v1/departments \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Engineering","code":"ENG"}'
```

## 19. Postman Collection Notes

Save the returned `department.id` as `{{departmentId}}` — used by every
other Department endpoint and by `POST`/`PATCH /employees`'s
`departmentId` field.

## 20. Testing Checklist

- ✅ Valid create (with and without `code`) → `201`
- ✅ Duplicate `name`, case-insensitive → `409` (verified live)
- ✅ Empty/whitespace `name` → `400`
- ✅ `403` as `MANAGER`/`EMPLOYEE`, `401` with no token
- ✅ `AuditLog` row created

---

---

# 25. `GET /departments`

## 1. Endpoint Information

```
Feature:            Department Domain (2026-09-13, feature/16-department-domain)
Endpoint:           List Department records
Method:             GET
URL:                /api/v1/departments
API Version:        v1
Module:             modules/departments
Authentication:     Yes (Bearer access token)
Authorization:      `department:read` permission (granted to ADMIN, MANAGER, EMPLOYEE)
Public/Protected:   Protected
```

## 2. Purpose

Browse/search departments — for admin management screens and for
populating a department picker when creating/updating an Employee
(mandatory field there, unlike Branch's optional picker).

## 3. Request Headers

| Header                               | Required | Notes                                          |
| -------------------------------------- | -------- | -------------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to the `department:read` permission |

## 4. Path Parameters

None.

## 5. Query Parameters

| Name      | Type    | Required | Default     | Description                              |
| ----------- | ------- | -------- | ------------- | ------------------------------------------- |
| `page`    | integer | No       | `1`         | 1-indexed page number                     |
| `limit`   | integer | No       | `10` (max 100) | Page size                                |
| `search`  | string  | No       | —           | Matches `name` and `code` (case-insensitive) |
| `status`  | enum    | No       | —           | `ACTIVE` or `INACTIVE`                    |
| `sortBy`  | enum    | No       | `createdAt` | `name`, `code`, `status`, `createdAt`     |
| `order`   | enum    | No       | `desc`      | `asc` or `desc`                           |

## 6. Request Body

None.

## 7. Validation Rules

Same shape as `GET /branches`'s `listBranchesQuerySchema`.

## 8. Successful Response

```
200 OK

{
  "departments": [
    {
      "id": "b8d4b0b3-a9af-4cf2-9134-69860ede3a98",
      "name": "Engineering",
      "code": "ENG",
      "status": "ACTIVE",
      "createdAt": "2026-09-13T10:17:55.470Z",
      "updatedAt": "2026-09-13T10:17:55.470Z"
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

Verified live.

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                  | When                                       |
| ------ | ------------------------------------ | -------------------------------------------------------- | --------------------------------------------- |
| `400`  | A query parameter failed validation | e.g. `"limit: Too big: expected number to be <=100"`      | Out-of-bounds `limit`, invalid `sortBy`/`status` |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                  | `authMiddleware` failure                   |
| `403`  | Caller lacks `department:read`      | `"You do not have permission to perform this action"`   | Not expected in practice — every seeded role has this grant |

## 10. Postman Test Cases

| #   | Case                          | Expected |
| --- | -------------------------------- | -------- |
| 1   | Default pagination              | `200`, up to 10 results |
| 2   | `search` matches an existing department | `200`, filtered results |
| 3   | `status=INACTIVE` filter         | `200`, only inactive departments |
| 4   | `sortBy=name&order=asc`          | `200`, alphabetical      |
| 5   | `limit=101`                     | `400`    |
| 6   | As any authenticated role (ADMIN/MANAGER/EMPLOYEE) | `200` — verified live for both ADMIN and EMPLOYEE |
| 7   | No token                        | `401`    |

## 11. Negative Testing

| Scenario                        | Expected                                                   |
| ----------------------------------- | -------------------------------------------------------------- |
| `sortBy` value outside the allowlist | `400`                                                          |
| `status` value outside the enum    | `400`                                                          |
| Tampered/expired JWT               | `401`                                                          |

## 12. Edge Cases

| Scenario                             | Expected Behavior                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `page` beyond the last page             | `200` with an empty `departments` array, not an error                                                     |
| Two departments with identical `createdAt` | Deterministic ordering via the unconditional secondary `id ASC` tiebreaker                              |

## 13. Security Testing

`department:read` is broad, like `branch:read` — no `:own` scope exists
or is needed, since Department has no ownership dimension.

## 14. Database Impact

Read-only — `Department.findMany` + `Department.count`, run in parallel
via `Promise.all`.

## 15. Request Lifecycle

```
GET /api/v1/departments
    ↓
authMiddleware
    ↓
requirePermission('department:read')
    ↓ (403 if not granted)
validateMiddleware(listDepartmentsQuerySchema, 'query')
    ↓ (400 if invalid)
department.controller.list → department.service.listDepartments(query)
    └─ Promise.all([departmentRepository.findAll(...), departmentRepository.count(...)])
    ↓
200 { departments, pagination }
```

## 16. Performance Notes

Department counts are expected to be modest (tens, not thousands) —
pagination exists for API consistency, not a demonstrated scale problem.

## 17. Interview Notes

- **Q: Why does `search` here use case-insensitive `contains`, but
  creation's uniqueness check also needs its own separate
  case-insensitive `equals`?** Different jobs: `search` is a fuzzy
  discovery tool (partial match anywhere in the string); the uniqueness
  check is a precise business-rule guard (exact name, modulo case). They
  happen to both be case-insensitive, but for different reasons and via
  different Prisma filter shapes (`contains` vs `equals`).

## 18. cURL Examples

```bash
curl -s "http://localhost:3000/api/v1/departments?search=Engineering&status=ACTIVE" \
  -H "Authorization: Bearer $ANY_ROLE_TOKEN"
```

## 19. Postman Collection Notes

Run after `POST /departments` to confirm the created department is
discoverable via `search`.

## 20. Testing Checklist

- ✅ Default pagination, explicit `page`/`limit`
- ✅ `search` across `name`/`code`
- ✅ `status` filter
- ✅ Sort both directions with deterministic tiebreaker
- ✅ `200` for ADMIN and EMPLOYEE tokens alike (verified live)
- ✅ `400` on out-of-bounds `limit`

---

---

# 26. `GET /departments/:id`

## 1. Endpoint Information

```
Feature:            Department Domain (2026-09-13, feature/16-department-domain)
Endpoint:           Get one Department record
Method:             GET
URL:                /api/v1/departments/:id
API Version:        v1
Module:             modules/departments
Authentication:     Yes (Bearer access token)
Authorization:      `department:read` permission (granted to every role)
Public/Protected:   Protected
```

## 2. Purpose

Fetch a single department's current details, e.g. to populate an edit
form or resolve an Employee's `departmentId` to a display name.

## 3. Request Headers

| Header                               | Required | Notes                                          |
| -------------------------------------- | -------- | -------------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to the `department:read` permission |

## 4. Path Parameters

| Name | Type          | Required | Description          |
| ---- | ------------- | -------- | ----------------------- |
| `id` | string (UUID) | **Yes**  | The Department record's id |

## 5. Query Parameters

None.

## 6. Request Body

None.

## 7. Validation Rules

No body — only the permission check and the record's existence.

## 8. Successful Response

```
200 OK

{
  "department": {
    "id": "b8d4b0b3-a9af-4cf2-9134-69860ede3a98",
    "name": "Engineering",
    "code": "ENG",
    "status": "ACTIVE",
    "createdAt": "2026-09-13T10:17:55.470Z",
    "updatedAt": "2026-09-13T10:17:55.470Z"
  }
}
```

Verified live.

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                | When                              |
| ------ | ------------------------------------ | ---------------------------------------------------------- | ------------------------------------ |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                  | `authMiddleware` failure           |
| `403`  | Caller lacks `department:read`      | `"You do not have permission to perform this action"`   | Not expected in practice           |
| `404`  | No such department                  | `"Department not found"`                                | Invalid/nonexistent `id`           |

## 10. Postman Test Cases

| #   | Case             | Expected |
| --- | ------------------ | -------- |
| 1   | Existing `id`      | `200`    |
| 2   | Nonexistent `id`   | `404`    |
| 3   | No token           | `401`    |

## 11. Negative Testing

| Scenario                   | Expected |
| ----------------------------- | -------- |
| Malformed (non-UUID) `id`     | `404`    |
| Tampered/expired JWT          | `401`    |

## 12. Edge Cases

None beyond the standard existence check — Department has no soft-delete
concept.

## 13. Security Testing

No BOLA concern — no ownership dimension.

## 14. Database Impact

Read-only — single indexed `Department.findUnique`.

## 15. Request Lifecycle

```
GET /api/v1/departments/:id
    ↓
authMiddleware
    ↓
requirePermission('department:read')
    ↓ (403 if not granted)
department.controller.getById → department.service.getDepartmentById(id)
    └─ departmentRepository.findById(id) → not found → 404
    ↓
200 { department }
```

## 16. Performance Notes

Single indexed lookup by primary key.

## 17. Interview Notes

Structurally identical to `GET /branches/:id` — same reasoning applies.

## 18. cURL Examples

```bash
curl -s http://localhost:3000/api/v1/departments/$DEPARTMENT_ID \
  -H "Authorization: Bearer $ANY_ROLE_TOKEN"
```

## 19. Postman Collection Notes

Uses `{{departmentId}}` saved from `POST /departments`.

## 20. Testing Checklist

- ✅ Valid `id` → `200`
- ✅ Nonexistent `id` → `404`
- ✅ `401` with no token

---

---

# 27. `PATCH /departments/:id`

## 1. Endpoint Information

```
Feature:            Department Domain (2026-09-13, feature/16-department-domain)
Endpoint:           Update a Department, including activating/deactivating it
Method:             PATCH
URL:                /api/v1/departments/:id
API Version:        v1
Module:             modules/departments
Authentication:     Yes (Bearer access token)
Authorization:      `department:update` permission required (ADMIN only)
Public/Protected:   Protected
```

## 2. Purpose

Correct department details, or retire a department from future
assignment without losing history — same shape as Branch's equivalent.

## 3. Request Headers

| Header                                | Required | Notes                                              |
| -------------------------------------- | -------- | ------------------------------------------------------ |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `department:update` permission     |
| `Content-Type: application/json`      | **Yes**  |                                                         |

## 4. Path Parameters

| Name | Type          | Required | Description          |
| ---- | ------------- | -------- | ----------------------- |
| `id` | string (UUID) | **Yes**  | The Department record's id |

## 5. Query Parameters

None.

## 6. Request Body

```json
{ "status": "INACTIVE" }
```

| Field    | Type   | Required | Description                                    |
| ---------- | ------ | -------- | -------------------------------------------------- |
| `name`   | string | No       | Trimmed, non-empty when provided                    |
| `code`   | string | No       | Nullable — `null` clears it; trimmed, non-empty otherwise |
| `status` | enum   | No       | `ACTIVE` or `INACTIVE`                              |

## 7. Validation Rules

Same trimming/non-empty rules as creation; `name` uniqueness re-checked
case-insensitively on rename; `status` restricted to the
`DepartmentStatus` enum.

## 8. Successful Response

```
200 OK

{
  "department": {
    "id": "b8d4b0b3-a9af-4cf2-9134-69860ede3a98",
    "name": "Engineering",
    "code": "ENG",
    "status": "INACTIVE",
    "createdAt": "2026-09-13T10:17:55.470Z",
    "updatedAt": "2026-09-13T10:18:17.799Z"
  }
}
```

Verified live, including the `status` transition shown above.

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                | When                                       |
| ------ | ------------------------------------ | -------------------------------------------------------- | ---------------------------------------------- |
| `400`  | Validation failed                   | e.g. `"name: Department name is required"`              | Empty/whitespace-only `name`, invalid `status` |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                  | `authMiddleware` failure                    |
| `403`  | Caller lacks `department:update`    | `"You do not have permission to perform this action"`   | Verified live for `EMPLOYEE`                |
| `404`  | No such department                  | `"Department not found"`                                | Invalid/nonexistent `id`                    |
| `409`  | Duplicate `name`/`code`             | `"A department with this name or code already exists"`   | Renaming to a name/code already used, case-insensitive on name |

## 10. Postman Test Cases

| #   | Case                              | Expected |
| --- | ------------------------------------ | -------- |
| 1   | Update `name` only                   | `200`    |
| 2   | Deactivate (`status: "INACTIVE"`)    | `200` — verified live |
| 3   | Reactivate (`status: "ACTIVE"`)      | `200`    |
| 4   | Rename to another department's existing `name`, any case | `409` |
| 5   | Nonexistent `id`                     | `404`    |
| 6   | As `EMPLOYEE`/`MANAGER` token         | `403`    |
| 7   | No token                             | `401`    |

## 11. Negative Testing

| Scenario                     | Expected |
| -------------------------------- | -------- |
| `status` outside the enum        | `400`    |
| Empty body `{}`                  | `200`, no-op update              |
| Tampered/expired JWT             | `401`    |

## 12. Edge Cases

| Scenario                                                        | Expected Behavior                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Deactivating a department with active Employee assignments         | Succeeds; existing `Employee.departmentId` references are **untouched** — verified live. Only *future* assignment attempts are blocked. |
| Reactivating a department                                          | Immediately assignable again                                                                                              |

## 13. Security Testing

- **Authorization**: confirm `MANAGER` cannot update a department —
  verified live.
- **Mass assignment**: only `name`/`code`/`status` are read from the body.

## 14. Database Impact

- **Tables affected**: `Department` (update), `AuditLog` (insert), inside one `prisma.$transaction`.
- **Cascade behavior**: none — deactivating never touches `Employee` rows.

## 15. Request Lifecycle

```
PATCH /api/v1/departments/:id
    ↓
authMiddleware
    ↓
requirePermission('department:update')
    ↓ (403 if not granted)
validateMiddleware(updateDepartmentSchema)
    ↓ (400 if invalid)
department.controller.update → department.service.updateDepartment(id, data, actor)
    ├─ departmentRepository.findById(id) → not found → 404
    ├─ (if name/code changing) departmentRepository.findByNameOrCode(...) → conflict → 409
    └─ prisma.$transaction:
         ├─ departmentRepository.update(id, data, tx)
         └─ auditLogRepository.create({ action: 'UPDATE', beforeData, afterData, ... }, tx)
    ↓
200 { department }
```

## 16. Performance Notes

Single indexed lookup, optional uniqueness pre-check, one update, one
audit-log insert.

## 17. Interview Notes

Structurally identical to `PATCH /branches/:id` — the one real difference
is the case-insensitive rename-collision check (§7 above).

## 18. cURL Examples

```bash
curl -i -X PATCH http://localhost:3000/api/v1/departments/$DEPARTMENT_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"INACTIVE"}'
```

## 19. Postman Collection Notes

Run a deactivate/reactivate pair back-to-back, then re-run
`POST /employees` with `{{departmentId}}` while inactive to confirm the
`400` from the assignability check.

## 20. Testing Checklist

- ✅ Field-only update, status-only update, both together
- ✅ Deactivate → existing Employee links untouched (verified live)
- ✅ Deactivate → future assignment rejected with `400` (verified live)
- ✅ `409` on rename collision, case-insensitive
- ✅ `403` as `EMPLOYEE`, `401` with no token
- ✅ `AuditLog` row created

---

---

# 28. `DELETE /departments/:id`

## 1. Endpoint Information

```
Feature:            Department Domain (2026-09-13, feature/16-department-domain)
Endpoint:           Hard-delete a Department
Description:        Permanently removes a Department row - only when zero Employee records reference it
Method:             DELETE
URL:                /api/v1/departments/:id
API Version:        v1
Module:             modules/departments
Authentication:     Yes (Bearer access token)
Authorization:      `department:delete` permission required (ADMIN only)
Public/Protected:   Protected
```

## 2. Purpose

Covers the genuine data-entry-mistake case (a department created in
error, never assigned to any Employee) — the only hard-delete path;
a referenced department must be deactivated instead.

## 3. Request Headers

| Header                                | Required | Notes                                             |
| -------------------------------------- | -------- | --------------------------------------------------- |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `department:delete` permission |

## 4. Path Parameters

| Name | Type          | Required | Description          |
| ---- | ------------- | -------- | ----------------------- |
| `id` | string (UUID) | **Yes**  | The Department record's id |

## 5. Query Parameters

None.

## 6. Request Body

None.

## 7. Validation Rules

No body — only the permission check, the record's existence, and the
zero-reference check.

## 8. Successful Response

```
200 OK

{
  "message": "Department deleted successfully"
}
```

Verified live for a department with zero Employee references.

## 9. Error Responses

| Status | Reason                                      | Response (`message`)                                                                | When                                                                 |
| ------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `401`  | Missing/invalid/expired access token           | Same as every other protected endpoint                                                  | `authMiddleware` failure                                                 |
| `403`  | Caller lacks `department:delete`                | `"You do not have permission to perform this action"`                                    | Verified live for `EMPLOYEE`                                             |
| `404`  | No such department                             | `"Department not found"`                                                                 | Invalid/nonexistent `id`                                                  |
| `409`  | Department is referenced by one or more Employees | `"This department has Employee records referencing it and cannot be deleted - deactivate it instead"` | Verified live. Note: since `departmentId` is mandatory, **every** live Employee references some department. |

## 10. Postman Test Cases

| #   | Case                                          | Expected |
| --- | ------------------------------------------------ | -------- |
| 1   | Delete a department with zero Employee references | `200` — verified live |
| 2   | Delete a department with an active Employee reference | `409` — verified live |
| 3   | Nonexistent `id`                                  | `404`    |
| 4   | As `EMPLOYEE`/`MANAGER` token                      | `403`    |
| 5   | No token                                          | `401`    |

## 11. Negative Testing

| Scenario              | Expected |
| ------------------------ | -------- |
| Malformed (non-UUID) `id` | `404`    |
| Tampered/expired JWT      | `401`    |

## 12. Edge Cases

| Scenario                                                                 | Expected Behavior                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Department referenced **only** by a soft-deleted Employee (`deletedAt` set)  | Still `409` — the reference count includes soft-deleted Employee rows, same reasoning as Branch's equivalent (`onDelete: Restrict` would refuse the delete at the DB level regardless). |
| Concurrent delete requests for the same `id`                                 | One succeeds, the other sees `404` — not independently verified under true concurrency.                                                                                                  |

## 13. Security Testing

- **Authorization**: confirm `MANAGER` cannot delete a department —
  verified live.
- **Idempotency under retry**: a retried `DELETE` gets a safe `404` on
  the second attempt.

## 14. Database Impact

- **Tables affected**: `Department` (delete), `AuditLog` (insert), inside
  one `prisma.$transaction`.
- **DB-level backstop**: `Employee.departmentId`'s `onDelete: Restrict`
  refuses the delete at the database level even if this service-layer
  check were somehow bypassed.

## 15. Request Lifecycle

```
DELETE /api/v1/departments/:id
    ↓
authMiddleware
    ↓
requirePermission('department:delete')
    ↓ (403 if not granted)
department.controller.remove → department.service.deleteDepartment(id, actor)
    ├─ departmentRepository.findById(id) → not found → 404
    ├─ departmentRepository.countEmployeesForDepartment(id) → count > 0 → 409
    └─ prisma.$transaction:
         ├─ departmentRepository.remove(id, tx)
         └─ auditLogRepository.create({ action: 'DELETE', beforeData, afterData: null, ... }, tx)
    ↓
200 { message: "Department deleted successfully" }
```

## 16. Performance Notes

One indexed existence lookup, one `Employee` count query, one delete, one
audit-log insert.

## 17. Interview Notes

- **Q: Since `departmentId` is mandatory, can this endpoint ever actually
  be used on a department with live employees?** No — it will always
  `409` in that case, by design. The only realistic use is cleaning up a
  just-created, never-assigned department (a genuine data-entry mistake),
  exactly like Branch's equivalent, except Department's mandatoriness
  makes the "never assigned" window even narrower in practice.

## 18. cURL Examples

```bash
curl -i -X DELETE http://localhost:3000/api/v1/departments/$DEPARTMENT_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 19. Postman Collection Notes

Run this **last** for any `{{departmentId}}` with zero Employee
references; for a referenced department, expect and assert on the `409`.

## 20. Testing Checklist

- ✅ Delete with zero references → `200` (verified live)
- ✅ Delete with an active reference → `409` (verified live)
- ✅ `403` as `EMPLOYEE`, `401` with no token
- ✅ `404` for nonexistent `id`
- ✅ `AuditLog` row created for the deletion

---

---

# 29. `POST /designations`

## 1. Endpoint Information

```
Feature:            Designation Domain (2026-09-13, feature/17-designation-domain)
Endpoint:           Create Designation
Description:        Creates a new job-title classification
Method:             POST
URL:                /api/v1/designations
API Version:        v1
Module:             modules/designations
Authentication:     Yes (Bearer access token)
Authorization:      `designation:create` permission required (ADMIN only, as seeded)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: closes the same kind of gap Branch closed for
  location and Department closed for function — `docs/domain-designation.md`
  found `Employee.jobTitle` was a plain, ungoverned `String`, verified live
  in this dev database to actually contain 17 distinct free-text values
  across 30 Employee rows, including test-data noise (`"sderwf"`, `"B"`)
  alongside real ones.
- **Business problem solved**: job-title attribution becomes governed,
  correctable in one place, and queryable ("how many Software Engineers
  do we have") without a fragile string match.
- **Expected callers**: `ADMIN` only — same scoping decision as Branch
  (ADR-B07) and Department (ADR-D08), resolved identically here as
  ADR-DS06, deliberately tighter than `employee:*`.

## 3. Request Headers

| Header                                 | Required | Notes                                             |
| --------------------------------------- | -------- | ---------------------------------------------------- |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `designation:create` permission     |
| `Content-Type: application/json`      | **Yes**  |                                                     |

## 4. Path Parameters

None.

## 5. Query Parameters

None.

## 6. Request Body

```json
{
  "name": "Backend Engineer",
  "code": "SWE"
}
```

| Field  | Type   | Required | Description                                             |
| ------ | ------ | -------- | -------------------------------------------------------- |
| `name` | string | **Yes**  | Trimmed, non-empty, **unique case-insensitively** across all designations (`"Backend Engineer"` and `"backend engineer"` conflict) |
| `code` | string | No       | Trimmed, non-empty when provided, unique (case-sensitive) when provided |

## 7. Validation Rules

- `name`: required, `.trim().min(1)` — a whitespace-only value fails with
  `"Designation name is required"`.
- `code`: optional; when present, `.trim().min(1)`.
- `status` is **not** accepted at creation — every new designation starts
  `ACTIVE`; status can only be changed afterward via `PATCH /designations/:id`.
- **Case-insensitive uniqueness on `name` is a genuine divergence from
  Branch, and identical to Department's** — Branch's equivalent check is
  case-sensitive; `docs/domain-designation.md §4` explicitly requires
  "unique (case-insensitive) among non-archived designations," the same
  rule Department carries for the same reason (governing exactly the kind
  of typo/duplication mess `jobTitle` was found to contain). Verified live:
  creating `"backend engineer"` after `"Backend Engineer"` already exists
  returns `409`, not `201`.

## 8. Successful Response

```
201 Created

{
  "designation": {
    "id": "e1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "name": "Backend Engineer",
    "code": "SWE",
    "status": "ACTIVE",
    "createdAt": "2026-09-13T10:17:55.470Z",
    "updatedAt": "2026-09-13T10:17:55.470Z"
  }
}
```

Verified live against the real dev server.

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                | When                                                                 |
| ------ | ------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `400`  | Validation failed                   | e.g. `"name: Designation name is required"`             | Empty/whitespace-only `name`                                          |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                | `authMiddleware` failure                                              |
| `403`  | Caller lacks `designation:create`     | `"You do not have permission to perform this action"` | `EMPLOYEE`/`MANAGER` token                                             |
| `409`  | Duplicate `name` (case-insensitive) or `code` | `"A designation with this name or code already exists"` | Verified live: `"backend engineer"` after `"Backend Engineer"` exists → `409`  |

## 10. Postman Test Cases

| #   | Case                              | Expected |
| --- | ---------------------------------- | -------- |
| 1   | Valid create, `name` only          | `201`    |
| 2   | Valid create, `name` + `code`      | `201`    |
| 3   | Duplicate `name`, different case  | `409` — verified live |
| 4   | Duplicate `code`, different `name` | `409`    |
| 5   | Empty/whitespace `name`            | `400`    |
| 6   | As `MANAGER`/`EMPLOYEE` token       | `403`    |
| 7   | No token                          | `401`    |

## 11. Negative Testing

| Scenario                          | Expected                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Malformed JSON body                | `400` from Express's own JSON body-parser                                  |
| Tampered/expired JWT               | `401`                                                                       |
| `name`/`code` as a number/array   | `400` — Zod's `.string()` rejects non-string types                          |
| Extremely long `name`              | Not separately bounded by an explicit max-length rule today — a known, undemonstrated gap, same class as `Branch.name`/`Department.name` |

## 12. Edge Cases

| Scenario                                                        | Expected Behavior                                                                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent creates with the same name (any case)                | One succeeds, the other gets `409` via the DB's own unique constraint on the exact-case `name` column (the case-insensitive pre-check can be beaten by a race the same way Branch's/Department's/Employee's can) |
| `code` omitted entirely                                          | Stored as `null` — no uniqueness conflict with other designations that also have no `code`                                                             |

## 13. Security Testing

- **Authorization**: confirm `MANAGER` cannot create a designation —
  verified live, same `ADMIN`-only scoping as Branch/Department.
- **Mass assignment**: only `name`/`code` are read from the body.

## 14. Database Impact

- **Tables affected**: `Designation` (insert), `AuditLog` (insert).
- **Transactions**: the `Designation` insert and the `AuditLog` insert
  happen inside one `prisma.$transaction`.

## 15. Request Lifecycle

```
POST /api/v1/designations
    ↓
authMiddleware
    ↓
requirePermission('designation:create')
    ↓ (403 if not granted)
validateMiddleware(createDesignationSchema)
    ↓ (400 if invalid)
designation.controller.create → designation.service.createDesignation(data, actor)
    ├─ designationRepository.findByNameOrCode(name, code) [case-insensitive on name] → existing → 409
    └─ prisma.$transaction:
         ├─ designationRepository.create(data, tx)
         └─ auditLogRepository.create({ action: 'CREATE', afterData, ... }, tx)
    ↓
201 { designation }
```

## 16. Performance Notes

Two lookups (case-insensitive `name` + exact `code`) plus one insert plus
one audit-log insert — no notable performance concerns.

## 17. Interview Notes

- **Q: Why is Designation's name uniqueness case-insensitive, same as
  Department but unlike Branch?** `docs/domain-designation.md §4` makes
  this an explicit business rule ("unique (case-insensitive) among
  non-archived designations"), directly motivated by the exact free-text
  mess this domain was built to fix (`"Backend Engineer"` vs
  `"backend engineer"` vs `"Backend  Engineer"` coexisting). Branch's
  sign-off never made the equivalent requirement explicit, so its check
  stayed case-sensitive — the same real, intentional divergence already
  documented for Department (see endpoint 24), now shared by a third
  domain for the same underlying reason.

## 18. cURL Examples

```bash
curl -i -X POST http://localhost:3000/api/v1/designations \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Backend Engineer","code":"SWE"}'
```

## 19. Postman Collection Notes

Save the returned `designation.id` as `{{designationId}}` — used by every
other Designation endpoint and by `POST`/`PATCH /employees`'s
`designationId` field.

## 20. Testing Checklist

- ✅ Valid create (with and without `code`) → `201`
- ✅ Duplicate `name`, case-insensitive → `409` (verified live)
- ✅ Empty/whitespace `name` → `400`
- ✅ `403` as `MANAGER`/`EMPLOYEE`, `401` with no token
- ✅ `AuditLog` row created

---

---

# 30. `GET /designations`

## 1. Endpoint Information

```
Feature:            Designation Domain (2026-09-13, feature/17-designation-domain)
Endpoint:           List Designation records
Method:             GET
URL:                /api/v1/designations
API Version:        v1
Module:             modules/designations
Authentication:     Yes (Bearer access token)
Authorization:      `designation:read` permission (granted to ADMIN, MANAGER, EMPLOYEE)
Public/Protected:   Protected
```

## 2. Purpose

Browse/search designations — for admin management screens and for
populating a designation (job-title) picker when creating/updating an
Employee (mandatory field there, unlike Branch's optional picker).

## 3. Request Headers

| Header                               | Required | Notes                                          |
| -------------------------------------- | -------- | -------------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to the `designation:read` permission |

## 4. Path Parameters

None.

## 5. Query Parameters

| Name      | Type    | Required | Default     | Description                              |
| ----------- | ------- | -------- | ------------- | ------------------------------------------- |
| `page`    | integer | No       | `1`         | 1-indexed page number                     |
| `limit`   | integer | No       | `10` (max 100) | Page size                                |
| `search`  | string  | No       | —           | Matches `name` and `code` (case-insensitive) |
| `status`  | enum    | No       | —           | `ACTIVE` or `INACTIVE`                    |
| `sortBy`  | enum    | No       | `createdAt` | `name`, `code`, `status`, `createdAt`     |
| `order`   | enum    | No       | `desc`      | `asc` or `desc`                           |

## 6. Request Body

None.

## 7. Validation Rules

Same shape as `GET /departments`'s `listDepartmentsQuerySchema` (both mirror `GET /branches`'s `listBranchesQuerySchema`).

## 8. Successful Response

```
200 OK

{
  "designations": [
    {
      "id": "e1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "name": "Backend Engineer",
      "code": "SWE",
      "status": "ACTIVE",
      "createdAt": "2026-09-13T10:17:55.470Z",
      "updatedAt": "2026-09-13T10:17:55.470Z"
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

Verified live.

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                  | When                                       |
| ------ | ------------------------------------ | ---------------------------------------------------------- | --------------------------------------------- |
| `400`  | A query parameter failed validation | e.g. `"limit: Too big: expected number to be <=100"`      | Out-of-bounds `limit`, invalid `sortBy`/`status` |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                  | `authMiddleware` failure                   |
| `403`  | Caller lacks `designation:read`      | `"You do not have permission to perform this action"`   | Not expected in practice — every seeded role has this grant |

## 10. Postman Test Cases

| #   | Case                          | Expected |
| --- | -------------------------------- | -------- |
| 1   | Default pagination              | `200`, up to 10 results |
| 2   | `search` matches an existing designation | `200`, filtered results |
| 3   | `status=INACTIVE` filter         | `200`, only inactive designations |
| 4   | `sortBy=name&order=asc`          | `200`, alphabetical      |
| 5   | `limit=101`                     | `400`    |
| 6   | As any authenticated role (ADMIN/MANAGER/EMPLOYEE) | `200` — verified live for both ADMIN and EMPLOYEE |
| 7   | No token                        | `401`    |

## 11. Negative Testing

| Scenario                        | Expected                                                   |
| ----------------------------------- | -------------------------------------------------------------- |
| `sortBy` value outside the allowlist | `400`                                                          |
| `status` value outside the enum    | `400`                                                          |
| Tampered/expired JWT               | `401`                                                          |

## 12. Edge Cases

| Scenario                             | Expected Behavior                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `page` beyond the last page             | `200` with an empty `designations` array, not an error                                                     |
| Two designations with identical `createdAt` | Deterministic ordering via the unconditional secondary `id ASC` tiebreaker                              |

## 13. Security Testing

`designation:read` is broad, like `branch:read`/`department:read` — no
`:own` scope exists or is needed, since Designation has no ownership
dimension.

## 14. Database Impact

Read-only — `Designation.findMany` + `Designation.count`, run in parallel
via `Promise.all`.

## 15. Request Lifecycle

```
GET /api/v1/designations
    ↓
authMiddleware
    ↓
requirePermission('designation:read')
    ↓ (403 if not granted)
validateMiddleware(listDesignationsQuerySchema, 'query')
    ↓ (400 if invalid)
designation.controller.list → designation.service.listDesignations(query)
    └─ Promise.all([designationRepository.findAll(...), designationRepository.count(...)])
    ↓
200 { designations, pagination }
```

## 16. Performance Notes

Designation counts are expected to be modest (tens, not thousands) —
pagination exists for API consistency, not a demonstrated scale problem.

## 17. Interview Notes

- **Q: Why does `search` here use case-insensitive `contains`, but
  creation's uniqueness check also needs its own separate
  case-insensitive `equals`?** Same reasoning as Department (endpoint 25):
  `search` is a fuzzy discovery tool (partial match anywhere in the
  string); the uniqueness check is a precise business-rule guard (exact
  name, modulo case). They happen to both be case-insensitive, but for
  different reasons and via different Prisma filter shapes (`contains` vs
  `equals`).

## 18. cURL Examples

```bash
curl -s "http://localhost:3000/api/v1/designations?search=Engineer&status=ACTIVE" \
  -H "Authorization: Bearer $ANY_ROLE_TOKEN"
```

## 19. Postman Collection Notes

Run after `POST /designations` to confirm the created designation is
discoverable via `search`.

## 20. Testing Checklist

- ✅ Default pagination, explicit `page`/`limit`
- ✅ `search` across `name`/`code`
- ✅ `status` filter
- ✅ Sort both directions with deterministic tiebreaker
- ✅ `200` for ADMIN and EMPLOYEE tokens alike (verified live)
- ✅ `400` on out-of-bounds `limit`

---

---

# 31. `GET /designations/:id`

## 1. Endpoint Information

```
Feature:            Designation Domain (2026-09-13, feature/17-designation-domain)
Endpoint:           Get one Designation record
Method:             GET
URL:                /api/v1/designations/:id
API Version:        v1
Module:             modules/designations
Authentication:     Yes (Bearer access token)
Authorization:      `designation:read` permission (granted to every role)
Public/Protected:   Protected
```

## 2. Purpose

Fetch a single designation's current details, e.g. to populate an edit
form or resolve an Employee's `designationId` to a display name.

## 3. Request Headers

| Header                               | Required | Notes                                          |
| -------------------------------------- | -------- | -------------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to the `designation:read` permission |

## 4. Path Parameters

| Name | Type          | Required | Description          |
| ---- | ------------- | -------- | ----------------------- |
| `id` | string (UUID) | **Yes**  | The Designation record's id |

## 5. Query Parameters

None.

## 6. Request Body

None.

## 7. Validation Rules

No body — only the permission check and the record's existence.

## 8. Successful Response

```
200 OK

{
  "designation": {
    "id": "e1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "name": "Backend Engineer",
    "code": "SWE",
    "status": "ACTIVE",
    "createdAt": "2026-09-13T10:17:55.470Z",
    "updatedAt": "2026-09-13T10:17:55.470Z"
  }
}
```

Verified live.

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                | When                              |
| ------ | ------------------------------------ | ---------------------------------------------------------- | ------------------------------------ |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                  | `authMiddleware` failure           |
| `403`  | Caller lacks `designation:read`      | `"You do not have permission to perform this action"`   | Not expected in practice           |
| `404`  | No such designation                  | `"Designation not found"`                                | Invalid/nonexistent `id`           |

## 10. Postman Test Cases

| #   | Case             | Expected |
| --- | ------------------ | -------- |
| 1   | Existing `id`      | `200`    |
| 2   | Nonexistent `id`   | `404`    |
| 3   | No token           | `401`    |

## 11. Negative Testing

| Scenario                   | Expected |
| ----------------------------- | -------- |
| Malformed (non-UUID) `id`     | `404`    |
| Tampered/expired JWT          | `401`    |

## 12. Edge Cases

None beyond the standard existence check — Designation has no soft-delete
concept.

## 13. Security Testing

No BOLA concern — no ownership dimension.

## 14. Database Impact

Read-only — single indexed `Designation.findUnique`.

## 15. Request Lifecycle

```
GET /api/v1/designations/:id
    ↓
authMiddleware
    ↓
requirePermission('designation:read')
    ↓ (403 if not granted)
designation.controller.getById → designation.service.getDesignationById(id)
    └─ designationRepository.findById(id) → not found → 404
    ↓
200 { designation }
```

## 16. Performance Notes

Single indexed lookup by primary key.

## 17. Interview Notes

Structurally identical to `GET /departments/:id` and `GET /branches/:id`
— same reasoning applies.

## 18. cURL Examples

```bash
curl -s http://localhost:3000/api/v1/designations/$DESIGNATION_ID \
  -H "Authorization: Bearer $ANY_ROLE_TOKEN"
```

## 19. Postman Collection Notes

Uses `{{designationId}}` saved from `POST /designations`.

## 20. Testing Checklist

- ✅ Valid `id` → `200`
- ✅ Nonexistent `id` → `404`
- ✅ `401` with no token

---

---

# 32. `PATCH /designations/:id`

## 1. Endpoint Information

```
Feature:            Designation Domain (2026-09-13, feature/17-designation-domain)
Endpoint:           Update a Designation, including activating/deactivating it
Method:             PATCH
URL:                /api/v1/designations/:id
API Version:        v1
Module:             modules/designations
Authentication:     Yes (Bearer access token)
Authorization:      `designation:update` permission required (ADMIN only)
Public/Protected:   Protected
```

## 2. Purpose

Correct a job title's details, or retire a designation from future
assignment without losing history — same shape as Branch's/Department's
equivalent.

## 3. Request Headers

| Header                                | Required | Notes                                              |
| -------------------------------------- | -------- | ------------------------------------------------------ |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `designation:update` permission     |
| `Content-Type: application/json`      | **Yes**  |                                                         |

## 4. Path Parameters

| Name | Type          | Required | Description          |
| ---- | ------------- | -------- | ----------------------- |
| `id` | string (UUID) | **Yes**  | The Designation record's id |

## 5. Query Parameters

None.

## 6. Request Body

```json
{ "status": "INACTIVE" }
```

| Field    | Type   | Required | Description                                    |
| ---------- | ------ | -------- | -------------------------------------------------- |
| `name`   | string | No       | Trimmed, non-empty when provided                    |
| `code`   | string | No       | Nullable — `null` clears it; trimmed, non-empty otherwise |
| `status` | enum   | No       | `ACTIVE` or `INACTIVE`                              |

## 7. Validation Rules

Same trimming/non-empty rules as creation; `name` uniqueness re-checked
case-insensitively on rename; `status` restricted to the
`DesignationStatus` enum.

## 8. Successful Response

```
200 OK

{
  "designation": {
    "id": "e1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "name": "Backend Engineer",
    "code": "SWE",
    "status": "INACTIVE",
    "createdAt": "2026-09-13T10:17:55.470Z",
    "updatedAt": "2026-09-13T10:18:17.799Z"
  }
}
```

Verified live, including the `status` transition shown above.

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                | When                                       |
| ------ | ------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------- |
| `400`  | Validation failed                   | e.g. `"name: Designation name is required"`              | Empty/whitespace-only `name`, invalid `status` |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                  | `authMiddleware` failure                    |
| `403`  | Caller lacks `designation:update`    | `"You do not have permission to perform this action"`   | Verified live for `EMPLOYEE`                |
| `404`  | No such designation                  | `"Designation not found"`                                | Invalid/nonexistent `id`                    |
| `409`  | Duplicate `name`/`code`             | `"A designation with this name or code already exists"`   | Renaming to a name/code already used, case-insensitive on name |

## 10. Postman Test Cases

| #   | Case                              | Expected |
| --- | ------------------------------------ | -------- |
| 1   | Update `name` only                   | `200`    |
| 2   | Deactivate (`status: "INACTIVE"`)    | `200` — verified live |
| 3   | Reactivate (`status: "ACTIVE"`)      | `200`    |
| 4   | Rename to another designation's existing `name`, any case | `409` |
| 5   | Nonexistent `id`                     | `404`    |
| 6   | As `EMPLOYEE`/`MANAGER` token         | `403`    |
| 7   | No token                             | `401`    |

## 11. Negative Testing

| Scenario                     | Expected |
| -------------------------------- | -------- |
| `status` outside the enum        | `400`    |
| Empty body `{}`                  | `200`, no-op update              |
| Tampered/expired JWT             | `401`    |

## 12. Edge Cases

| Scenario                                                        | Expected Behavior                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Deactivating a designation with active Employee assignments        | Succeeds; existing `Employee.designationId` references are **untouched** — verified live. Only *future* assignment attempts are blocked. |
| Reactivating a designation                                          | Immediately assignable again                                                                                              |

## 13. Security Testing

- **Authorization**: confirm `MANAGER` cannot update a designation —
  verified live.
- **Mass assignment**: only `name`/`code`/`status` are read from the body.

## 14. Database Impact

- **Tables affected**: `Designation` (update), `AuditLog` (insert), inside one `prisma.$transaction`.
- **Cascade behavior**: none — deactivating never touches `Employee` rows.

## 15. Request Lifecycle

```
PATCH /api/v1/designations/:id
    ↓
authMiddleware
    ↓
requirePermission('designation:update')
    ↓ (403 if not granted)
validateMiddleware(updateDesignationSchema)
    ↓ (400 if invalid)
designation.controller.update → designation.service.updateDesignation(id, data, actor)
    ├─ designationRepository.findById(id) → not found → 404
    ├─ (if name/code changing) designationRepository.findByNameOrCode(...) → conflict → 409
    └─ prisma.$transaction:
         ├─ designationRepository.update(id, data, tx)
         └─ auditLogRepository.create({ action: 'UPDATE', beforeData, afterData, ... }, tx)
    ↓
200 { designation }
```

## 16. Performance Notes

Single indexed lookup, optional uniqueness pre-check, one update, one
audit-log insert.

## 17. Interview Notes

Structurally identical to `PATCH /departments/:id` — the one real
difference is the case-insensitive rename-collision check (§7 above),
which Designation shares with Department but not Branch.

## 18. cURL Examples

```bash
curl -i -X PATCH http://localhost:3000/api/v1/designations/$DESIGNATION_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"INACTIVE"}'
```

## 19. Postman Collection Notes

Run a deactivate/reactivate pair back-to-back, then re-run
`POST /employees` with `{{designationId}}` while inactive to confirm the
`400` from the assignability check.

## 20. Testing Checklist

- ✅ Field-only update, status-only update, both together
- ✅ Deactivate → existing Employee links untouched (verified live)
- ✅ Deactivate → future assignment rejected with `400` (verified live)
- ✅ `409` on rename collision, case-insensitive
- ✅ `403` as `EMPLOYEE`, `401` with no token
- ✅ `AuditLog` row created

---

---

# 33. `DELETE /designations/:id`

## 1. Endpoint Information

```
Feature:            Designation Domain (2026-09-13, feature/17-designation-domain)
Endpoint:           Hard-delete a Designation
Description:        Permanently removes a Designation row - only when zero Employee records reference it
Method:             DELETE
URL:                /api/v1/designations/:id
API Version:        v1
Module:             modules/designations
Authentication:     Yes (Bearer access token)
Authorization:      `designation:delete` permission required (ADMIN only)
Public/Protected:   Protected
```

## 2. Purpose

Covers the genuine data-entry-mistake case (a designation created in
error, never assigned to any Employee) — the only hard-delete path;
a referenced designation must be deactivated instead.

## 3. Request Headers

| Header                                | Required | Notes                                             |
| -------------------------------------- | -------- | --------------------------------------------------- |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `designation:delete` permission |

## 4. Path Parameters

| Name | Type          | Required | Description          |
| ---- | ------------- | -------- | ----------------------- |
| `id` | string (UUID) | **Yes**  | The Designation record's id |

## 5. Query Parameters

None.

## 6. Request Body

None.

## 7. Validation Rules

No body — only the permission check, the record's existence, and the
zero-reference check.

## 8. Successful Response

```
200 OK

{
  "message": "Designation deleted successfully"
}
```

Verified live for a designation with zero Employee references.

## 9. Error Responses

| Status | Reason                                      | Response (`message`)                                                                | When                                                                 |
| ------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `401`  | Missing/invalid/expired access token           | Same as every other protected endpoint                                                  | `authMiddleware` failure                                                 |
| `403`  | Caller lacks `designation:delete`               | `"You do not have permission to perform this action"`                                    | Verified live for `EMPLOYEE`                                             |
| `404`  | No such designation                            | `"Designation not found"`                                                                 | Invalid/nonexistent `id`                                                  |
| `409`  | Designation is referenced by one or more Employees | `"This designation has Employee records referencing it and cannot be deleted - deactivate it instead"` | Verified live. Note: since `designationId` is mandatory, **every** live Employee references some designation. |

## 10. Postman Test Cases

| #   | Case                                          | Expected |
| --- | ------------------------------------------------ | -------- |
| 1   | Delete a designation with zero Employee references | `200` — verified live |
| 2   | Delete a designation with an active Employee reference | `409` — verified live |
| 3   | Nonexistent `id`                                  | `404`    |
| 4   | As `EMPLOYEE`/`MANAGER` token                      | `403`    |
| 5   | No token                                          | `401`    |

## 11. Negative Testing

| Scenario              | Expected |
| ------------------------ | -------- |
| Malformed (non-UUID) `id` | `404`    |
| Tampered/expired JWT      | `401`    |

## 12. Edge Cases

| Scenario                                                                 | Expected Behavior                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Designation referenced **only** by a soft-deleted Employee (`deletedAt` set) | Still `409` — the reference count includes soft-deleted Employee rows, same reasoning as Branch's/Department's equivalent (`onDelete: Restrict` would refuse the delete at the DB level regardless). |
| Concurrent delete requests for the same `id`                                 | One succeeds, the other sees `404` — not independently verified under true concurrency.                                                                                                  |

## 13. Security Testing

- **Authorization**: confirm `MANAGER` cannot delete a designation —
  verified live.
- **Idempotency under retry**: a retried `DELETE` gets a safe `404` on
  the second attempt.

## 14. Database Impact

- **Tables affected**: `Designation` (delete), `AuditLog` (insert), inside
  one `prisma.$transaction`.
- **DB-level backstop**: `Employee.designationId`'s `onDelete: Restrict`
  refuses the delete at the database level even if this service-layer
  check were somehow bypassed.

## 15. Request Lifecycle

```
DELETE /api/v1/designations/:id
    ↓
authMiddleware
    ↓
requirePermission('designation:delete')
    ↓ (403 if not granted)
designation.controller.remove → designation.service.deleteDesignation(id, actor)
    ├─ designationRepository.findById(id) → not found → 404
    ├─ designationRepository.countEmployeesForDesignation(id) → count > 0 → 409
    └─ prisma.$transaction:
         ├─ designationRepository.remove(id, tx)
         └─ auditLogRepository.create({ action: 'DELETE', beforeData, afterData: null, ... }, tx)
    ↓
200 { message: "Designation deleted successfully" }
```

## 16. Performance Notes

One indexed existence lookup, one `Employee` count query, one delete, one
audit-log insert.

## 17. Interview Notes

- **Q: Since `designationId` is mandatory, can this endpoint ever
  actually be used on a designation with live employees?** No — it will
  always `409` in that case, by design. The only realistic use is
  cleaning up a just-created, never-assigned designation (a genuine
  data-entry mistake), exactly like Branch's/Department's equivalent,
  except Designation's mandatoriness makes the "never assigned" window
  even narrower in practice — same reasoning as Department (endpoint 28).

## 18. cURL Examples

```bash
curl -i -X DELETE http://localhost:3000/api/v1/designations/$DESIGNATION_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 19. Postman Collection Notes

Run this **last** for any `{{designationId}}` with zero Employee
references; for a referenced designation, expect and assert on the `409`.

## 20. Testing Checklist

- ✅ Delete with zero references → `200` (verified live)
- ✅ Delete with an active reference → `409` (verified live)
- ✅ `403` as `EMPLOYEE`, `401` with no token
- ✅ `404` for nonexistent `id`

---

---

# 34. `POST /holiday-calendars`

## 1. Endpoint Information

```
Feature:            Holiday Calendar Domain (2026-09-13, feature/19-holiday-calendar-domain)
Endpoint:           Create Holiday Calendar
Description:        Creates a new named, year-agnostic, reusable holiday calendar
Method:             POST
URL:                /api/v1/holiday-calendars
API Version:        v1
Module:             modules/holidayCalendars
Authentication:     Yes (Bearer access token)
Authorization:      `holidayCalendar:create` permission required (ADMIN only, as seeded)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: fulfills the item `docs/domain-branch.md` explicitly
  deferred in its own Deferred Decisions table (a "timezone/statutory/
  holiday-calendar field" on Branch) — see `docs/domain-holiday-calendar.md`
  ADR-HC01/HC03.
- **Business problem solved**: lets an organization define a named set of
  public/statutory holidays once (e.g. "India Public Holidays") and share
  it across every Branch in that region, instead of duplicating dates
  per-branch or leaving holidays unmodeled entirely.
- **Expected callers**: `ADMIN` only — the fifth master-data domain to
  follow this project's now-standard "ADMIN-only mutations, broad read"
  shape (ADR-HC06, same resolution as Branch/Department/Designation).

## 3. Request Headers

| Header                                | Required | Notes                                                  |
| -------------------------------------- | -------- | ------------------------------------------------------- |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `holidayCalendar:create` permission |
| `Content-Type: application/json`      | **Yes**  |                                                          |

## 4. Path Parameters

None.

## 5. Query Parameters

None.

## 6. Request Body

```json
{
  "name": "India Public Holidays"
}
```

| Field  | Type   | Required | Description                                                                 |
| ------ | ------ | -------- | ---------------------------------------------------------------------------- |
| `name` | string | **Yes**  | Trimmed, non-empty, unique across all holiday calendars (**case-sensitive** — no `code` field exists in this domain, unlike Branch/Department/Designation) |

## 7. Validation Rules

- `name`: required, `.trim().min(1, 'Holiday calendar name is required')`
  — a whitespace-only value fails.
- There is no `code` field at all — `docs/domain-holiday-calendar.md`
  never names a use case for one, unlike Branch/Department/Designation.
- `status` is **not** accepted at creation — every new calendar starts
  `ACTIVE` (`HolidayCalendarStatus` default in `schema.prisma`); status
  can only be changed afterward via `PATCH /holiday-calendars/:id`.
- Uniqueness on `name` is a **case-sensitive exact match**
  (`holidayCalendarRepository.findByName` queries `where: { name }` with
  no `mode: 'insensitive'`) — unlike `department.repository.js`'s
  explicitly case-insensitive equivalent. `"India Holidays"` and
  `"india holidays"` are two distinct, both-valid rows here.

## 8. Successful Response

```
201 Created

{
  "holidayCalendar": {
    "id": "f1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "name": "India Public Holidays",
    "status": "ACTIVE",
    "createdAt": "2026-09-13T10:12:04.221Z",
    "updatedAt": "2026-09-13T10:12:04.221Z"
  }
}
```

Verified live against the real dev server. Note the absence of a `code`
field and of any embedded `holidays` array — Holiday entries are always
fetched separately (`GET /holiday-calendars/:id/holidays`, endpoint 40).

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                     | When                                                                       |
| ------ | ------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `400`  | Validation failed                   | `"name: Holiday calendar name is required"`                | Empty/whitespace-only or missing `name`                                     |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                    | `authMiddleware` failure                                                    |
| `403`  | Caller lacks `holidayCalendar:create` | `"You do not have permission to perform this action"`     | `EMPLOYEE` token — verified live. `MANAGER` also lacks this grant per `prisma/seed.js` (not separately re-verified live in this pass). |
| `409`  | Duplicate `name`                    | `"A holiday calendar with this name already exists"`        | Verified live: creating the same `name` twice returns `409` on the 2nd     |

## 10. Postman Test Cases

| #   | Case                                        | Expected |
| --- | -------------------------------------------- | -------- |
| 1   | Valid create                                 | `201` — verified live |
| 2   | Duplicate `name`                             | `409` — verified live |
| 3   | Same name, different casing (e.g. `india public holidays`) | `201` — a separate, non-conflicting row (case-sensitive uniqueness); not independently re-verified live in this pass, follows directly from the repository's exact-match query |
| 4   | Empty/whitespace `name`                      | `400`    |
| 5   | As `MANAGER`/`EMPLOYEE` token                 | `403` — verified live for `EMPLOYEE` |
| 6   | No token                                     | `401`    |

## 11. Negative Testing

| Scenario                                    | Expected                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| Malformed JSON body                          | `400` from Express's own JSON body-parser, before this route's handler runs   |
| Tampered/expired JWT                         | `401`                                                                          |
| `name` as a number/array                     | `400` — Zod's `.string()` rejects non-string types                            |
| Extra fields in the body (e.g. `code`, `status`) | Silently stripped by Zod — never persisted, never an error (mass-assignment guard) |
| Extremely long `name` (thousands of chars)   | Not separately bounded by an explicit max-length rule today — a known, undemonstrated gap, not verified live in this pass, same category as Branch's/Department's/Designation's identical gap |

## 12. Edge Cases

| Scenario                                                        | Expected Behavior                                                                                                                                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent creates with the same `name`                          | One succeeds, the other gets `409` — the pre-check can be beaten by a race, but the database's own unique constraint on `name` is the real guarantee, translated from Prisma's `P2002` |
| Names differing only by case                                     | Both succeed as independent rows — see Validation Rules; no cross-case dedup exists in this domain                                                                                        |

## 13. Security Testing

- **Authorization**: confirm `EMPLOYEE` cannot create a holiday calendar
  — verified live. `MANAGER` is excluded by the identical seeded
  permission grant (`holidayCalendar:create` is `ADMIN`-only in
  `prisma/seed.js`'s `ROLE_PERMISSIONS`).
- **Mass assignment**: only `name` is read from the body — Zod's schema
  strips anything else (e.g. an attempted `status: "ACTIVE"` or `id` in
  the body is silently ignored, not applied).

## 14. Database Impact

- **Tables affected**: `HolidayCalendar` (insert), `AuditLog` (insert).
- **Transactions**: the `HolidayCalendar` insert and the `AuditLog`
  insert happen inside one `prisma.$transaction` — same pattern as every
  other domain's create mutation.

## 15. Request Lifecycle

```
POST /api/v1/holiday-calendars
    ↓
authMiddleware
    ↓
requirePermission('holidayCalendar:create')
    ↓ (403 if not granted)
validateMiddleware(createHolidayCalendarSchema)
    ↓ (400 if invalid)
holidayCalendar.controller.create → holidayCalendar.service.createHolidayCalendar(data, actor)
    ├─ holidayCalendarRepository.findByName(name) → existing → 409
    └─ prisma.$transaction:
         ├─ holidayCalendarRepository.create(data, tx)
         └─ auditLogRepository.create({ action: 'CREATE', entityType: 'HolidayCalendar', afterData, ... }, tx)
    ↓
201 { holidayCalendar }
```

## 16. Performance Notes

One indexed lookup (name uniqueness pre-check) plus one insert plus one
audit-log insert in the same transaction — calendar counts are expected
to stay small (a handful per organization/region, updated ~annually per
`docs/domain-holiday-calendar.md §11`), so no notable performance
concerns.

## 17. Interview Notes

- **Q: Why no `code` field, unlike Branch/Department/Designation?**
  Those three domains each named a real downstream need for a short,
  stable identifier distinct from the display name (Payroll/reporting
  integration). `docs/domain-holiday-calendar.md`'s own sign-off never
  identifies an equivalent need here — `name` alone is sufficient, and
  adding an unused field speculatively would contradict this domain's own
  §5 warning against building unneeded orchestration/fields.
- **Q: Why is `name` uniqueness case-sensitive here when Department's is
  case-insensitive?** Each domain's own architecture sign-off makes this
  call independently — Department's explicitly names case-insensitivity
  as a requirement (`docs/domain-department.md §3`), while Holiday
  Calendar's sign-off does not raise it at all, so the simpler,
  default (case-sensitive) database behavior was kept.

## 18. cURL Examples

```bash
curl -i -X POST http://localhost:3000/api/v1/holiday-calendars \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"India Public Holidays"}'
```

## 19. Postman Collection Notes

Save the returned `holidayCalendar.id` as `{{holidayCalendarId}}` — used
by every other Holiday Calendar endpoint, the nested Holiday endpoints
(39-42), and by `POST`/`PATCH /branches`'s `holidayCalendarId` field
(endpoints 19 and 22).

## 20. Testing Checklist

- ✅ Valid create → `201`
- ✅ Duplicate `name` → `409`
- ✅ Empty/whitespace `name` → `400`
- ✅ `403` as `EMPLOYEE`, `401` with no token
- ✅ `AuditLog` row created with correct `beforeData: null`/`afterData`
- ✅ No `code` field accepted or returned; no `holidays` array embedded

---

---

# 35. `GET /holiday-calendars`

## 1. Endpoint Information

```
Feature:            Holiday Calendar Domain (2026-09-13, feature/19-holiday-calendar-domain)
Endpoint:           List Holiday Calendar records
Description:        Paginated, searchable, filterable, sortable list of holiday calendars
Method:             GET
URL:                /api/v1/holiday-calendars
API Version:        v1
Module:             modules/holidayCalendars
Authentication:     Yes (Bearer access token)
Authorization:      `holidayCalendar:read` permission (granted to ADMIN, MANAGER, EMPLOYEE)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: lets any authenticated user browse/search holiday
  calendars — needed for admin management screens and for populating a
  calendar picker when creating/updating a Branch.
- **Business problem solved**: discoverability of existing calendars
  without a dedicated admin UI reading the database directly.
- **Expected callers**: every role — `holidayCalendar:read` is
  deliberately broad, the same non-sensitive-reference-data reasoning
  already applied to `branch:read`/`department:read`/`designation:read`.

## 3. Request Headers

| Header                               | Required | Notes                                                |
| -------------------------------------- | -------- | ------------------------------------------------------ |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to the `holidayCalendar:read` permission |

## 4. Path Parameters

None.

## 5. Query Parameters

| Name      | Type    | Required | Default     | Description                                    |
| ----------- | ------- | -------- | ------------- | ------------------------------------------------- |
| `page`    | integer | No       | `1`         | 1-indexed page number                            |
| `limit`   | integer | No       | `10` (max 100) | Page size                                     |
| `search`  | string  | No       | —           | Matches `name` only (case-insensitive)             |
| `status`  | enum    | No       | —           | `ACTIVE` or `INACTIVE`                            |
| `sortBy`  | enum    | No       | `createdAt` | `name`, `status`, `createdAt`                     |
| `order`   | enum    | No       | `desc`      | `asc` or `desc`                                   |

Note the asymmetry with creation/uniqueness: `search` is
case-**insensitive** (`mode: 'insensitive'` in
`buildHolidayCalendarWhere`), even though the `name`-uniqueness check at
create/update time is case-**sensitive** — searching for `"india"` finds
a calendar named `"India Public Holidays"`, but creating a second
`"india public holidays"` calendar is still allowed, not rejected as a
duplicate.

## 6. Request Body

None.

## 7. Validation Rules

Same shape as `GET /branches`'s `listBranchesQuerySchema` (`limit`
capped at 100, `sortBy` restricted to an allowlist, `page`/`limit`
coerced from query strings to integers) — there is no `code` to search
against here, unlike Branch/Department/Designation's `search` (name +
code).

## 8. Successful Response

```
200 OK

{
  "holidayCalendars": [
    {
      "id": "f1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "name": "India Public Holidays",
      "status": "ACTIVE",
      "createdAt": "2026-09-13T10:12:04.221Z",
      "updatedAt": "2026-09-13T10:12:04.221Z"
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

Verified live, including `search` matching a calendar by partial,
case-insensitive name.

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                    | When                                             |
| ------ | ------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------- |
| `400`  | A query parameter failed validation | e.g. `"limit: Too big: expected number to be <=100"`         | Out-of-bounds `limit`, invalid `sortBy`/`status`   |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                     | `authMiddleware` failure                          |
| `403`  | Caller lacks `holidayCalendar:read` | `"You do not have permission to perform this action"`      | Not expected in practice — every seeded role has this grant |

## 10. Postman Test Cases

| #   | Case                                | Expected |
| --- | -------------------------------------- | -------- |
| 1   | Default pagination                     | `200`, up to 10 results |
| 2   | `search` matches an existing calendar (any case) | `200`, filtered results — verified live |
| 3   | `status=INACTIVE` filter               | `200`, only inactive calendars |
| 4   | `sortBy=name&order=asc`                | `200`, alphabetical      |
| 5   | `limit=101`                            | `400`    |
| 6   | As `EMPLOYEE` token                     | `200` — verified live |
| 7   | No token                               | `401`    |

## 11. Negative Testing

| Scenario                        | Expected |
| ----------------------------------- | -------------- |
| `sortBy` value outside the allowlist | `400`          |
| `status` value outside the enum    | `400`          |
| Tampered/expired JWT               | `401`          |

## 12. Edge Cases

| Scenario                             | Expected Behavior                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `page` beyond the last page             | `200` with an empty `holidayCalendars` array, not an error — same convention as every other list endpoint    |
| Two calendars with identical `createdAt` (unlikely but possible) | Deterministic ordering via the unconditional secondary `id ASC` tiebreaker, same pattern as Branches/Departments/Designations |

## 13. Security Testing

- **Authorization**: `holidayCalendar:read` is intentionally broad —
  there is no `:own` scope, since a holiday calendar has no concept of
  ownership by a specific user. Confirmed live that an `EMPLOYEE` token
  can read this list.

## 14. Database Impact

Read-only — `HolidayCalendar.findMany` + `HolidayCalendar.count`, run in
parallel via `Promise.all`, not a `$transaction`.

## 15. Request Lifecycle

```
GET /api/v1/holiday-calendars
    ↓
authMiddleware
    ↓
requirePermission('holidayCalendar:read')
    ↓ (403 if not granted)
validateMiddleware(listHolidayCalendarsQuerySchema, 'query')
    ↓ (400 if invalid)
holidayCalendar.controller.list → holidayCalendar.service.listHolidayCalendars(query)
    └─ Promise.all([holidayCalendarRepository.findAll(...), holidayCalendarRepository.count(...)])
    ↓
200 { holidayCalendars, pagination }
```

## 16. Performance Notes

Two parallel indexed queries; calendar counts are expected to be modest
(tens, not thousands — `docs/domain-holiday-calendar.md §11`), so
pagination exists for consistency with the rest of the API rather than a
demonstrated scale problem today.

## 17. Interview Notes

- **Q: Why does `EMPLOYEE` get `holidayCalendar:read` when it doesn't get
  broader write access anywhere in this domain?** Same reasoning as
  Branch/Department/Designation — this is non-sensitive reference data
  with no ownership dimension, so the simplest correct grant is read
  access for everyone (ADR-HC06).

## 18. cURL Examples

```bash
curl -s "http://localhost:3000/api/v1/holiday-calendars?search=india&status=ACTIVE" \
  -H "Authorization: Bearer $ANY_ROLE_TOKEN"
```

## 19. Postman Collection Notes

Run after `POST /holiday-calendars` to confirm the created calendar is
discoverable via `search`.

## 20. Testing Checklist

- ✅ Default pagination, explicit `page`/`limit`
- ✅ Case-insensitive `search` on `name`
- ✅ `status` filter
- ✅ Sort both directions with deterministic tiebreaker
- ✅ `200` for `EMPLOYEE` token (verified live)
- ✅ `400` on out-of-bounds `limit`

---

---

# 36. `GET /holiday-calendars/:id`

## 1. Endpoint Information

```
Feature:            Holiday Calendar Domain (2026-09-13, feature/19-holiday-calendar-domain)
Endpoint:           Get one Holiday Calendar record
Method:             GET
URL:                /api/v1/holiday-calendars/:id
API Version:        v1
Module:             modules/holidayCalendars
Authentication:     Yes (Bearer access token)
Authorization:      `holidayCalendar:read` permission (granted to every role)
Public/Protected:   Protected
```

## 2. Purpose

Fetch a single holiday calendar's current details, e.g. to populate an
edit form. Deliberately does **not** include its Holiday entries — see
`GET /holiday-calendars/:id/holidays` (endpoint 40) instead, the same
"never embed a child collection inline" precedent already set by
`GET /employees/:id` never embedding `documents`.

## 3. Request Headers

| Header                               | Required | Notes                                                |
| -------------------------------------- | -------- | ------------------------------------------------------ |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to the `holidayCalendar:read` permission |

## 4. Path Parameters

| Name | Type          | Required | Description                   |
| ---- | ------------- | -------- | -------------------------------- |
| `id` | string (UUID) | **Yes**  | The Holiday Calendar record's id |

## 5. Query Parameters

None.

## 6. Request Body

None.

## 7. Validation Rules

No body — only the permission check and the record's existence.

## 8. Successful Response

```
200 OK

{
  "holidayCalendar": {
    "id": "f1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "name": "India Public Holidays",
    "status": "ACTIVE",
    "createdAt": "2026-09-13T10:12:04.221Z",
    "updatedAt": "2026-09-13T10:12:19.442Z"
  }
}
```

Verified live. No `holidays` array is present, by design.

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                 | When                                     |
| ------ | ------------------------------------ | -------------------------------------------------------- | ------------------------------------------- |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                  | `authMiddleware` failure                  |
| `403`  | Caller lacks `holidayCalendar:read`  | `"You do not have permission to perform this action"`   | Not expected in practice                  |
| `404`  | No such holiday calendar            | `"Holiday calendar not found"`                          | Invalid/nonexistent `id`, verified live   |

## 10. Postman Test Cases

| #   | Case             | Expected |
| --- | ------------------ | -------- |
| 1   | Existing `id`      | `200`    |
| 2   | Nonexistent `id`   | `404`    |
| 3   | No token           | `401`    |

## 11. Negative Testing

| Scenario                   | Expected |
| ----------------------------- | -------- |
| Malformed (non-UUID) `id`     | `404` — same as every other endpoint taking `id` in the path |
| Tampered/expired JWT          | `401`    |

## 12. Edge Cases

None beyond the standard existence check — `HolidayCalendar` has no
soft-delete concept, so there is no "exists but deleted" state to
distinguish (same as Branch/Department/Designation).

## 13. Security Testing

No BOLA concern — `HolidayCalendar` has no ownership dimension; every
grant of `holidayCalendar:read` sees identical data regardless of who's
asking.

## 14. Database Impact

Read-only — single indexed `HolidayCalendar.findUnique`.

## 15. Request Lifecycle

```
GET /api/v1/holiday-calendars/:id
    ↓
authMiddleware
    ↓
requirePermission('holidayCalendar:read')
    ↓ (403 if not granted)
holidayCalendar.controller.getById → holidayCalendar.service.getHolidayCalendarById(id)
    └─ holidayCalendarRepository.findById(id) → not found → 404
    ↓
200 { holidayCalendar }
```

## 16. Performance Notes

Single indexed lookup by primary key — no notable performance concerns.

## 17. Interview Notes

- **Q: Why doesn't this response embed the calendar's Holiday entries,
  the way `GET /employees/:id` doesn't embed `documents`?** Same
  reasoning transplanted directly: an unbounded-cardinality child
  collection embedded inline would make this response's size
  unpredictable, and most callers of "get this one calendar" (e.g. an
  edit-name-or-status form) don't need the full holiday list at all —
  it's one extra, clearly-named request away (endpoint 40) for the
  callers that do.

## 18. cURL Examples

```bash
curl -s http://localhost:3000/api/v1/holiday-calendars/$HOLIDAY_CALENDAR_ID \
  -H "Authorization: Bearer $ANY_ROLE_TOKEN"
```

## 19. Postman Collection Notes

Uses `{{holidayCalendarId}}` saved from `POST /holiday-calendars`.

## 20. Testing Checklist

- ✅ Valid `id` → `200`
- ✅ Nonexistent `id` → `404`
- ✅ `401` with no token
- ✅ No `holidays` array present in the response

---

---

# 37. `PATCH /holiday-calendars/:id`

## 1. Endpoint Information

```
Feature:            Holiday Calendar Domain (2026-09-13, feature/19-holiday-calendar-domain)
Endpoint:           Update a Holiday Calendar, including activating/deactivating it
Method:             PATCH
URL:                /api/v1/holiday-calendars/:id
API Version:        v1
Module:             modules/holidayCalendars
Authentication:     Yes (Bearer access token)
Authorization:      `holidayCalendar:update` permission required (ADMIN only)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: covers both ordinary field edits (`name`) and the
  lifecycle transition (`status`) — there is no separate
  activate/deactivate endpoint, mirroring Branch/Department/Designation's
  single-PATCH pattern.
- **Business problem solved**: lets an admin rename a calendar or retire
  it from future Branch assignment without losing history or disturbing
  Branches already linked to it.

## 3. Request Headers

| Header                                | Required | Notes                                                  |
| -------------------------------------- | -------- | --------------------------------------------------------- |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `holidayCalendar:update` permission   |
| `Content-Type: application/json`      | **Yes**  |                                                             |

## 4. Path Parameters

| Name | Type          | Required | Description                   |
| ---- | ------------- | -------- | -------------------------------- |
| `id` | string (UUID) | **Yes**  | The Holiday Calendar record's id |

## 5. Query Parameters

None.

## 6. Request Body

```json
{ "status": "INACTIVE" }
```

| Field    | Type   | Required | Description                                    |
| ---------- | ------ | -------- | -------------------------------------------------- |
| `name`   | string | No       | Trimmed, non-empty when provided; same case-sensitive uniqueness as creation |
| `status` | enum   | No       | `ACTIVE` or `INACTIVE`                              |

Both fields are independently optional (partial update) — send only the
field(s) being changed. There is no `code` field to update (none exists
in this domain).

## 7. Validation Rules

Same trimming/non-empty rule as creation for `name`; `status` restricted
to the `HolidayCalendarStatus` enum.

## 8. Successful Response

```
200 OK

{
  "holidayCalendar": {
    "id": "f1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "name": "India Public Holidays",
    "status": "INACTIVE",
    "createdAt": "2026-09-13T10:12:04.221Z",
    "updatedAt": "2026-09-13T10:12:34.556Z"
  }
}
```

Verified live, including the `status` transition shown above.

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                     | When                                       |
| ------ | ------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------- |
| `400`  | Validation failed                   | e.g. `"name: Holiday calendar name is required"`             | Empty/whitespace-only `name`, invalid `status` |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                      | `authMiddleware` failure                    |
| `403`  | Caller lacks `holidayCalendar:update` | `"You do not have permission to perform this action"`      | `EMPLOYEE`/`MANAGER` token                  |
| `404`  | No such holiday calendar            | `"Holiday calendar not found"`                               | Invalid/nonexistent `id`                    |
| `409`  | Duplicate `name`                    | `"A holiday calendar with this name already exists"`          | Renaming to a name already used by a *different* calendar (exact, case-sensitive match) |

## 10. Postman Test Cases

| #   | Case                              | Expected |
| --- | ------------------------------------ | -------- |
| 1   | Update `name` only                   | `200`    |
| 2   | Deactivate (`status: "INACTIVE"`)    | `200` — verified live |
| 3   | Reactivate (`status: "ACTIVE"`)      | `200`    |
| 4   | Rename to another calendar's existing `name` | `409` |
| 5   | Nonexistent `id`                     | `404`    |
| 6   | As `EMPLOYEE`/`MANAGER` token         | `403`    |
| 7   | No token                             | `401`    |

## 11. Negative Testing

| Scenario                     | Expected |
| -------------------------------- | -------- |
| `status` outside the enum        | `400`    |
| Empty body `{}`                  | `200`, no-op update (no fields to change) — not separately verified live in this pass |
| Tampered/expired JWT             | `401`    |

## 12. Edge Cases

| Scenario                                                        | Expected Behavior                                                                                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deactivating a calendar that is still assigned to one or more Branches | Succeeds; existing `Branch.holidayCalendarId` references are **untouched** — verified live. Only *future* assignment attempts (via `POST`/`PATCH /branches`) are blocked. |
| Reactivating a calendar                                            | Immediately assignable again — the positive-allowlist check only looks at current `status`, not history                                                       |
| Renaming to the exact same `name` the record already has          | `200`, no conflict — the duplicate check excludes the record's own `id` (`existing.id !== id`)                                                                |

## 13. Security Testing

- **Authorization**: confirm neither `MANAGER` nor `EMPLOYEE` can update
  a holiday calendar — same `ADMIN`-only scoping as create/delete
  (ADR-HC06).
- **Mass assignment**: only `name`/`status` are read from the body — Zod
  strips anything else (e.g. an attempted `id` or `createdAt` in the body
  is ignored).

## 14. Database Impact

- **Tables affected**: `HolidayCalendar` (update), `AuditLog` (insert).
- **Transactions**: the `HolidayCalendar` update and the `AuditLog`
  insert happen inside one `prisma.$transaction`.
- **Cascade behavior**: none — deactivating never touches `Branch` or
  `Holiday` rows.

## 15. Request Lifecycle

```
PATCH /api/v1/holiday-calendars/:id
    ↓
authMiddleware
    ↓
requirePermission('holidayCalendar:update')
    ↓ (403 if not granted)
validateMiddleware(updateHolidayCalendarSchema)
    ↓ (400 if invalid)
holidayCalendar.controller.update → holidayCalendar.service.updateHolidayCalendar(id, data, actor)
    ├─ holidayCalendarRepository.findById(id) → not found → 404
    ├─ (if name changing) holidayCalendarRepository.findByName(...) → conflict (different id) → 409
    └─ prisma.$transaction:
         ├─ holidayCalendarRepository.update(id, data, tx)
         └─ auditLogRepository.create({ action: 'UPDATE', beforeData, afterData, ... }, tx)
    ↓
200 { holidayCalendar }
```

## 16. Performance Notes

Single indexed lookup, optional uniqueness pre-check, one update, one
audit-log insert — no notable performance concerns.

## 17. Interview Notes

- **Q: Why no separate activate/deactivate endpoint?** Consistent with
  Branch/Department/Designation's single-PATCH pattern already
  established in this API — status is just another field, not a distinct
  resource action.
- **Q: What actually happens to Branches already linked to a calendar
  when it's deactivated?** Nothing — `docs/domain-holiday-calendar.md`
  is explicit that deactivation never modifies or nulls existing
  `Branch.holidayCalendarId` references, only blocks *future* assignment.
  Verified live.

## 18. cURL Examples

```bash
curl -i -X PATCH http://localhost:3000/api/v1/holiday-calendars/$HOLIDAY_CALENDAR_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"INACTIVE"}'
```

## 19. Postman Collection Notes

Run a deactivate/reactivate pair back-to-back to confirm both transitions
work, then re-run `POST /branches` with `{{holidayCalendarId}}` while
inactive to confirm the `400` from the assignability check.

## 20. Testing Checklist

- ✅ Field-only update, status-only update, both together
- ✅ Deactivate → existing Branch links untouched (verified live)
- ✅ Deactivate → future assignment rejected with `400` (verified live)
- ✅ `409` on rename collision
- ✅ `403` as `EMPLOYEE`/`MANAGER`, `401` with no token
- ✅ `AuditLog` row created with correct before/after snapshots

---

---

# 38. `DELETE /holiday-calendars/:id`

## 1. Endpoint Information

```
Feature:            Holiday Calendar Domain (2026-09-13, feature/19-holiday-calendar-domain)
Endpoint:           Hard-delete a Holiday Calendar
Description:        Permanently removes a Holiday Calendar row - only when zero Branch records reference it
Method:             DELETE
URL:                /api/v1/holiday-calendars/:id
API Version:        v1
Module:             modules/holidayCalendars
Authentication:     Yes (Bearer access token)
Authorization:      `holidayCalendar:delete` permission required (ADMIN only)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: covers the genuine data-entry-mistake case (a
  calendar created in error, never assigned to any Branch) — the only
  hard-delete path; a referenced calendar must be deactivated instead,
  same pattern as Branch/Department/Designation's own delete guards.
- **Business problem solved**: cleanup without leaving orphaned rows for
  calendars that were never actually used.

## 3. Request Headers

| Header                                | Required | Notes                                                  |
| -------------------------------------- | -------- | --------------------------------------------------------- |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `holidayCalendar:delete` permission   |

## 4. Path Parameters

| Name | Type          | Required | Description                   |
| ---- | ------------- | -------- | -------------------------------- |
| `id` | string (UUID) | **Yes**  | The Holiday Calendar record's id |

## 5. Query Parameters

None.

## 6. Request Body

None.

## 7. Validation Rules

No body — only the permission check, the record's existence, and the
zero-Branch-reference check described below.

## 8. Successful Response

```
200 OK

{
  "message": "Holiday calendar deleted successfully"
}
```

Verified live for a calendar with zero Branch references and zero
Holiday entries.

## 9. Error Responses

| Status | Reason                                      | Response (`message`)                                                                          | When                                                                       |
| ------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `401`  | Missing/invalid/expired access token           | Same as every other protected endpoint                                                            | `authMiddleware` failure                                                       |
| `403`  | Caller lacks `holidayCalendar:delete`           | `"You do not have permission to perform this action"`                                              | `EMPLOYEE`/`MANAGER` token                                                     |
| `404`  | No such holiday calendar                       | `"Holiday calendar not found"`                                                                     | Invalid/nonexistent `id`                                                        |
| `409`  | Holiday calendar is referenced by one or more Branches | `"This holiday calendar has Branch records referencing it and cannot be deleted - deactivate it instead"` | Verified live                                                                   |

## 10. Postman Test Cases

| #   | Case                                                | Expected |
| --- | ------------------------------------------------------ | -------- |
| 1   | Delete a calendar with zero Branch references            | `200` — verified live |
| 2   | Delete a calendar with an active Branch reference        | `409` — verified live |
| 3   | Nonexistent `id`                                        | `404`    |
| 4   | As `EMPLOYEE`/`MANAGER` token                            | `403`    |
| 5   | No token                                                | `401`    |

## 11. Negative Testing

| Scenario              | Expected |
| ------------------------ | -------- |
| Malformed (non-UUID) `id` | `404`    |
| Tampered/expired JWT      | `401`    |

## 12. Edge Cases

| Scenario                                                                 | Expected Behavior                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calendar has Holiday entries but zero Branch references                     | Deletes successfully; every `Holiday` row belonging to it cascade-deletes automatically at the database level (`onDelete: Cascade`) — no explicit `deleteMany` in the service, no orphaned rows. |
| Concurrent delete requests for the same `id`                                 | One succeeds, the other sees `404` — not independently verified under true concurrency (same caveat as Branch's/Designation's equivalent case).                                          |

## 13. Security Testing

- **Authorization**: confirm neither `MANAGER` nor `EMPLOYEE` can delete
  a holiday calendar — same `ADMIN`-only scoping as create/update.
- **Idempotency under retry**: a retried `DELETE` gets a safe `404` on
  the second attempt.

## 14. Database Impact

- **Tables affected**: `HolidayCalendar` (delete), `Holiday` (cascade
  delete at the DB level, not an explicit application-level query),
  `AuditLog` (insert).
- **DB-level backstop**: `Branch.holidayCalendarId`'s `onDelete:
  Restrict` refuses the delete at the database level even if this
  service-layer check were somehow bypassed.

## 15. Request Lifecycle

```
DELETE /api/v1/holiday-calendars/:id
    ↓
authMiddleware
    ↓
requirePermission('holidayCalendar:delete')
    ↓ (403 if not granted)
holidayCalendar.controller.remove → holidayCalendar.service.deleteHolidayCalendar(id, actor)
    ├─ holidayCalendarRepository.findById(id) → not found → 404
    ├─ holidayCalendarRepository.countBranchesForHolidayCalendar(id) → count > 0 → 409
    └─ prisma.$transaction:
         ├─ holidayCalendarRepository.remove(id, tx)   [Holiday rows cascade at the DB level]
         └─ auditLogRepository.create({ action: 'DELETE', beforeData, afterData: null, ... }, tx)
    ↓
200 { message: "Holiday calendar deleted successfully" }
```

## 16. Performance Notes

One indexed existence lookup, one `Branch` count query, one delete
(cascading to any `Holiday` rows at the database level), one audit-log
insert.

## 17. Interview Notes

- **Q: Why does deleting a calendar not also require zero Holiday
  entries, the way it requires zero Branch references?** Because Holiday
  entries have no independent identity meaningful outside their parent
  calendar (mirroring Employee → EmployeeDocument) — the schema's
  `onDelete: Cascade` on `Holiday.holidayCalendarId` makes their removal
  an automatic, database-level side effect of deleting the calendar
  itself, not a separate business rule to enforce in the service layer.
  Branch references are different: `Branch.holidayCalendarId`'s
  `onDelete: Restrict` means a referenced calendar's deletion must be
  explicitly blocked, not silently cascaded, since a Branch losing its
  holiday calendar out from under it would be a real, unintended data
  change.

## 18. cURL Examples

```bash
curl -i -X DELETE http://localhost:3000/api/v1/holiday-calendars/$HOLIDAY_CALENDAR_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 19. Postman Collection Notes

Run this **last** for any `{{holidayCalendarId}}` with zero Branch
references; for a referenced calendar, expect and assert on the `409`,
not a `200`.

## 20. Testing Checklist

- ✅ Delete with zero Branch references → `200` (verified live)
- ✅ Delete with an active Branch reference → `409` (verified live)
- ✅ `403` as `EMPLOYEE`/`MANAGER`, `401` with no token
- ✅ `404` for nonexistent `id`
- ✅ Holiday entries cascade-delete automatically, no orphaned rows
- ✅ `AuditLog` row created for the deletion

---

---

# 39. `POST /holiday-calendars/:id/holidays`

## 1. Endpoint Information

```
Feature:            Holiday Calendar Domain (2026-09-13, feature/19-holiday-calendar-domain)
Endpoint:           Add a Holiday entry to a calendar
Description:        Adds a dated Holiday entry to an existing Holiday Calendar
Method:             POST
URL:                /api/v1/holiday-calendars/:id/holidays
API Version:        v1
Module:             modules/holidayCalendars
Authentication:     Yes (Bearer access token)
Authorization:      `holidayCalendar:update` permission required (ADMIN only)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: this is how a calendar's actual dated holidays get
  populated — the calendar itself (endpoint 34) is just a named,
  otherwise-empty container.
- **Business problem solved**: lets an admin build up a reusable,
  year-agnostic set of dates (ADR-HC02) — e.g. "Independence Day, August
  15" — rather than modeling a holiday as a one-off, per-year object.
- **Expected callers**: `ADMIN` only. Note this nested route is gated by
  the **parent** calendar's `holidayCalendar:update` permission, not a
  separate `holiday:create` permission — the same reuse-the-parent's-
  write-permission shape already used by `POST
  /employees/:id/documents` (gated by `employee:update:any`, not a
  standalone `document:create`).

## 3. Request Headers

| Header                                | Required | Notes                                                  |
| -------------------------------------- | -------- | --------------------------------------------------------- |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `holidayCalendar:update` permission   |
| `Content-Type: application/json`      | **Yes**  |                                                             |

## 4. Path Parameters

| Name | Type          | Required | Description                   |
| ---- | ------------- | -------- | -------------------------------- |
| `id` | string (UUID) | **Yes**  | The parent Holiday Calendar's id |

## 5. Query Parameters

None.

## 6. Request Body

```json
{
  "date": "2026-08-15",
  "name": "Independence Day",
  "isOptional": false
}
```

| Field        | Type    | Required | Description                                                    |
| ------------- | ------- | -------- | ------------------------------------------------------------------ |
| `date`      | string (date) | **Yes** | Coerced to a `Date` (`z.coerce.date()`) — must be unique within this calendar |
| `name`      | string  | **Yes**  | Trimmed, non-empty                                                  |
| `isOptional` | boolean | No       | Defaults to `false` when omitted                                    |

## 7. Validation Rules

- `date`: required, `z.coerce.date()` — accepts any string `Date`
  itself parses (e.g. `"2026-08-15"`, or a full ISO datetime).
- `name`: required, `.trim().min(1, 'Holiday name is required')`.
- `isOptional`: optional boolean, `.default(false)`.
- **Parent existence**: the target `HolidayCalendar` must exist, else
  `404 "Holiday calendar not found"` — checked before the insert is
  attempted.
- **Per-calendar date uniqueness**: enforced by the compound unique
  constraint `@@unique([holidayCalendarId, date])` — a duplicate `date`
  within the *same* calendar returns `409`; the identical `date` in a
  *different* calendar is unaffected (the constraint is scoped per
  calendar, not global).
- Holiday entries are deliberately minimal by design
  (`docs/domain-holiday-calendar.md §4`) — no region/state-level
  sub-scoping field exists; model that as a separate calendar instead.

## 8. Successful Response

```
201 Created

{
  "holiday": {
    "id": "a9b8c7d6-e5f4-4a3b-8c1d-0e9f8a7b6c5d",
    "holidayCalendarId": "f1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "date": "2026-08-15T00:00:00.000Z",
    "name": "Independence Day",
    "isOptional": false,
    "createdAt": "2026-09-13T10:15:02.118Z",
    "updatedAt": "2026-09-13T10:15:02.118Z"
  }
}
```

Verified live. Note `date` is echoed back as a **full ISO datetime
string** (`"2026-08-15T00:00:00.000Z"`), even though only a date
(`"2026-08-15"`) was sent — Prisma stores the column as `DateTime`, and
`z.coerce.date()` parses a bare date string to UTC midnight.

## 9. Error Responses

| Status | Reason                                      | Response (`message`)                                              | When                                                                       |
| ------ | ---------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `400`  | Validation failed                             | `"name: Holiday name is required"` or an unparseable `date`             | Missing/empty `name`, missing or unparseable `date`                            |
| `401`  | Missing/invalid/expired access token           | Same as every other protected endpoint                                | `authMiddleware` failure                                                       |
| `403`  | Caller lacks `holidayCalendar:update`           | `"You do not have permission to perform this action"`                  | `EMPLOYEE`/`MANAGER` token                                                     |
| `404`  | No such holiday calendar                       | `"Holiday calendar not found"`                                        | Invalid/nonexistent `id`                                                        |
| `409`  | Duplicate `date` within this calendar           | `"A holiday already exists on this date in this calendar"`             | Verified live: adding the same `date` twice to the same calendar returns `409` on the 2nd |

## 10. Postman Test Cases

| #   | Case                                              | Expected |
| --- | ---------------------------------------------------- | -------- |
| 1   | Valid add, all fields                                | `201` — verified live |
| 2   | Valid add, `isOptional` omitted                      | `201`, `isOptional: false` |
| 3   | Duplicate `date` in the same calendar                | `409` — verified live |
| 4   | Same `date` added to a *different* calendar           | `201` — no cross-calendar conflict |
| 5   | Empty/whitespace `name`                              | `400`    |
| 6   | Nonexistent parent calendar `id`                     | `404`    |
| 7   | As `EMPLOYEE`/`MANAGER` token                         | `403`    |
| 8   | No token                                             | `401`    |

## 11. Negative Testing

| Scenario                          | Expected                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Malformed JSON body                | `400` from Express's own JSON body-parser, before this route's handler runs |
| Tampered/expired JWT               | `401`                                                                       |
| `date` as an unparseable string (e.g. `"not-a-date"`) | `400` — `z.coerce.date()` rejects it                          |
| `name` as a number/array           | `400` — Zod's `.string()` rejects non-string types                          |
| `isOptional` as a non-boolean (e.g. `"yes"`)         | `400` — Zod's `.boolean()` rejects non-boolean types           |

## 12. Edge Cases

| Scenario                                                        | Expected Behavior                                                                                                                                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent adds with the same `date` in the same calendar        | One succeeds, the other gets `409` — the compound unique index (`holidayCalendarId`, `date`) is the real guarantee, translated from Prisma's `P2002`                                    |
| Sending a `date` with a non-midnight time component (e.g. `"2026-08-15T10:00:00Z"`) alongside an existing bare-date (`"2026-08-15"`) entry | The uniqueness constraint compares the exact stored `DateTime` value, not just the calendar-date component — these would **not** collide, since they parse to two different `DateTime` values. A known nuance from reading the schema/validation code, not a demonstrated bug and not exercised live in this pass (every live test used bare date strings only). |
| Adding a holiday to a calendar that is `INACTIVE`                | Succeeds — `status` only gates *Branch assignment* of the calendar (ADR-HC03), never whether holidays can be managed within it.                                                        |

## 13. Security Testing

- **Authorization**: confirm neither `MANAGER` nor `EMPLOYEE` can add a
  holiday — same `ADMIN`-only scoping as the parent calendar's own
  mutations, via the identical `holidayCalendar:update` permission.
- **Mass assignment**: only `date`/`name`/`isOptional` are read from the
  body — Zod strips anything else (e.g. an attempted `id` or
  `holidayCalendarId` in the body is ignored; the path parameter is
  always the source of truth for `holidayCalendarId`).

## 14. Database Impact

- **Tables affected**: `Holiday` (insert), `AuditLog` (insert).
- **Transactions**: the `Holiday` insert and the `AuditLog` insert happen
  inside one `prisma.$transaction`.

## 15. Request Lifecycle

```
POST /api/v1/holiday-calendars/:id/holidays
    ↓
authMiddleware
    ↓
requirePermission('holidayCalendar:update')
    ↓ (403 if not granted)
validateMiddleware(createHolidaySchema)
    ↓ (400 if invalid)
holidayCalendar.controller.addHoliday → holidayCalendar.service.addHoliday(holidayCalendarId, data, actor)
    ├─ holidayCalendarRepository.findById(holidayCalendarId) → not found → 404
    └─ prisma.$transaction:
         ├─ holidayRepository.create({ ...data, holidayCalendarId }, tx)   [P2002 on duplicate date → 409]
         └─ auditLogRepository.create({ action: 'CREATE', entityType: 'Holiday', afterData, ... }, tx)
    ↓
201 { holiday }
```

## 16. Performance Notes

One indexed existence lookup (parent calendar) plus one insert (relying
on the compound unique index for conflict detection, no separate
pre-check query) plus one audit-log insert — no notable performance
concerns; holiday counts per calendar are expected to stay small (roughly
one calendar year's worth of dates).

## 17. Interview Notes

- **Q: Why does adding a Holiday reuse `holidayCalendar:update` instead
  of a dedicated permission?** Consistency with the Employee/
  EmployeeDocument precedent — a child entity's CRUD is gated by its
  parent's own mutation permission rather than growing a new, narrowly-
  scoped permission per child action. It also matches this domain's own
  reality: managing a calendar's holiday entries *is* "updating the
  calendar," conceptually, even though the two live in separate tables.
- **Q: Why is `date` a full `DateTime` column instead of a `DATE`-only
  type?** Prisma/Postgres modeling convenience — no domain requirement
  calls for storing a time-of-day, and the compound unique constraint
  still does its job as long as every caller consistently sends bare
  date strings (which coerce to UTC midnight). See Edge Cases above for
  the theoretical (unexercised) sharp edge this creates.

## 18. cURL Examples

```bash
curl -i -X POST http://localhost:3000/api/v1/holiday-calendars/$HOLIDAY_CALENDAR_ID/holidays \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-08-15","name":"Independence Day"}'
```

## 19. Postman Collection Notes

Save the returned `holiday.id` as `{{holidayId}}` — used by endpoints 41
and 42. Requires `{{holidayCalendarId}}` from `POST /holiday-calendars`
(endpoint 34).

## 20. Testing Checklist

- ✅ Valid add (with and without `isOptional`) → `201`
- ✅ `date` echoed back as a full ISO datetime string (verified live)
- ✅ Duplicate `date` in the same calendar → `409` (verified live)
- ✅ Same `date` in a different calendar → `201`, no conflict
- ✅ `403` as `EMPLOYEE`/`MANAGER`, `404` for nonexistent calendar, `401` with no token
- ✅ `AuditLog` row created, `entityType: 'Holiday'`

---

---

# 40. `GET /holiday-calendars/:id/holidays`

## 1. Endpoint Information

```
Feature:            Holiday Calendar Domain (2026-09-13, feature/19-holiday-calendar-domain)
Endpoint:           List a Holiday Calendar's Holiday entries
Description:        Returns every Holiday entry belonging to a calendar, ordered by date ascending
Method:             GET
URL:                /api/v1/holiday-calendars/:id/holidays
API Version:        v1
Module:             modules/holidayCalendars
Authentication:     Yes (Bearer access token)
Authorization:      `holidayCalendar:read` permission (granted to every role)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: this is the only way to see a calendar's actual
  dated holidays — `GET /holiday-calendars/:id` (endpoint 36)
  deliberately never embeds them.
- **Business problem solved**: lets any authenticated user review a
  calendar's contents, e.g. before assigning it to a Branch.
- **Expected callers**: every role — same broad `holidayCalendar:read`
  grant as the parent calendar's own `GET` endpoints.

## 3. Request Headers

| Header                               | Required | Notes                                                |
| -------------------------------------- | -------- | ------------------------------------------------------ |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to the `holidayCalendar:read` permission |

## 4. Path Parameters

| Name | Type          | Required | Description                   |
| ---- | ------------- | -------- | -------------------------------- |
| `id` | string (UUID) | **Yes**  | The parent Holiday Calendar's id |

## 5. Query Parameters

None — no pagination/search/filter/sort on this list, the same honestly
acknowledged gap as `GET /employees/:id/documents`; a calendar's holiday
count is expected to stay small (roughly a year's worth of dates).

## 6. Request Body

None.

## 7. Validation Rules

No body/query to validate. Only the permission check and the parent
calendar's existence.

## 8. Successful Response

```
200 OK

{
  "holidays": [
    {
      "id": "a9b8c7d6-e5f4-4a3b-8c1d-0e9f8a7b6c5d",
      "holidayCalendarId": "f1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "date": "2026-08-15T00:00:00.000Z",
      "name": "Independence Day",
      "isOptional": false,
      "createdAt": "2026-09-13T10:15:02.118Z",
      "updatedAt": "2026-09-13T10:15:02.118Z"
    }
  ]
}
```

Verified live. `holidays` is ordered by `date` **ascending**
(`orderBy: { date: 'asc' }`) — the opposite convention from `GET
/employees/:id/documents`'s newest-first ordering, since chronological
order is what's actually useful for a holiday list.

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                 | When                                     |
| ------ | ------------------------------------ | -------------------------------------------------------- | ------------------------------------------- |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                  | `authMiddleware` failure                  |
| `403`  | Caller lacks `holidayCalendar:read`  | `"You do not have permission to perform this action"`   | Not expected in practice                  |
| `404`  | No such holiday calendar            | `"Holiday calendar not found"`                          | Invalid/nonexistent `id`                  |

## 10. Postman Test Cases

| #   | Case                             | Expected |
| --- | ----------------------------------- | -------- |
| 1   | Calendar with holidays              | `200`, ordered by date ascending — verified live |
| 2   | Calendar with zero holidays         | `200`, `{ "holidays": [] }` |
| 3   | Nonexistent calendar `id`           | `404`    |
| 4   | As `EMPLOYEE` token                 | `200` — verified live |
| 5   | No token                            | `401`    |

## 11. Negative Testing

| Scenario                   | Expected |
| ----------------------------- | -------- |
| Malformed (non-UUID) `id`     | `404`    |
| Tampered/expired JWT          | `401`    |

## 12. Edge Cases

| Scenario                             | Expected Behavior                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| Calendar with zero Holiday entries       | `200`, `{ "holidays": [] }` — not an error                                        |
| Two Holiday entries with the same `date` | Impossible in practice — the compound unique constraint prevents this at the database level; not a state this endpoint needs to handle |

## 13. Security Testing

No BOLA concern — `Holiday`/`HolidayCalendar` have no ownership
dimension; every grant of `holidayCalendar:read` sees identical data
regardless of who's asking.

## 14. Database Impact

Read-only — `HolidayCalendar.findUnique` (existence check) followed by
`Holiday.findMany` ordered by `date asc`, indexed on `holidayCalendarId`.

## 15. Request Lifecycle

```
GET /api/v1/holiday-calendars/:id/holidays
    ↓
authMiddleware
    ↓
requirePermission('holidayCalendar:read')
    ↓ (403 if not granted)
holidayCalendar.controller.listHolidays → holidayCalendar.service.listHolidays(holidayCalendarId)
    ├─ holidayCalendarRepository.findById(holidayCalendarId) → not found → 404
    └─ holidayRepository.findAllByCalendarId(holidayCalendarId)   [orderBy: { date: 'asc' }]
    ↓
200 { holidays: [...] }
```

## 16. Performance Notes

One indexed existence lookup plus one indexed, ordered `findMany` — fine
at this feature's expected small per-calendar holiday counts; pagination
is a natural future addition if that ever changes, not built now (same
honest-gap framing as `GET /employees/:id/documents`).

## 17. Interview Notes

- **Q: Why order by `date` ascending here but `createdAt` descending on
  `GET /employees/:id/documents`?** They answer different questions — a
  document list is naturally "what did we most recently add," while a
  holiday list is naturally "what's the calendar order of these dates,"
  independent of the order they happened to be entered in.

## 18. cURL Examples

```bash
curl -i http://localhost:3000/api/v1/holiday-calendars/$HOLIDAY_CALENDAR_ID/holidays \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 19. Postman Collection Notes

Run after `POST /holiday-calendars/:id/holidays` to confirm the newly
added entry appears in the correct chronological position.

## 20. Testing Checklist

- ✅ `200` as `ADMIN` and `EMPLOYEE` alike (verified live)
- ✅ Ordered by `date` ascending (verified live)
- ✅ Empty array (not an error) when no holidays exist
- ✅ `404` for nonexistent calendar
- ✅ `401` with no token

---

---

# 41. `PATCH /holiday-calendars/:id/holidays/:holidayId`

## 1. Endpoint Information

```
Feature:            Holiday Calendar Domain (2026-09-13, feature/19-holiday-calendar-domain)
Endpoint:           Update a Holiday entry
Method:             PATCH
URL:                /api/v1/holiday-calendars/:id/holidays/:holidayId
API Version:        v1
Module:             modules/holidayCalendars
Authentication:     Yes (Bearer access token)
Authorization:      `holidayCalendar:update` permission required (ADMIN only)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: corrects a mistyped holiday name, adjusts its date,
  or flips its `isOptional` flag without deleting and re-adding it.
- **Expected callers**: `ADMIN` only — same reused
  `holidayCalendar:update` permission as adding/removing entries
  (endpoints 39 and 42).

## 3. Request Headers

| Header                                | Required | Notes                                                  |
| -------------------------------------- | -------- | --------------------------------------------------------- |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `holidayCalendar:update` permission   |
| `Content-Type: application/json`      | **Yes**  |                                                             |

## 4. Path Parameters

| Name        | Type          | Required | Description                   |
| ------------ | ------------- | -------- | -------------------------------- |
| `id`        | string (UUID) | **Yes**  | The parent Holiday Calendar's id |
| `holidayId` | string (UUID) | **Yes**  | The Holiday entry's id           |

## 5. Query Parameters

None.

## 6. Request Body

```json
{ "name": "Christmas" }
```

| Field        | Type    | Required | Description                                    |
| ------------- | ------- | -------- | -------------------------------------------------- |
| `date`      | string (date) | No | Coerced to a `Date`; must remain unique within this calendar |
| `name`      | string  | No       | Trimmed, non-empty when provided                    |
| `isOptional` | boolean | No       | No default applied on update — omit to leave unchanged |

All fields are independently optional (partial update) — send only the
field(s) being changed.

## 7. Validation Rules

Same field-level rules as `POST .../holidays` (endpoint 39), all made
optional. Unlike `createHolidaySchema`, `isOptional` here has **no**
`.default(false)` — omitting it leaves the existing value untouched,
whereas omitting it at creation time sets it to `false`.

- **Parent existence**: the `HolidayCalendar` at `:id` must exist, else
  `404 "Holiday calendar not found"`.
- **Holiday existence, scoped to the parent**: the lookup is always
  `(holidayId, holidayCalendarId)` together
  (`holidayRepository.findById(id, holidayCalendarId)`) — a `holidayId`
  that exists but belongs to a *different* calendar is treated
  identically to a nonexistent one: `404 "Holiday not found"`. Same
  scoped-lookup convention as `DELETE
  /employees/:id/documents/:documentId`.
- **Date uniqueness on change**: changing `date` to one already used by
  another entry in the *same* calendar returns `409`, identical message
  to creation.

## 8. Successful Response

```
200 OK

{
  "holiday": {
    "id": "a9b8c7d6-e5f4-4a3b-8c1d-0e9f8a7b6c5d",
    "holidayCalendarId": "f1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "date": "2026-12-25T00:00:00.000Z",
    "name": "Christmas",
    "isOptional": false,
    "createdAt": "2026-09-13T10:16:40.902Z",
    "updatedAt": "2026-09-13T10:17:05.331Z"
  }
}
```

Verified live for a `name`-only edit (`"Christms"` → `"Christmas"`).

## 9. Error Responses

| Status | Reason                                                   | Response (`message`)                                              | When                                                                 |
| ------ | -------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `400`  | Validation failed                                        | e.g. `"name: Holiday name is required"`, or an unparseable `date`         | Empty/whitespace-only `name` if provided, unparseable `date`             |
| `401`  | Missing/invalid/expired access token                     | Same as every other protected endpoint                                | `authMiddleware` failure                                                 |
| `403`  | Caller lacks `holidayCalendar:update`                     | `"You do not have permission to perform this action"`                  | `EMPLOYEE`/`MANAGER` token                                               |
| `404`  | No such holiday calendar                                 | `"Holiday calendar not found"`                                        | Invalid/nonexistent `id`                                                  |
| `404`  | Nonexistent Holiday, or belongs to a different calendar   | `"Holiday not found"`                                                  | Invalid `holidayId`, or a real Holiday id under the wrong calendar        |
| `409`  | New `date` collides with another entry in this calendar   | `"A holiday already exists on this date in this calendar"`             | Same message shape as `POST .../holidays`'s duplicate-date `409`          |

## 10. Postman Test Cases

| #   | Case                                            | Expected         |
| --- | ---------------------------------------------------- | ---------------- |
| 1   | Update `name` only                                    | `200` — verified live |
| 2   | Update `date` to a free slot in the same calendar      | `200`    |
| 3   | Update `date` to one already used in the same calendar | `409`    |
| 4   | Flip `isOptional`                                     | `200`    |
| 5   | Nonexistent `holidayId`                                | `404`    |
| 6   | Valid `holidayId` under the wrong `id` (calendar)      | `404`, `"Holiday not found"` |
| 7   | Nonexistent calendar `id`                              | `404`, `"Holiday calendar not found"` |
| 8   | As `EMPLOYEE`/`MANAGER` token                          | `403`    |
| 9   | No token                                              | `401`    |

## 11. Negative Testing

| Scenario                          | Expected                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Malformed JSON body                | `400` from Express's own JSON body-parser, before this route's handler runs |
| Tampered/expired JWT               | `401`                                                                       |
| `date` as an unparseable string    | `400`                                                                        |
| Empty body `{}`                    | `200`, no-op update — not separately verified live in this pass             |

## 12. Edge Cases

| Scenario                                                        | Expected Behavior                                                                                                                                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Updating a Holiday's `date` to the same value it already has     | `200`, no conflict — the record collides only with *other* rows' `(holidayCalendarId, date)`, never with its own current value, since Prisma's update targets `where: { id }` directly, not a separate pre-check against itself |
| Updating a Holiday in a calendar that is `INACTIVE`               | Succeeds — same reasoning as adding one (endpoint 39): `status` only gates Branch assignability, not holiday management                                                                |

## 13. Security Testing

- **Authorization**: confirm neither `MANAGER` nor `EMPLOYEE` can update
  a Holiday entry.
- **BOLA-adjacent**: confirm a `holidayId` belonging to a different
  calendar cannot be edited by supplying that other calendar's `id` in
  the path mismatched with this one's `holidayId` — correctly returns
  `404`, not a cross-calendar edit.
- **Mass assignment**: only `date`/`name`/`isOptional` are read from the
  body — Zod strips anything else.

## 14. Database Impact

- **Tables affected**: `Holiday` (update), `AuditLog` (insert).
- **Transactions**: the `Holiday` update and the `AuditLog` insert happen
  inside one `prisma.$transaction`.

## 15. Request Lifecycle

```
PATCH /api/v1/holiday-calendars/:id/holidays/:holidayId
    ↓
authMiddleware
    ↓
requirePermission('holidayCalendar:update')
    ↓ (403 if not granted)
validateMiddleware(updateHolidaySchema)
    ↓ (400 if invalid)
holidayCalendar.controller.updateHoliday → holidayCalendar.service.updateHoliday(holidayCalendarId, holidayId, data, actor)
    ├─ holidayCalendarRepository.findById(holidayCalendarId) → not found → 404 "Holiday calendar not found"
    ├─ holidayRepository.findById(holidayId, holidayCalendarId) → not found → 404 "Holiday not found"
    └─ prisma.$transaction:
         ├─ holidayRepository.update(holidayId, data, tx)   [P2002 on duplicate date → 409]
         └─ auditLogRepository.create({ action: 'UPDATE', entityType: 'Holiday', beforeData, afterData, ... }, tx)
    ↓
200 { holiday }
```

## 16. Performance Notes

Two indexed lookups (calendar existence, scoped Holiday lookup) plus one
update plus one audit-log insert — no notable performance concerns.

## 17. Interview Notes

- **Q: Why two different 404 messages ("Holiday calendar not found" vs
  "Holiday not found") instead of one generic one?** Precision for
  debugging/API consumers — the two failures mean genuinely different
  things (a bad top-level id vs. a bad nested id), the identical
  reasoning already applied to `DELETE
  /employees/:id/documents/:documentId`'s two distinct 404s.
- **Q: Why doesn't `isOptional` default to `false` on update the way it
  does on create?** Because `undefined` on a `PATCH` means "don't touch
  this field," not "set it to its default" — applying `.default(false)`
  here would silently clear an existing `isOptional: true` entry every
  time any *other* field was edited, which is never the intended
  semantics of a partial update.

## 18. cURL Examples

```bash
curl -i -X PATCH http://localhost:3000/api/v1/holiday-calendars/$HOLIDAY_CALENDAR_ID/holidays/$HOLIDAY_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Christmas"}'
```

## 19. Postman Collection Notes

Requires both `{{holidayCalendarId}}` and `{{holidayId}}` saved from
endpoint 34 and endpoint 39 respectively.

## 20. Testing Checklist

- ✅ `name`-only edit → `200` (verified live)
- ✅ `date` change to a free slot → `200`
- ✅ `date` change colliding with another entry → `409`
- ✅ `404` for nonexistent `holidayId`, and for a `holidayId` under the wrong calendar
- ✅ `404` for nonexistent calendar `id`
- ✅ `403` as `EMPLOYEE`/`MANAGER`, `401` with no token
- ✅ `AuditLog` row created with correct before/after snapshots

---

---

# 42. `DELETE /holiday-calendars/:id/holidays/:holidayId`

## 1. Endpoint Information

```
Feature:            Holiday Calendar Domain (2026-09-13, feature/19-holiday-calendar-domain)
Endpoint:           Remove a Holiday entry
Description:        Permanently removes a single Holiday entry from a calendar
Method:             DELETE
URL:                /api/v1/holiday-calendars/:id/holidays/:holidayId
API Version:        v1
Module:             modules/holidayCalendars
Authentication:     Yes (Bearer access token)
Authorization:      `holidayCalendar:update` permission required (ADMIN only)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: removes an incorrectly-added or no-longer-observed
  holiday from a calendar.
- **Business problem solved**: unlike the calendar itself (endpoint 38),
  a Holiday entry has **no reference restriction** — no other domain
  holds a direct reference to a specific `Holiday` row by id (consumers
  resolve "is date X a holiday" by date via
  `isDateHolidayInCalendar`, never by `Holiday.id`), so removal is always
  unconditional.
- **Expected callers**: `ADMIN` only, same reused `holidayCalendar:update`
  permission as endpoints 39 and 41.

## 3. Request Headers

| Header                                | Required | Notes                                                  |
| -------------------------------------- | -------- | --------------------------------------------------------- |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `holidayCalendar:update` permission   |

## 4. Path Parameters

| Name        | Type          | Required | Description                   |
| ------------ | ------------- | -------- | -------------------------------- |
| `id`        | string (UUID) | **Yes**  | The parent Holiday Calendar's id |
| `holidayId` | string (UUID) | **Yes**  | The Holiday entry's id           |

## 5. Query Parameters

None.

## 6. Request Body

None.

## 7. Validation Rules

No body to validate — only the calendar and Holiday existence checks
described in the Request Lifecycle below. Same scoped-lookup convention
as `PATCH` (endpoint 41): a `holidayId` that exists but belongs to a
*different* calendar is treated identically to a nonexistent one
(`404`).

## 8. Successful Response

```
200 OK

{
  "message": "Holiday deleted successfully"
}
```

Verified live. Deliberately doesn't echo the deleted entry — nothing
further the caller needs, same convention as `DELETE
/employees/:id/documents/:documentId`.

## 9. Error Responses

| Status | Reason                                                   | Response (`message`)                                  | When                                                                 |
| ------ | -------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| `401`  | Missing/invalid/expired access token                     | Same as every other protected endpoint                | `authMiddleware` failure                                             |
| `403`  | Caller lacks `holidayCalendar:update`                     | `"You do not have permission to perform this action"` | `EMPLOYEE`/`MANAGER` token                                            |
| `404`  | No such holiday calendar                                 | `"Holiday calendar not found"`                        | Invalid/nonexistent `id`                                              |
| `404`  | Nonexistent Holiday, or belongs to a different calendar   | `"Holiday not found"`                                  | Invalid `holidayId`, or a real Holiday id under the wrong calendar    |

## 10. Postman Test Cases

| #   | Case                               | Expected         |
| --- | ----------------------------------- | ---------------- |
| 1   | Valid delete                        | `200` — verified live |
| 2   | Delete the same `holidayId` again   | `404`, not `409` |
| 3   | Nonexistent `holidayId`             | `404`            |
| 4   | Valid `holidayId` under the wrong calendar `id` | `404`  |
| 5   | Nonexistent calendar `id`           | `404`            |
| 6   | As `EMPLOYEE`/`MANAGER` token        | `403`            |
| 7   | No token                            | `401`            |

## 11. Negative Testing

Same category as `DELETE /employees/:id/documents/:documentId`: malformed
non-UUID ids → `404`; tampered JWT → `401`; wrong method → `404`.

## 12. Edge Cases

| Scenario                                                            | Expected Behavior                                                                                                                                             |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /holiday-calendars/:id/holidays` immediately after deleting one  | The deleted entry no longer appears — hard delete, not soft (the `AuditLog`'s `beforeData` already preserves its historical metadata) — verified live.        |
| Deleting the last remaining Holiday in a calendar                    | Succeeds; the calendar itself is untouched and can still be listed/fetched — an empty holiday set is a valid state, not an error.                              |
| Deleting a Holiday whose calendar is later deleted too               | If both are removed in the intended order (holiday, then calendar), no issue; if the calendar is hard-deleted directly while this Holiday still exists, it cascades automatically at the DB level (`onDelete: Cascade`) regardless — no reference restriction either way. |

## 13. Security Testing

- **Authorization**: confirm neither `MANAGER` nor `EMPLOYEE` can delete
  a Holiday entry.
- **Idempotency under retry**: a retried `DELETE` after a timeout gets a
  safe `404` on the second attempt.
- **Mass assignment**: N/A — no request body.

## 14. Database Impact

- **Tables affected**: `Holiday` (hard delete), `AuditLog` (insert).
- **Transactions**: the `Holiday` delete and the `AuditLog` insert commit
  together inside one `prisma.$transaction`. Unlike the calendar's own
  delete (endpoint 38), there is no reference-count check to run first —
  removal is always unconditional.

## 15. Request Lifecycle

```
DELETE /api/v1/holiday-calendars/:id/holidays/:holidayId
    ↓
authMiddleware
    ↓
requirePermission('holidayCalendar:update')
    ↓ (403 if not granted)
holidayCalendar.controller.removeHoliday → holidayCalendar.service.removeHoliday(holidayCalendarId, holidayId, actor)
    ├─ holidayCalendarRepository.findById(holidayCalendarId) → not found → 404 "Holiday calendar not found"
    ├─ holidayRepository.findById(holidayId, holidayCalendarId) → not found → 404 "Holiday not found"
    └─ prisma.$transaction:
         ├─ holidayRepository.remove(holidayId, tx)
         └─ auditLogRepository.create({ action: 'DELETE', entityType: 'Holiday', beforeData, afterData: null, ... }, tx)
    ↓
200 { message: "Holiday deleted successfully" }
```

## 16. Performance Notes

Two indexed lookups plus one delete plus one audit-log insert — no
notable performance concerns.

## 17. Interview Notes

- **Q: Why is a Holiday entry freely deletable with zero reference
  checks, when the parent calendar requires zero Branch references
  first?** Because nothing in the system references a *specific*
  `Holiday` row by id — the one reusable query this domain exposes,
  `isDateHolidayInCalendar(holidayCalendarId, date)`, resolves "is this
  date a holiday" by re-querying the date each time, not by holding onto
  a `Holiday.id` anywhere. There is structurally nothing that could be
  left dangling by removing one, unlike a Branch's
  `holidayCalendarId` pointing at a calendar that no longer exists.
- **Q: Why is `Holiday` a hard delete when the parent `HolidayCalendar`
  uses a `status` field for its own lifecycle?** The two entities have
  different lifecycle needs — a calendar is a long-lived, named container
  that organizations expect to retire-and-keep-history for (hence
  `status`), while an individual Holiday entry being wrong (typo'd name,
  wrong date) is a correction, not a business event worth preserving a
  historical trace of beyond what `AuditLog`'s `beforeData` already
  captures — the same reasoning already applied to
  `EmployeeDocument`'s hard delete.

## 18. cURL Examples

```bash
curl -i -X DELETE http://localhost:3000/api/v1/holiday-calendars/$HOLIDAY_CALENDAR_ID/holidays/$HOLIDAY_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 19. Postman Collection Notes

Run this **after** `POST /holiday-calendars/:id/holidays` in any test
sequence — save the returned `holiday.id` as `{{holidayId}}` beforehand.

## 20. Testing Checklist

- ✅ Valid delete → `200` (verified live)
- ✅ Second delete on the same `holidayId` → `404`, not `409`
- ✅ `GET /holiday-calendars/:id/holidays` no longer lists the deleted entry (verified live)
- ✅ `404` for nonexistent `holidayId`, a `holidayId` under the wrong calendar, and a nonexistent calendar `id`
- ✅ `403` as `EMPLOYEE`/`MANAGER`, `401` with no token
- ✅ `AuditLog` row created for the deletion, `entityType: 'Holiday'`
- ✅ No reference-count check performed — deletion always unconditional

---

---

# 43. `POST /shifts`

## 1. Endpoint Information

```
Feature:            Shift Domain (2026-09-15, feature/20-shift-domain)
Endpoint:           Create Shift
Description:        Creates a new named recurring working-pattern (start/end time + working days)
Method:             POST
URL:                /api/v1/shifts
API Version:        v1
Module:             modules/shifts
Authentication:     Yes (Bearer access token)
Authorization:      `shift:create` permission required (ADMIN only, as seeded)
Public/Protected:   Protected
```

## 2. Purpose

- **Why it exists**: closes the gap `docs/domain-shift.md` names — the
  future Attendance domain cannot determine "was this person late," "did
  they work overtime," or "was their absence on a working day" without a
  baseline expectation of when an employee is supposed to work. Without
  Shift, that expectation would need to be hard-coded or duplicated
  inside Attendance itself.
- **Business problem solved**: lets an organization define recurring
  working patterns ("Day Shift 9-6", "Night Shift 10pm-7am") as real,
  referenceable data, distinct from Holiday Calendar's dated, occasional
  exceptions.
- **Expected callers**: `ADMIN` only — the same tighter-than-`employee:*`
  scoping already applied to Branch/Department/Designation/Holiday
  Calendar (ADR-SH05, resolved identically to ADR-B07/D08/DS06/HC06).

## 3. Request Headers

| Header                                 | Required | Notes                                             |
| --------------------------------------- | -------- | ---------------------------------------------------- |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `shift:create` permission     |
| `Content-Type: application/json`      | **Yes**  |                                                     |

## 4. Path Parameters

None.

## 5. Query Parameters

None.

## 6. Request Body

```json
{
  "name": "Day Shift 9-6",
  "startTime": "09:00",
  "endTime": "18:00",
  "workingDays": ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]
}
```

| Field         | Type            | Required | Description                                             |
| ------------- | --------------- | -------- | -------------------------------------------------------- |
| `name`        | string          | **Yes**  | Trimmed, non-empty, **unique case-insensitively** across all shifts (`"Day Shift 9-6"` and `"day shift 9-6"` conflict) |
| `startTime`   | string          | **Yes**  | 24-hour `"HH:mm"` format, validated by `/^([01]\d\|2[0-3]):[0-5]\d$/`, e.g. `"09:00"` |
| `endTime`     | string          | **Yes**  | Same `"HH:mm"` format as `startTime`, e.g. `"18:00"`. **May be earlier than `startTime`** — see §7/§12, an overnight shift is valid, not an error |
| `workingDays` | array of string | **Yes**  | A non-empty subset of the seven `Weekday` enum values: `MONDAY`, `TUESDAY`, `WEDNESDAY`, `THURSDAY`, `FRIDAY`, `SATURDAY`, `SUNDAY` |

## 7. Validation Rules

- `name`: required, `.trim().min(1)` — a whitespace-only value fails with
  `"Shift name is required"`.
- `startTime`/`endTime`: required, each matched against
  `/^([01]\d|2[0-3]):[0-5]\d$/` (24-hour `"HH:mm"` only) — any other shape
  (`"9:00"`, `"25:00"`, `"09:60"`, a full ISO datetime) fails with
  `'Must be a 24-hour "HH:mm" time, e.g. "09:00"'`.
- `workingDays`: required array, `.min(1)` — an empty array fails with
  `"workingDays must be a non-empty subset of the seven weekdays"`. Each
  entry must be one of the seven `Weekday` enum values; any other string
  fails Zod's enum check.
- `status` is **not** accepted at creation — every new shift starts
  `ACTIVE`; status can only be changed afterward via `PATCH /shifts/:id`.
- **`endTime < startTime` is deliberately accepted, not rejected** — this
  is the documented overnight-shift interpretation (`docs/domain-shift.md`
  §4, ADR-SH03): a shift crossing midnight (e.g. `"22:00"`-`"07:00"`)
  belongs to the calendar day it starts on. There is no validation-layer
  rejection of this case; it's a business-rule interpretation applied by
  `shiftService.isOvernightShift`, not a Zod refinement.
- **Case-insensitive uniqueness on `name`** — the same convention already
  used by Department/Designation/Holiday Calendar. Verified live: creating
  `"day shift 9-6"` after `"Day Shift 9-6"` already exists returns `409`,
  not `201`.

## 8. Successful Response

```
201 Created

{
  "shift": {
    "id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
    "name": "Day Shift 9-6",
    "startTime": "09:00",
    "endTime": "18:00",
    "workingDays": ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
    "status": "ACTIVE",
    "createdAt": "2026-09-15T09:12:04.221Z",
    "updatedAt": "2026-09-15T09:12:04.221Z"
  }
}
```

Verified live against the real dev server.

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                | When                                                                 |
| ------ | ------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `400`  | Validation failed                   | e.g. `"name: Shift name is required"`, `'startTime: Must be a 24-hour "HH:mm" time, e.g. "09:00"'`, `"workingDays: workingDays must be a non-empty subset of the seven weekdays"` | Empty/whitespace-only `name`, malformed `startTime`/`endTime`, empty/invalid `workingDays` |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                | `authMiddleware` failure                                              |
| `403`  | Caller lacks `shift:create`         | `"You do not have permission to perform this action"` | `EMPLOYEE` token — verified live                                       |
| `409`  | Duplicate `name` (case-insensitive) | `"A shift with this name already exists"`             | Verified live: `"day shift 9-6"` after `"Day Shift 9-6"` exists → `409` |

## 10. Postman Test Cases

| #   | Case                              | Expected |
| --- | ---------------------------------- | -------- |
| 1   | Valid create, day shift            | `201`    |
| 2   | Valid create, overnight shift (`startTime` > `endTime`) | `201` — verified live |
| 3   | Duplicate `name`, different case  | `409` — verified live |
| 4   | Empty/whitespace `name`            | `400`    |
| 5   | Malformed `startTime`/`endTime` (e.g. `"9:00"`, `"25:00"`) | `400`    |
| 6   | Empty `workingDays` array          | `400`    |
| 7   | `workingDays` entry outside the enum (e.g. `"FUNDAY"`) | `400`    |
| 8   | As `MANAGER`/`EMPLOYEE` token       | `403` — verified live for `EMPLOYEE` |
| 9   | No token                          | `401`    |

## 11. Negative Testing

| Scenario                          | Expected                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Malformed JSON body                | `400` from Express's own JSON body-parser                                  |
| Tampered/expired JWT               | `401`                                                                       |
| `name`/`startTime`/`endTime` as a number/array | `400` — Zod's `.string()` rejects non-string types             |
| `workingDays` as a string instead of an array | `400` — Zod's `.array()` rejects non-array types                |
| Extremely long `name`              | Not separately bounded by an explicit max-length rule today — a known, undemonstrated gap, same class as `Branch.name`/`Designation.name`/`HolidayCalendar.name` |

## 12. Edge Cases

| Scenario                                                        | Expected Behavior                                                                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent creates with the same name (any case)                | One succeeds, the other gets `409` via the DB's own unique constraint on the exact-case `name` column (the case-insensitive pre-check can be beaten by a race the same way Branch's/Department's/Designation's can) |
| `endTime` earlier than `startTime` (e.g. `"22:00"`-`"07:00"`)    | `201` — accepted as an overnight shift, not an error (ADR-SH03). `shiftService.isOvernightShift({ startTime, endTime })` returns `true` for this shift, though that primitive isn't exposed by this endpoint's own response — it's consumed internally/by future Attendance code. |
| `startTime === endTime`                                          | `201` — accepted; not separately rejected as a zero-length shift, a known, undemonstrated gap |
| `workingDays` containing a duplicate entry (e.g. `["MONDAY", "MONDAY"]`) | `201` — accepted as-is; no de-duplication is performed |

## 13. Security Testing

- **Authorization**: confirm `MANAGER` cannot create a shift — verified
  live, same `ADMIN`-only scoping as Branch/Department/Designation/
  Holiday Calendar.
- **Mass assignment**: only `name`/`startTime`/`endTime`/`workingDays` are
  read from the body — an attempted `status: "ACTIVE"` or `id` is
  silently ignored, not applied.

## 14. Database Impact

- **Tables affected**: `Shift` (insert), `AuditLog` (insert).
- **Transactions**: the `Shift` insert and the `AuditLog` insert happen
  inside one `prisma.$transaction`.

## 15. Request Lifecycle

```
POST /api/v1/shifts
    ↓
authMiddleware
    ↓
requirePermission('shift:create')
    ↓ (403 if not granted)
validateMiddleware(createShiftSchema)
    ↓ (400 if invalid)
shift.controller.create → shift.service.createShift(data, actor)
    ├─ shiftRepository.findByName(name) [case-insensitive] → existing → 409
    └─ prisma.$transaction:
         ├─ shiftRepository.create(data, tx)
         └─ auditLogRepository.create({ action: 'CREATE', afterData, ... }, tx)
    ↓ (catch) Prisma P2002 → 409 (race-condition fallback)
201 { shift }
```

## 16. Performance Notes

One case-insensitive `name` lookup plus one insert plus one audit-log
insert — no notable performance concerns.

## 17. Interview Notes

- **Q: Why is the overnight-shift interpretation decided now, while most
  other future-facing concerns in this review are deferred?** Because it's
  a small, cheap-to-decide-now detail baked into fields already being
  designed (`startTime`/`endTime`), while getting the day-boundary
  semantics wrong would corrupt Attendance's future day-attribution logic
  in a way that's expensive to retroactively fix (`docs/domain-shift.md`
  §7). Rotation/rostering, by contrast, is a genuinely bigger, separate
  feature deferred safely (ADR-SH04).
- **Q: Why are `startTime`/`endTime` plain `"HH:mm"` strings instead of a
  `DateTime`?** Postgres/Prisma have no first-class time-only type in this
  stack, and a `DateTime` would force an arbitrary date component onto a
  value that's semantically time-of-day only. Zero-padded `"HH:mm"`
  strings sort lexicographically the same as chronologically, which is
  what `shiftService.isOvernightShift` relies on.

## 18. cURL Examples

```bash
curl -i -X POST http://localhost:3000/api/v1/shifts \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Day Shift 9-6","startTime":"09:00","endTime":"18:00","workingDays":["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY"]}'
```

```bash
# An overnight shift - endTime earlier than startTime is valid (ADR-SH03)
curl -i -X POST http://localhost:3000/api/v1/shifts \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Night Shift 10pm-7am","startTime":"22:00","endTime":"07:00","workingDays":["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY"]}'
```

## 19. Postman Collection Notes

Save the returned `shift.id` as `{{shiftId}}` — used by every other Shift
endpoint and by `POST`/`PATCH /employees`'s `shiftId` field.

## 20. Testing Checklist

- ✅ Valid create (day shift and overnight shift) → `201`
- ✅ Duplicate `name`, case-insensitive → `409` (verified live)
- ✅ Empty/whitespace `name`, malformed `startTime`/`endTime`, empty `workingDays` → `400`
- ✅ `403` as `MANAGER`/`EMPLOYEE`, `401` with no token
- ✅ `AuditLog` row created

---

---

# 44. `GET /shifts`

## 1. Endpoint Information

```
Feature:            Shift Domain (2026-09-15, feature/20-shift-domain)
Endpoint:           List Shift records
Method:             GET
URL:                /api/v1/shifts
API Version:        v1
Module:             modules/shifts
Authentication:     Yes (Bearer access token)
Authorization:      `shift:read` permission (granted to ADMIN, MANAGER, EMPLOYEE)
Public/Protected:   Protected
```

## 2. Purpose

Browse/search shifts — for admin management screens and for populating a
shift picker when creating/updating an Employee (optional field there,
unlike Department's/Designation's mandatory pickers).

## 3. Request Headers

| Header                               | Required | Notes                                          |
| -------------------------------------- | -------- | -------------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to the `shift:read` permission |

## 4. Path Parameters

None.

## 5. Query Parameters

| Name      | Type    | Required | Default     | Description                              |
| ----------- | ------- | -------- | ------------- | ------------------------------------------- |
| `page`    | integer | No       | `1`         | 1-indexed page number                     |
| `limit`   | integer | No       | `10` (max 100) | Page size                                |
| `search`  | string  | No       | —           | Matches `name` (case-insensitive)          |
| `status`  | enum    | No       | —           | `ACTIVE` or `INACTIVE`                    |
| `sortBy`  | enum    | No       | `createdAt` | `name`, `startTime`, `endTime`, `status`, `createdAt` |
| `order`   | enum    | No       | `desc`      | `asc` or `desc`                           |

## 6. Request Body

None.

## 7. Validation Rules

Same shape as `GET /designations`'s `listDesignationsQuerySchema` (both
mirror `GET /branches`'s `listBranchesQuerySchema`) — the one difference
is Shift's `sortBy` allowlist includes `startTime`/`endTime` instead of
`code`, since Shift has no `code` field.

## 8. Successful Response

```
200 OK

{
  "shifts": [
    {
      "id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
      "name": "Day Shift 9-6",
      "startTime": "09:00",
      "endTime": "18:00",
      "workingDays": ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
      "status": "ACTIVE",
      "createdAt": "2026-09-15T09:12:04.221Z",
      "updatedAt": "2026-09-15T09:12:04.221Z"
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

Verified live.

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                  | When                                       |
| ------ | ------------------------------------ | ---------------------------------------------------------- | --------------------------------------------- |
| `400`  | A query parameter failed validation | e.g. `"limit: Too big: expected number to be <=100"`      | Out-of-bounds `limit`, invalid `sortBy`/`status` |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                  | `authMiddleware` failure                   |
| `403`  | Caller lacks `shift:read`            | `"You do not have permission to perform this action"`   | Not expected in practice — every seeded role has this grant |

## 10. Postman Test Cases

| #   | Case                          | Expected |
| --- | -------------------------------- | -------- |
| 1   | Default pagination              | `200`, up to 10 results |
| 2   | `search` matches an existing shift | `200`, filtered results |
| 3   | `status=INACTIVE` filter         | `200`, only inactive shifts |
| 4   | `sortBy=startTime&order=asc`     | `200`, earliest start time first |
| 5   | `limit=101`                     | `400`    |
| 6   | As any authenticated role (ADMIN/MANAGER/EMPLOYEE) | `200` — verified live for both ADMIN and EMPLOYEE |
| 7   | No token                        | `401`    |

## 11. Negative Testing

| Scenario                        | Expected                                                   |
| ----------------------------------- | -------------------------------------------------------------- |
| `sortBy` value outside the allowlist (e.g. `?sortBy=code`) | `400` — `code` isn't a Shift field, unlike Branch/Department/Designation |
| `status` value outside the enum    | `400`                                                          |
| Tampered/expired JWT               | `401`                                                          |

## 12. Edge Cases

| Scenario                             | Expected Behavior                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `page` beyond the last page             | `200` with an empty `shifts` array, not an error                                                     |
| Two shifts with identical `createdAt` | Deterministic ordering via the unconditional secondary `id ASC` tiebreaker                              |

## 13. Security Testing

`shift:read` is broad, like `branch:read`/`department:read`/
`designation:read`/`holidayCalendar:read` — no `:own` scope exists or is
needed, since Shift has no ownership dimension.

## 14. Database Impact

Read-only — `Shift.findMany` + `Shift.count`, run in parallel via
`Promise.all`.

## 15. Request Lifecycle

```
GET /api/v1/shifts
    ↓
authMiddleware
    ↓
requirePermission('shift:read')
    ↓ (403 if not granted)
validateMiddleware(listShiftsQuerySchema, 'query')
    ↓ (400 if invalid)
shift.controller.list → shift.service.listShifts(query)
    └─ Promise.all([shiftRepository.findAll(...), shiftRepository.count(...)])
    ↓
200 { shifts, pagination }
```

## 16. Performance Notes

Shift counts are expected to be modest (tens, not thousands) — pagination
exists for API consistency, not a demonstrated scale problem.

## 17. Interview Notes

- **Q: Why does `search` here only match `name`, unlike Branch's/
  Department's/Designation's `name`+`code` search?** Shift has no `code`
  field at all — the same divergence Holiday Calendar already established
  (no field exists to justify a use case for one, `docs/domain-shift.md`
  never names one either).

## 18. cURL Examples

```bash
curl -s "http://localhost:3000/api/v1/shifts?search=day&status=ACTIVE" \
  -H "Authorization: Bearer $ANY_ROLE_TOKEN"
```

## 19. Postman Collection Notes

Run after `POST /shifts` to confirm the created shift is discoverable via
`search`.

## 20. Testing Checklist

- ✅ Default pagination, explicit `page`/`limit`
- ✅ `search` across `name`
- ✅ `status` filter
- ✅ Sort both directions with deterministic tiebreaker
- ✅ `200` for ADMIN and EMPLOYEE tokens alike (verified live)
- ✅ `400` on out-of-bounds `limit`

---

---

# 45. `GET /shifts/:id`

## 1. Endpoint Information

```
Feature:            Shift Domain (2026-09-15, feature/20-shift-domain)
Endpoint:           Get one Shift record
Method:             GET
URL:                /api/v1/shifts/:id
API Version:        v1
Module:             modules/shifts
Authentication:     Yes (Bearer access token)
Authorization:      `shift:read` permission (granted to every role)
Public/Protected:   Protected
```

## 2. Purpose

Fetch a single shift's current details, e.g. to populate an edit form or
resolve an Employee's `shiftId` to a display name/time range.

## 3. Request Headers

| Header                               | Required | Notes                                          |
| -------------------------------------- | -------- | -------------------------------------------------- |
| `Authorization: Bearer <accessToken>` | **Yes**  | Must resolve to the `shift:read` permission |

## 4. Path Parameters

| Name | Type          | Required | Description          |
| ---- | ------------- | -------- | ----------------------- |
| `id` | string (UUID) | **Yes**  | The Shift record's id |

## 5. Query Parameters

None.

## 6. Request Body

None.

## 7. Validation Rules

No body — only the permission check and the record's existence.

## 8. Successful Response

```
200 OK

{
  "shift": {
    "id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
    "name": "Day Shift 9-6",
    "startTime": "09:00",
    "endTime": "18:00",
    "workingDays": ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
    "status": "ACTIVE",
    "createdAt": "2026-09-15T09:12:04.221Z",
    "updatedAt": "2026-09-15T09:12:04.221Z"
  }
}
```

Verified live.

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                | When                              |
| ------ | ------------------------------------ | ---------------------------------------------------------- | ------------------------------------ |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                  | `authMiddleware` failure           |
| `403`  | Caller lacks `shift:read`            | `"You do not have permission to perform this action"`   | Not expected in practice           |
| `404`  | No such shift                        | `"Shift not found"`                                      | Invalid/nonexistent `id`           |

## 10. Postman Test Cases

| #   | Case             | Expected |
| --- | ------------------ | -------- |
| 1   | Existing `id`      | `200`    |
| 2   | Nonexistent `id`   | `404`    |
| 3   | No token           | `401`    |

## 11. Negative Testing

| Scenario                   | Expected |
| ----------------------------- | -------- |
| Malformed (non-UUID) `id`     | `404`    |
| Tampered/expired JWT          | `401`    |

## 12. Edge Cases

None beyond the standard existence check — Shift has no soft-delete
concept.

## 13. Security Testing

No BOLA concern — no ownership dimension.

## 14. Database Impact

Read-only — single indexed `Shift.findUnique`.

## 15. Request Lifecycle

```
GET /api/v1/shifts/:id
    ↓
authMiddleware
    ↓
requirePermission('shift:read')
    ↓ (403 if not granted)
shift.controller.getById → shift.service.getShiftById(id)
    └─ shiftRepository.findById(id) → not found → 404
    ↓
200 { shift }
```

## 16. Performance Notes

Single indexed lookup by primary key.

## 17. Interview Notes

Structurally identical to `GET /designations/:id` and `GET /branches/:id`
— same reasoning applies.

## 18. cURL Examples

```bash
curl -s http://localhost:3000/api/v1/shifts/$SHIFT_ID \
  -H "Authorization: Bearer $ANY_ROLE_TOKEN"
```

## 19. Postman Collection Notes

Uses `{{shiftId}}` saved from `POST /shifts`.

## 20. Testing Checklist

- ✅ Valid `id` → `200`
- ✅ Nonexistent `id` → `404`
- ✅ `401` with no token

---

---

# 46. `PATCH /shifts/:id`

## 1. Endpoint Information

```
Feature:            Shift Domain (2026-09-15, feature/20-shift-domain)
Endpoint:           Update a Shift, including activating/deactivating it
Method:             PATCH
URL:                /api/v1/shifts/:id
API Version:        v1
Module:             modules/shifts
Authentication:     Yes (Bearer access token)
Authorization:      `shift:update` permission required (ADMIN only)
Public/Protected:   Protected
```

## 2. Purpose

Correct a shift's time boundaries/working days, or retire a shift from
future assignment without losing history — same shape as Branch's/
Department's/Designation's equivalent.

## 3. Request Headers

| Header                                | Required | Notes                                              |
| -------------------------------------- | -------- | ------------------------------------------------------ |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `shift:update` permission     |
| `Content-Type: application/json`      | **Yes**  |                                                         |

## 4. Path Parameters

| Name | Type          | Required | Description          |
| ---- | ------------- | -------- | ----------------------- |
| `id` | string (UUID) | **Yes**  | The Shift record's id |

## 5. Query Parameters

None.

## 6. Request Body

```json
{ "status": "INACTIVE" }
```

| Field         | Type            | Required | Description                                    |
| ------------- | --------------- | -------- | -------------------------------------------------- |
| `name`        | string          | No       | Trimmed, non-empty when provided                    |
| `startTime`   | string          | No       | `"HH:mm"`, same format rule as creation             |
| `endTime`     | string          | No       | `"HH:mm"`, same format rule as creation             |
| `workingDays` | array of string | No       | Non-empty subset of the seven weekdays when provided |
| `status`      | enum            | No       | `ACTIVE` or `INACTIVE`                              |

## 7. Validation Rules

Same trimming/format rules as creation, applied only to whichever fields
are present; `name` uniqueness re-checked case-insensitively on rename;
`status` restricted to the `ShiftStatus` enum. Unlike `departmentId`/
`designationId`/`employmentType` on Employee, every field here is a plain
`.optional()` (none is nullable) — there is no "clear it" path for
`startTime`/`endTime`/`workingDays`, since a Shift always needs a
complete time/working-day definition to remain meaningful.

## 8. Successful Response

```
200 OK

{
  "shift": {
    "id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
    "name": "Day Shift 9-6",
    "startTime": "09:00",
    "endTime": "18:00",
    "workingDays": ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
    "status": "INACTIVE",
    "createdAt": "2026-09-15T09:12:04.221Z",
    "updatedAt": "2026-09-15T09:20:47.930Z"
  }
}
```

Verified live, including the `status` transition shown above.

## 9. Error Responses

| Status | Reason                              | Response (`message`)                                | When                                       |
| ------ | ------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------- |
| `400`  | Validation failed                   | e.g. `"name: Shift name is required"`, malformed `startTime`/`endTime`, invalid `status` | Empty/whitespace-only `name`, bad time format, invalid `workingDays`/`status` |
| `401`  | Missing/invalid/expired access token | Same as every other protected endpoint                  | `authMiddleware` failure                    |
| `403`  | Caller lacks `shift:update`          | `"You do not have permission to perform this action"`   | Verified live for `EMPLOYEE`                |
| `404`  | No such shift                        | `"Shift not found"`                                      | Invalid/nonexistent `id`                    |
| `409`  | Duplicate `name`                    | `"A shift with this name already exists"`                | Renaming to a name already used, case-insensitive |

## 10. Postman Test Cases

| #   | Case                              | Expected |
| --- | ------------------------------------ | -------- |
| 1   | Update `name` only                   | `200`    |
| 2   | Update `startTime`/`endTime`/`workingDays` | `200`    |
| 3   | Deactivate (`status: "INACTIVE"`)    | `200` — verified live |
| 4   | Reactivate (`status: "ACTIVE"`)      | `200`    |
| 5   | Rename to another shift's existing `name`, any case | `409` |
| 6   | Nonexistent `id`                     | `404`    |
| 7   | As `EMPLOYEE`/`MANAGER` token         | `403`    |
| 8   | No token                             | `401`    |

## 11. Negative Testing

| Scenario                     | Expected |
| -------------------------------- | -------- |
| `status` outside the enum        | `400`    |
| Malformed `startTime`/`endTime`  | `400`    |
| Empty `workingDays` array        | `400`    |
| Empty body `{}`                  | `200`, no-op update              |
| Tampered/expired JWT             | `401`    |

## 12. Edge Cases

| Scenario                                                        | Expected Behavior                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Deactivating a shift with active Employee assignments        | Succeeds; existing `Employee.shiftId` references are **untouched** — verified live. Only *future* assignment attempts are blocked. |
| Reactivating a shift                                          | Immediately assignable again                                                                                              |
| Changing `startTime`/`endTime`/`workingDays` on a shift already assigned to employees | Succeeds; per `docs/domain-shift.md` §4, this affects only *future* Attendance calculations, never retroactively re-interprets already-recorded attendance (Attendance doesn't exist yet, so there's nothing to retroactively affect today) |

## 13. Security Testing

- **Authorization**: confirm `MANAGER` cannot update a shift — verified
  live.
- **Mass assignment**: only `name`/`startTime`/`endTime`/`workingDays`/
  `status` are read from the body.

## 14. Database Impact

- **Tables affected**: `Shift` (update), `AuditLog` (insert), inside one `prisma.$transaction`.
- **Cascade behavior**: none — deactivating never touches `Employee` rows.

## 15. Request Lifecycle

```
PATCH /api/v1/shifts/:id
    ↓
authMiddleware
    ↓
requirePermission('shift:update')
    ↓ (403 if not granted)
validateMiddleware(updateShiftSchema)
    ↓ (400 if invalid)
shift.controller.update → shift.service.updateShift(id, data, actor)
    ├─ shiftRepository.findById(id) → not found → 404
    ├─ (if name changing) shiftRepository.findByName(name) → conflict (different id) → 409
    └─ prisma.$transaction:
         ├─ shiftRepository.update(id, data, tx)
         └─ auditLogRepository.create({ action: 'UPDATE', beforeData, afterData, ... }, tx)
    ↓ (catch) Prisma P2002 → 409 (race-condition fallback)
200 { shift }
```

## 16. Performance Notes

Single indexed lookup, optional uniqueness pre-check, one update, one
audit-log insert.

## 17. Interview Notes

- **Q: Why is there no "clear it" (`null`) path for `startTime`/
  `endTime`/`workingDays`, unlike `branchId`/`shiftId` on Employee?** A
  Shift record with no time boundaries or working days wouldn't be a
  meaningful Shift at all — unlike an Employee's *link* to a Shift (which
  can legitimately be absent), the Shift's own definition has no
  "unassigned" state to represent.
- Structurally identical to `PATCH /designations/:id` — the one real
  difference is the additional `startTime`/`endTime`/`workingDays` fields
  and the overnight-shift acceptance rule already covered in `POST
  /shifts` (endpoint 43).

## 18. cURL Examples

```bash
curl -i -X PATCH http://localhost:3000/api/v1/shifts/$SHIFT_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"INACTIVE"}'
```

## 19. Postman Collection Notes

Run a deactivate/reactivate pair back-to-back, then re-run
`POST`/`PATCH /employees` with `{{shiftId}}` while inactive to confirm the
`400` from the assignability check.

## 20. Testing Checklist

- ✅ Field-only update, status-only update, both together
- ✅ Deactivate → existing Employee links untouched (verified live)
- ✅ Deactivate → future assignment rejected with `400` (verified live)
- ✅ `409` on rename collision, case-insensitive
- ✅ `403` as `EMPLOYEE`, `401` with no token
- ✅ `AuditLog` row created

---

---

# 47. `DELETE /shifts/:id`

## 1. Endpoint Information

```
Feature:            Shift Domain (2026-09-15, feature/20-shift-domain)
Endpoint:           Hard-delete a Shift
Description:        Permanently removes a Shift row - only when zero Employee records reference it
Method:             DELETE
URL:                /api/v1/shifts/:id
API Version:        v1
Module:             modules/shifts
Authentication:     Yes (Bearer access token)
Authorization:      `shift:delete` permission required (ADMIN only)
Public/Protected:   Protected
```

## 2. Purpose

Covers the genuine data-entry-mistake case (a shift created in error,
never assigned to any Employee) — the only hard-delete path; a referenced
shift must be deactivated instead.

## 3. Request Headers

| Header                                | Required | Notes                                             |
| -------------------------------------- | -------- | --------------------------------------------------- |
| `Authorization: Bearer <accessToken>`  | **Yes**  | Must resolve to the `shift:delete` permission |

## 4. Path Parameters

| Name | Type          | Required | Description          |
| ---- | ------------- | -------- | ----------------------- |
| `id` | string (UUID) | **Yes**  | The Shift record's id |

## 5. Query Parameters

None.

## 6. Request Body

None.

## 7. Validation Rules

No body — only the permission check, the record's existence, and the
zero-reference check.

## 8. Successful Response

```
200 OK

{
  "message": "Shift deleted successfully"
}
```

Verified live for a shift with zero Employee references.

## 9. Error Responses

| Status | Reason                                      | Response (`message`)                                                                | When                                                                 |
| ------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `401`  | Missing/invalid/expired access token           | Same as every other protected endpoint                                                  | `authMiddleware` failure                                                 |
| `403`  | Caller lacks `shift:delete`                     | `"You do not have permission to perform this action"`                                    | Verified live for `EMPLOYEE`                                             |
| `404`  | No such shift                                  | `"Shift not found"`                                                                       | Invalid/nonexistent `id`                                                  |
| `409`  | Shift is referenced by one or more Employees   | `"This shift has Employee records referencing it and cannot be deleted - deactivate it instead"` | Verified live. Unlike Designation's equivalent, `shiftId` is **optional** on Employee, so this `409` is not guaranteed for every live Employee the way Designation's is. |

## 10. Postman Test Cases

| #   | Case                                          | Expected |
| --- | ------------------------------------------------ | -------- |
| 1   | Delete a shift with zero Employee references     | `200` — verified live |
| 2   | Delete a shift with an active Employee reference | `409` — verified live |
| 3   | Nonexistent `id`                                  | `404`    |
| 4   | As `EMPLOYEE`/`MANAGER` token                      | `403`    |
| 5   | No token                                          | `401`    |

## 11. Negative Testing

| Scenario              | Expected |
| ------------------------ | -------- |
| Malformed (non-UUID) `id` | `404`    |
| Tampered/expired JWT      | `401`    |

## 12. Edge Cases

| Scenario                                                                 | Expected Behavior                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shift referenced **only** by a soft-deleted Employee (`deletedAt` set)      | Still `409` — the reference count includes soft-deleted Employee rows, same reasoning as Branch's/Department's/Designation's equivalent (`onDelete: Restrict` would refuse the delete at the DB level regardless). |
| Concurrent delete requests for the same `id`                                 | One succeeds, the other sees `404` — not independently verified under true concurrency (same caveat as Branch's/Designation's equivalent case).                                          |

## 13. Security Testing

- **Authorization**: confirm `MANAGER` cannot delete a shift — verified
  live.
- **Idempotency under retry**: a retried `DELETE` gets a safe `404` on
  the second attempt.

## 14. Database Impact

- **Tables affected**: `Shift` (delete), `AuditLog` (insert), inside
  one `prisma.$transaction`.
- **DB-level backstop**: `Employee.shiftId`'s `onDelete: Restrict`
  refuses the delete at the database level even if this service-layer
  check were somehow bypassed.

## 15. Request Lifecycle

```
DELETE /api/v1/shifts/:id
    ↓
authMiddleware
    ↓
requirePermission('shift:delete')
    ↓ (403 if not granted)
shift.controller.remove → shift.service.deleteShift(id, actor)
    ├─ shiftRepository.findById(id) → not found → 404
    ├─ shiftRepository.countEmployeesForShift(id) → count > 0 → 409
    └─ prisma.$transaction:
         ├─ shiftRepository.remove(id, tx)
         └─ auditLogRepository.create({ action: 'DELETE', beforeData, afterData: null, ... }, tx)
    ↓
200 { message: "Shift deleted successfully" }
```

## 16. Performance Notes

One indexed existence lookup, one `Employee` count query, one delete, one
audit-log insert.

## 17. Interview Notes

- **Q: Since `shiftId` is optional on Employee, is this endpoint more
  useful in practice than Designation's equivalent?** Yes — because
  `shiftId` is nullable, an `ADMIN` can genuinely delete a shift that
  employees might plausibly have once needed but never got assigned to,
  not just a just-created never-assigned one. The `409` guard still
  applies identically once any Employee actually references it.

## 18. cURL Examples

```bash
curl -i -X DELETE http://localhost:3000/api/v1/shifts/$SHIFT_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 19. Postman Collection Notes

Run this **last** for any `{{shiftId}}` with zero Employee references;
for a referenced shift, expect and assert on the `409`.

## 20. Testing Checklist

- ✅ Delete with zero references → `200` (verified live)
- ✅ Delete with an active reference → `409` (verified live)
- ✅ `403` as `EMPLOYEE`, `401` with no token
- ✅ `404` for nonexistent `id`
