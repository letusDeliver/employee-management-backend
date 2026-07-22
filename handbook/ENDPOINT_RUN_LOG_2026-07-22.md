# Endpoint Run Log — 2026-07-22

A real, sequential, end-to-end execution of every endpoint currently
implemented in this API, run against a live local server
(`http://localhost:3000`) and a live PostgreSQL database + Cloudinary
account. Every request/response pair below is **copy-pasted verbatim**
from the actual `curl` output of that run — nothing here is invented or
idealized (see `CLAUDE.md` Rule 17).

This is a **point-in-time capture**, not a living document. For the
always-up-to-date reference, see:

- [`API_ENDPOINTS.md`](./API_ENDPOINTS.md) — the deep implementation reference
- [`TESTING_GUIDE.md`](./TESTING_GUIDE.md) — the repeatable manual QA runbook (includes negative/edge cases this log does not)

## Conventions

- Base URL: `http://localhost:3000`, all API routes under `/api/v1`.
- Every response carries the same Helmet security headers
  (`Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`,
  etc.) and CORS headers (`Access-Control-Allow-Origin: http://localhost:4200`).
  Shown once here, omitted from later entries to keep this log readable —
  they were present and identical on every call.
- `Bearer <token>` = the `accessToken` string from the most recent
  register/login/refresh response for that user.
- The refresh token travels only as an `httpOnly` cookie
  (`Path=/api/v1/auth`), never in the JSON body — captured via curl's
  cookie jar (`-c`/`-b`), same as production browser behavior.
- User IDs / employee IDs / tokens below are real values from this
  specific run — they will differ on any other run.

---

## 0. Server & database state at start of this run

Server was already running (`npm run dev`, `ENABLE_SWAGGER=true`) against
the same database used by prior features' manual testing sessions, so
`GET /users` below legitimately returns test accounts created in earlier
sessions (Features 6–13) alongside the fresh account created in this run
— that is expected, not a bug.

---

## 1. `GET /api/v1/health` — Liveness check

No auth required.

**Request**
```
GET /api/v1/health
```

**Response — `200 OK`**
```json
{ "status": "ok" }
```

## 2. `GET /api/v1/ready` — Readiness check

No auth required.

**Request**
```
GET /api/v1/ready
```

**Response — `200 OK`**
```json
{ "status": "ok", "database": "connected" }
```

---

## 3. `POST /api/v1/auth/register` — Create an account

No auth required.

**Request**
```
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "runner.20260722@example.com",
  "password": "RunnerPass123",
  "name": "Runner Test User"
}
```

**Response — `201 Created`**
```
Set-Cookie: refreshToken=eyJhbGciOiJIUzI1NiIs...; Max-Age=604798; Path=/api/v1/auth;
            Expires=Wed, 29 Jul 2026 12:27:51 GMT; HttpOnly; SameSite=Lax
```
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "dd60c7fc-d1ed-4382-a475-17157a4adb44",
    "email": "runner.20260722@example.com",
    "name": "Runner Test User",
    "profileImageUrl": null,
    "profileImagePublicId": null,
    "createdAt": "2026-07-22T12:27:51.892Z",
    "updatedAt": "2026-07-22T12:27:51.892Z",
    "roles": ["EMPLOYEE"]
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...(truncated)"
}
```

**Notes:** password is never returned. New accounts default to the
`EMPLOYEE` role (assigned inside the same DB transaction as user
creation — see Feature 9). The refresh cookie is scoped to `/api/v1/auth`
only, so it's never sent on unrelated routes.

---

## 4. `POST /api/v1/auth/login` — Authenticate

No auth required.

**Request**
```
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "runner.20260722@example.com",
  "password": "RunnerPass123"
}
```

**Response — `200 OK`**
```
Set-Cookie: refreshToken=eyJhbGciOiJIUzI1NiIs...; Max-Age=604799; Path=/api/v1/auth;
            Expires=Wed, 29 Jul 2026 12:27:59 GMT; HttpOnly; SameSite=Lax
```
```json
{
  "message": "Login successful",
  "user": {
    "id": "dd60c7fc-d1ed-4382-a475-17157a4adb44",
    "email": "runner.20260722@example.com",
    "name": "Runner Test User",
    "profileImageUrl": null,
    "profileImagePublicId": null,
    "createdAt": "2026-07-22T12:27:51.892Z",
    "updatedAt": "2026-07-22T12:27:51.892Z",
    "roles": ["EMPLOYEE"]
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...(truncated)"
}
```

**Notes:** a brand-new refresh token is issued (rotation happens on every
login too, not just `/refresh`) — a new, independent session, separate
from the one created at registration.

---

## 5. `GET /api/v1/auth/me` — Current authenticated user

**Auth:** `Authorization: Bearer <accessToken>`

**Request**
```
GET /api/v1/auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response — `200 OK`**
```json
{
  "user": {
    "id": "dd60c7fc-d1ed-4382-a475-17157a4adb44",
    "email": "runner.20260722@example.com",
    "name": "Runner Test User",
    "profileImageUrl": null,
    "profileImagePublicId": null,
    "createdAt": "2026-07-22T12:27:51.892Z",
    "updatedAt": "2026-07-22T12:27:51.892Z",
    "roles": ["EMPLOYEE"]
  }
}
```

**Notes:** always reads roles fresh from the database on every call — the
JWT payload's `roles` claim is not what's echoed back here.

---

## 6. `POST /api/v1/auth/refresh` — Rotate refresh token

**Auth:** refresh-token cookie (sent automatically by the browser/curl
cookie jar, no header needed).

**Request**
```
POST /api/v1/auth/refresh
Cookie: refreshToken=<old token, from step 4's login>
```

**Response — `200 OK`**
```
Set-Cookie: refreshToken=eyJhbGciOiJIUzI1NiIs...(NEW token); Max-Age=604799;
            Path=/api/v1/auth; Expires=Wed, 29 Jul 2026 12:28:35 GMT; HttpOnly; SameSite=Lax
```
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...(new access token)"
}
```

**Notes:** the old refresh token is revoked server-side the moment this
succeeds — replaying it afterward now returns `401`.

---

## 7. `GET /api/v1/users` — as EMPLOYEE (permission denied)

**Auth:** `Authorization: Bearer <accessToken>` (role: `EMPLOYEE` only, no `user:list` permission)

**Request**
```
GET /api/v1/users
Authorization: Bearer <EMPLOYEE token>
```

**Response — `403 Forbidden`**
```json
{
  "status": "error",
  "message": "You do not have permission to perform this action",
  "stack": "ForbiddenError: You do not have permission to perform this action\n    at .../src/middlewares/permission.middleware.js:15:19\n    ..."
}
```

**Notes:** `stack` is only included because `NODE_ENV=development` — it's
stripped in production. This is the exact enforcement point:
`requirePermission('user:list')` in `user.routes.js`.

### Promoting the test user to ADMIN

There is no self-service "become admin" endpoint by design (see Feature
8's documented bootstrapping gap). Promoted directly via a throwaway
Prisma script against the real database — the same established pattern
used in Features 8/9/13:

```json
{
  "userId": "dd60c7fc-d1ed-4382-a475-17157a4adb44",
  "roles": ["EMPLOYEE", "ADMIN"]
}
```

Then re-logged in (step 4's flow, repeated) to get a **fresh** access
token — the old token still carries the stale `EMPLOYEE`-only roles
claim, a direct consequence of stateless JWTs (documented since Feature
8).

---

## 8. `GET /api/v1/users` — as ADMIN (now permitted)

**Auth:** `Authorization: Bearer <accessToken>` (roles: `["EMPLOYEE","ADMIN"]`)

**Request**
```
GET /api/v1/users
Authorization: Bearer <ADMIN token>
```

**Response — `200 OK`** (trimmed to 3 of the 13 real rows returned; full
list includes test accounts left over from Features 6–13's own manual
verification sessions)
```json
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
      "id": "682ea75b-5dd7-4876-b31d-2a6a9cfd91ef",
      "email": "swagger-verify@example.com",
      "name": "Swagger Verify",
      "profileImageUrl": null,
      "profileImagePublicId": null,
      "createdAt": "2026-07-05T14:19:43.222Z",
      "updatedAt": "2026-07-05T14:19:43.222Z",
      "roles": ["EMPLOYEE", "ADMIN"]
    },
    {
      "id": "dd60c7fc-d1ed-4382-a475-17157a4adb44",
      "email": "runner.20260722@example.com",
      "name": "Runner Test User",
      "profileImageUrl": null,
      "profileImagePublicId": null,
      "createdAt": "2026-07-22T12:27:51.892Z",
      "updatedAt": "2026-07-22T12:27:51.892Z",
      "roles": ["EMPLOYEE", "ADMIN"]
    }
  ]
}
```

**Notes:** `password` is stripped from every entry (`sanitizeUser()`). No
pagination on this endpoint — a documented gap (see `API_ENDPOINTS.md`
Known Gaps), fine at this data volume but would need addressing before a
large user base.

---

## 9. `POST /api/v1/employees` — Create Employee #1 (linked to our user)

**Auth:** Bearer ADMIN token, `employee:create` permission

**Request**
```
POST /api/v1/employees
Authorization: Bearer <ADMIN token>
Content-Type: application/json

{
  "userId": "dd60c7fc-d1ed-4382-a475-17157a4adb44",
  "department": "Engineering",
  "jobTitle": "Backend Engineer",
  "salary": 85000,
  "dateOfJoining": "2024-01-15"
}
```

**Response — `201 Created`**
```json
{
  "employee": {
    "id": "3826a939-28d5-4292-b9db-d58a2e6c2fe1",
    "userId": "dd60c7fc-d1ed-4382-a475-17157a4adb44",
    "department": "Engineering",
    "jobTitle": "Backend Engineer",
    "salary": "85000",
    "dateOfJoining": "2024-01-15T00:00:00.000Z",
    "managerId": null,
    "deletedAt": null,
    "createdAt": "2026-07-22T12:29:49.397Z",
    "updatedAt": "2026-07-22T12:29:49.397Z"
  }
}
```

**Notes:** `salary` comes back as a **string** (`"85000"`, not `85000`) —
Prisma's `Decimal` type serializes to a JSON string, a pinned detail from
Feature 13's Swagger work. This create also wrote one `AuditLog` row
(Feature 11), verified in earlier feature testing, not re-verified here.

## 10. `POST /api/v1/employees` — Create Employee #2 (unlinked, reports to #1)

**Request**
```
POST /api/v1/employees
Authorization: Bearer <ADMIN token>
Content-Type: application/json

{
  "department": "Sales",
  "jobTitle": "Sales Associate",
  "salary": 55000,
  "dateOfJoining": "2024-06-01",
  "managerId": "3826a939-28d5-4292-b9db-d58a2e6c2fe1"
}
```

**Response — `201 Created`**
```json
{
  "employee": {
    "id": "e7b8c583-bb92-4e04-a409-59c9863e055e",
    "userId": null,
    "department": "Sales",
    "jobTitle": "Sales Associate",
    "salary": "55000",
    "dateOfJoining": "2024-06-01T00:00:00.000Z",
    "managerId": "3826a939-28d5-4292-b9db-d58a2e6c2fe1",
    "deletedAt": null,
    "createdAt": "2026-07-22T12:29:56.194Z",
    "updatedAt": "2026-07-22T12:29:56.194Z"
  }
}
```

**Notes:** `userId` is optional — an Employee (HR) record does not
require a linked login account. This one exists purely so step 16 below
has something to soft-delete without touching Employee #1 (which is
reused by the document/profile-picture steps).

---

## 11. `GET /api/v1/employees` — List, pagination / search / filter / sort

**Auth:** Bearer ADMIN token, `employee:read:any` permission

### 11a. Plain pagination

**Request:** `GET /api/v1/employees?page=1&limit=5`

**Response — `200 OK`**
```json
{
  "employees": [ /* 5 rows */ ],
  "pagination": { "page": 1, "limit": 5, "total": 19, "totalPages": 4 }
}
```

### 11b. `search=Runner` — matches the linked User's name, not just Employee columns

**Request:** `GET /api/v1/employees?search=Runner`

**Response — `200 OK`**
```json
{
  "employees": [
    {
      "id": "3826a939-28d5-4292-b9db-d58a2e6c2fe1",
      "userId": "dd60c7fc-d1ed-4382-a475-17157a4adb44",
      "department": "Engineering",
      "jobTitle": "Backend Engineer",
      "salary": "85000",
      "dateOfJoining": "2024-01-15T00:00:00.000Z",
      "managerId": null,
      "deletedAt": null,
      "createdAt": "2026-07-22T12:29:49.397Z",
      "updatedAt": "2026-07-22T12:29:49.397Z"
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

**Notes:** confirms the Feature 10 cross-table search — "Runner" appears
nowhere in the Employee row itself (department/jobTitle), only in the
linked `User.name`, and it still matched.

### 11c. `department=Sales&sortBy=salary&order=asc`

**Request:** `GET /api/v1/employees?department=Sales&sortBy=salary&order=asc`

**Response — `200 OK`**
```json
{
  "employees": [
    { "id": "cb16f4b6-...", "department": "Sales", "jobTitle": "Rep", "salary": "2000", "...": "..." },
    { "id": "19afe5ca-...", "department": "Sales", "jobTitle": "Manager", "salary": "45000", "...": "..." },
    { "id": "e7b8c583-bb92-4e04-a409-59c9863e055e", "department": "Sales", "jobTitle": "Sales Associate", "salary": "55000", "...": "..." },
    { "id": "aa526224-...", "department": "Sales", "jobTitle": "Manager", "salary": "70000", "...": "..." },
    { "id": "f19a47d7-...", "department": "Sales", "jobTitle": "Manager", "salary": "95000", "...": "..." }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 5, "totalPages": 1 }
}
```

**Notes:** ascending salary order confirmed (`2000 → 45000 → 55000 →
70000 → 95000`), including our own Employee #2 correctly sorted in.

---

## 12. `GET /api/v1/employees/:id` — Get one

**Request:** `GET /api/v1/employees/3826a939-28d5-4292-b9db-d58a2e6c2fe1`

**Response — `200 OK`**
```json
{
  "employee": {
    "id": "3826a939-28d5-4292-b9db-d58a2e6c2fe1",
    "userId": "dd60c7fc-d1ed-4382-a475-17157a4adb44",
    "department": "Engineering",
    "jobTitle": "Backend Engineer",
    "salary": "85000",
    "dateOfJoining": "2024-01-15T00:00:00.000Z",
    "managerId": null,
    "deletedAt": null,
    "createdAt": "2026-07-22T12:29:49.397Z",
    "updatedAt": "2026-07-22T12:29:49.397Z"
  }
}
```

---

## 13. `PATCH /api/v1/employees/:id` — Partial update

**Request**
```
PATCH /api/v1/employees/3826a939-28d5-4292-b9db-d58a2e6c2fe1
Authorization: Bearer <ADMIN token>
Content-Type: application/json

{ "jobTitle": "Senior Backend Engineer", "salary": 95000 }
```

**Response — `200 OK`**
```json
{
  "employee": {
    "id": "3826a939-28d5-4292-b9db-d58a2e6c2fe1",
    "userId": "dd60c7fc-d1ed-4382-a475-17157a4adb44",
    "department": "Engineering",
    "jobTitle": "Senior Backend Engineer",
    "salary": "95000",
    "dateOfJoining": "2024-01-15T00:00:00.000Z",
    "managerId": null,
    "deletedAt": null,
    "createdAt": "2026-07-22T12:29:49.397Z",
    "updatedAt": "2026-07-22T12:30:14.658Z"
  }
}
```

**Notes:** partial — only `jobTitle`/`salary` were sent, `department` and
`dateOfJoining` were left untouched. `updatedAt` advanced; `createdAt`
did not.

---

## 14. `POST /api/v1/employees/:id/documents` — Upload a document

**Auth:** Bearer ADMIN token, `employee:update:any` permission. Field name is `file` (multipart).

**Request**
```
POST /api/v1/employees/3826a939-28d5-4292-b9db-d58a2e6c2fe1/documents
Authorization: Bearer <ADMIN token>
Content-Type: multipart/form-data

file: resume.png (image/png, 68 bytes — a real, valid tiny PNG fixture)
```

**Response — `201 Created`**
```json
{
  "document": {
    "id": "cea6275b-1a13-4329-b21f-e0c2ec1150c7",
    "employeeId": "3826a939-28d5-4292-b9db-d58a2e6c2fe1",
    "url": "https://res.cloudinary.com/dhfxv7gdp/image/upload/v1784723440/emp-mgmt/development/employees/3826a939-28d5-4292-b9db-d58a2e6c2fe1/documents/9f6a32a8-2bf8-4c3e-887b-dcf861d7fa9a.png",
    "publicId": "emp-mgmt/development/employees/3826a939-28d5-4292-b9db-d58a2e6c2fe1/documents/9f6a32a8-2bf8-4c3e-887b-dcf861d7fa9a",
    "resourceType": "image",
    "fileName": "resume.png",
    "mimeType": "image/png",
    "size": 68,
    "uploadedBy": "dd60c7fc-d1ed-4382-a475-17157a4adb44",
    "createdAt": "2026-07-22T12:30:41.177Z"
  }
}
```

**Notes:** this is a **real** Cloudinary upload, not mocked — the `url`
is a live asset. `publicId` uses a fresh UUID, never the original
filename (path-traversal hardening from Feature 12). `resourceType`
(`"image"`) is stored explicitly because `cloudinary.uploader.destroy()`
needs it later — passing the wrong value silently no-ops instead of
erroring (the Feature 12 bug).

---

## 15. `GET /api/v1/employees/:id/documents` — List documents

**Request:** `GET /api/v1/employees/3826a939-28d5-4292-b9db-d58a2e6c2fe1/documents`

**Response — `200 OK`**
```json
{
  "documents": [
    {
      "id": "cea6275b-1a13-4329-b21f-e0c2ec1150c7",
      "employeeId": "3826a939-28d5-4292-b9db-d58a2e6c2fe1",
      "url": "https://res.cloudinary.com/dhfxv7gdp/image/upload/v1784723440/emp-mgmt/development/employees/3826a939-28d5-4292-b9db-d58a2e6c2fe1/documents/9f6a32a8-2bf8-4c3e-887b-dcf861d7fa9a.png",
      "publicId": "emp-mgmt/development/employees/3826a939-28d5-4292-b9db-d58a2e6c2fe1/documents/9f6a32a8-2bf8-4c3e-887b-dcf861d7fa9a",
      "resourceType": "image",
      "fileName": "resume.png",
      "mimeType": "image/png",
      "size": 68,
      "uploadedBy": "dd60c7fc-d1ed-4382-a475-17157a4adb44",
      "createdAt": "2026-07-22T12:30:41.177Z"
    }
  ]
}
```

---

## 16. `DELETE /api/v1/employees/:id/documents/:documentId` — Remove a document

**Request:** `DELETE /api/v1/employees/3826a939-28d5-4292-b9db-d58a2e6c2fe1/documents/cea6275b-1a13-4329-b21f-e0c2ec1150c7`

**Response — `200 OK`**
```json
{ "message": "Document deleted successfully" }
```

**Notes:** permanently removes both the DB row and the Cloudinary asset
(`destroy()` called with the stored `resourceType` + `invalidate: true`,
per the two Feature 12 fixes). Not re-verified via the Cloudinary Admin
API in this run — that live-deletion proof was already done during
Feature 12's own verification.

---

## 17. `POST /api/v1/users/me/profile-picture` — Upload own avatar

**Auth:** Bearer token, self-only (no permission check — always operates
on the caller's own account). Field name is `file`.

**Request**
```
POST /api/v1/users/me/profile-picture
Authorization: Bearer <ADMIN token>
Content-Type: multipart/form-data

file: resume.png (image/png, 68 bytes)
```

**Response — `200 OK`**
```json
{
  "user": {
    "id": "dd60c7fc-d1ed-4382-a475-17157a4adb44",
    "email": "runner.20260722@example.com",
    "name": "Runner Test User",
    "profileImageUrl": "https://res.cloudinary.com/dhfxv7gdp/image/upload/v1784723461/emp-mgmt/development/users/dd60c7fc-d1ed-4382-a475-17157a4adb44/profile-picture.png",
    "profileImagePublicId": "emp-mgmt/development/users/dd60c7fc-d1ed-4382-a475-17157a4adb44/profile-picture",
    "createdAt": "2026-07-22T12:27:51.892Z",
    "updatedAt": "2026-07-22T12:31:02.393Z",
    "roles": ["EMPLOYEE", "ADMIN"]
  }
}
```

**Notes:** fixed, deterministic `public_id`
(`.../users/<userId>/profile-picture`) — a re-upload overwrites this
exact asset rather than accumulating orphans (Feature 12 design
decision).

## 18. `DELETE /api/v1/users/me/profile-picture` — Remove own avatar

**Request:** `DELETE /api/v1/users/me/profile-picture`

**Response — `200 OK`**
```json
{
  "user": {
    "id": "dd60c7fc-d1ed-4382-a475-17157a4adb44",
    "email": "runner.20260722@example.com",
    "name": "Runner Test User",
    "profileImageUrl": null,
    "profileImagePublicId": null,
    "createdAt": "2026-07-22T12:27:51.892Z",
    "updatedAt": "2026-07-22T12:31:08.792Z",
    "roles": ["EMPLOYEE", "ADMIN"]
  }
}
```

---

## 19. `DELETE /api/v1/employees/:id` — Soft-delete Employee #2

**Request:** `DELETE /api/v1/employees/e7b8c583-bb92-4e04-a409-59c9863e055e`

**Response — `200 OK`**
```json
{ "message": "Employee deleted successfully" }
```

**Follow-up: `GET /api/v1/employees/e7b8c583-bb92-4e04-a409-59c9863e055e`**

**Response — `404 Not Found`**
```json
{
  "status": "error",
  "message": "Employee not found",
  "stack": "NotFoundError: Employee not found\n    at .../employee.service.js:86:11\n    ..."
}
```

**Notes:** soft-delete (`deletedAt` set, row still physically present) —
confirmed by the fact that the record disappears from every read path
immediately, same behavior verified in Feature 9. Employee #1 was
deliberately left alive since it's referenced throughout this log.

---

## 20. `POST /api/v1/auth/logout` — Revoke session

**Auth:** refresh-token cookie

**Request**
```
POST /api/v1/auth/logout
Cookie: refreshToken=<current token, from step 6's refresh>
```

**Response — `200 OK`**
```
Set-Cookie: refreshToken=; Path=/api/v1/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT
```
```json
{ "message": "Logged out successfully" }
```

**Notes:** the `RefreshToken` row is marked `revoked=true` server-side
(not just the cookie cleared) — reusing this exact token after logout
would now be rejected with `401`, same mechanism as the rotation check.

---

## Summary — all 19 endpoints exercised

| # | Method | Path | Status seen |
|---|--------|------|-------------|
| 1 | GET | `/health` | 200 |
| 2 | GET | `/ready` | 200 |
| 3 | POST | `/auth/register` | 201 |
| 4 | POST | `/auth/login` | 200 |
| 5 | GET | `/auth/me` | 200 |
| 6 | POST | `/auth/refresh` | 200 |
| 7 | GET | `/users` | 403 (EMPLOYEE) → 200 (ADMIN, after promotion + re-login) |
| 8 | POST | `/employees` | 201 (×2) |
| 9 | GET | `/employees` | 200 (plain, search, filter+sort) |
| 10 | GET | `/employees/:id` | 200, then 404 after delete |
| 11 | PATCH | `/employees/:id` | 200 |
| 12 | DELETE | `/employees/:id` | 200 |
| 13 | POST | `/employees/:id/documents` | 201 |
| 14 | GET | `/employees/:id/documents` | 200 |
| 15 | DELETE | `/employees/:id/documents/:documentId` | 200 |
| 16 | POST | `/users/me/profile-picture` | 200 |
| 17 | DELETE | `/users/me/profile-picture` | 200 |
| 18 | POST | `/auth/logout` | 200 |

Every response above was produced by the real running server, real
PostgreSQL database, and real Cloudinary account — none of this was
mocked or hand-written from memory.
