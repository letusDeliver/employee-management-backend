# Employee Management App — Backend

A production-oriented Employee Management System backend, built feature by
feature as a guided learning project — Clean Architecture, JavaScript
(ES Modules, no TypeScript), PostgreSQL via Prisma, JWT authentication
with refresh-token rotation, and structured logging.

This repository doubles as a teaching artifact: every feature was
designed with theory and trade-offs explained first, then implemented and
verified. See [`../handbook/`](../handbook) for the full write-up of each
feature (architecture, security implications, common mistakes, interview
prep) and [`CLAUDE.md`](./CLAUDE.md) for the running project context and
progress log. This is the **backend-specific** README — see the
[repository root README](../README.md) for the overall project (backend +
frontend) index.

## Tech Stack

- **Runtime**: Node.js (>= 20), JavaScript (ES Modules)
- **Framework**: Express 5
- **Database**: PostgreSQL via Prisma ORM (driver adapter: `@prisma/adapter-pg`)
- **Auth**: JWT access + refresh tokens (rotating, database-backed refresh tokens)
- **Validation**: Zod (both environment config and request bodies)
- **Logging**: Winston (leveled, environment-aware) + Morgan (HTTP access logs)
- **Security**: Helmet, CORS, bcrypt-hashed passwords, httpOnly cookies
- **File uploads**: Multer (memory storage) + Cloudinary (profile pictures, Employee documents)
- **API docs**: Swagger UI (`swagger-ui-express`) + OpenAPI 3.0, generated from the same Zod validation schemas that enforce requests (`@asteasolutions/zod-to-openapi`)
- **Tooling**: ESLint (flat config) + Prettier, nodemon

## Getting Started

### Prerequisites

- Node.js >= 20
- A running PostgreSQL instance (local install or Docker)

### Setup

1. **Clone and install dependencies**

   ```bash
   npm install
   ```

2. **Create a dedicated database and role** (never connect as the
   Postgres superuser — see `planning/feature-03-postgres-prisma-setup.md`
   for the exact SQL and reasoning):

   ```sql
   CREATE DATABASE employee_management_db;
   CREATE USER employee_management_app WITH ENCRYPTED PASSWORD 'choose-a-strong-password';
   GRANT ALL PRIVILEGES ON DATABASE employee_management_db TO employee_management_app;
   ```

3. **Copy `.env.example` to `.env`** and fill in real values:

   ```bash
   cp .env.example .env
   ```
   - `DATABASE_URL` — using the role created above.
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — long, random, and
     **different from each other** (minimum 32 characters; the app
     validates this at boot and refuses to start otherwise). Generate
     with, e.g.:
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
   - `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` —
     from your Cloudinary account dashboard. **Required** — the app
     validates these at boot the same as the JWT secrets and refuses to
     start without them, since profile pictures and Employee documents
     depend on a real Cloudinary connection.
   - `ENABLE_SWAGGER` — optional, defaults to `false` in every environment.
     Set to `true` to serve the interactive API docs locally (see
     [API Documentation](#api-documentation) below).

4. **Run database migrations**

   ```bash
   npx prisma migrate dev
   ```

5. **Seed roles and permissions** — required for RBAC to work at all
   (registration assigns a default `EMPLOYEE` role, which must already
   exist):

   ```bash
   npx prisma db seed
   ```

6. **Start the dev server**
   ```bash
   npm run dev
   ```
   The server boots on `http://localhost:3000` (configurable via `PORT`).

### Available Scripts

| Script                 | Purpose                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `npm run dev`          | Start the server with `nodemon` (auto-restart on file changes) |
| `npm start`            | Start the server (production mode, no auto-restart)            |
| `npm run lint`         | Run ESLint                                                     |
| `npm run lint:fix`     | Run ESLint with auto-fix                                       |
| `npm run format`       | Format the codebase with Prettier                              |
| `npm run format:check` | Check formatting without writing changes                       |

## API Endpoints (Current)

All routes are mounted under `/api/v1`.

| Method   | Path                                   | Auth Required                                          | Description                                                                                                                                                                                                           |
| -------- | -------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/health`                              | No                                                     | Liveness check — is the process running                                                                                                                                                                               |
| `GET`    | `/ready`                               | No                                                     | Readiness check — is the database reachable                                                                                                                                                                           |
| `POST`   | `/auth/register`                       | No                                                     | Create an account, receive an access token + refresh-token cookie                                                                                                                                                     |
| `POST`   | `/auth/login`                          | No                                                     | Authenticate, receive an access token + refresh-token cookie                                                                                                                                                          |
| `POST`   | `/auth/refresh`                        | Refresh-token cookie                                   | Rotate the refresh token, issue a new access token                                                                                                                                                                    |
| `POST`   | `/auth/logout`                         | Refresh-token cookie                                   | Revoke the refresh token server-side                                                                                                                                                                                  |
| `GET`    | `/auth/me`                             | Access token (Bearer)                                  | Return the current authenticated user                                                                                                                                                                                 |
| `GET`    | `/users`                               | Access token, `user:list` permission                   | List all registered users                                                                                                                                                                                             |
| `POST`   | `/employees`                           | Access token, `employee:create` permission             | Create an Employee (HR) record                                                                                                                                                                                        |
| `GET`    | `/employees`                           | Access token, `employee:read:any` permission           | List non-deleted Employee records — paginated (`page`/`limit`), searchable (`search`, across Employee fields + linked User name/email), filterable (`department`/`jobTitle`/`managerId`), sortable (`sortBy`/`order`) |
| `GET`    | `/employees/:id`                       | Access token, `employee:read:any` or `:own` permission | Get one Employee record (own record allowed for `EMPLOYEE`)                                                                                                                                                           |
| `PATCH`  | `/employees/:id`                       | Access token, `employee:update:any` permission         | Partially update an Employee record                                                                                                                                                                                   |
| `DELETE` | `/employees/:id`                       | Access token, `employee:delete:any` permission         | Soft-delete an Employee record                                                                                                                                                                                        |
| `POST`   | `/users/me/profile-picture`            | Access token (self only)                               | Upload/replace the caller's own avatar                                                                                                                                                                                |
| `DELETE` | `/users/me/profile-picture`            | Access token (self only)                               | Remove the caller's own avatar                                                                                                                                                                                        |
| `POST`   | `/employees/:id/documents`             | Access token, `employee:update:any` permission         | Upload a document (resume, ID proof, etc.) to an Employee record                                                                                                                                                      |
| `GET`    | `/employees/:id/documents`             | Access token, `employee:read:any` or `:own` permission | List an Employee's documents                                                                                                                                                                                          |
| `DELETE` | `/employees/:id/documents/:documentId` | Access token, `employee:update:any` permission         | Permanently remove a document                                                                                                                                                                                         |

Authorization is permission-based (see `../handbook/API_ENDPOINTS.md`), not
role-based — `ADMIN`/`MANAGER`/`EMPLOYEE` are role names seeded with a
specific set of permissions, not hard-coded checks.

## API Documentation

Two complementary references, kept in sync (see `CLAUDE.md` Rule 17):

- **[`../handbook/API_ENDPOINTS.md`](../handbook/API_ENDPOINTS.md)** — the
  deep, implementation-accurate reference (every status code, security/
  negative testing, edge cases, cURL examples).
- **Swagger UI** — an interactive, machine-readable reference generated
  from the same Zod validation schemas that enforce requests, with a
  JWT **Authorize** button so protected endpoints can be tried directly
  in the browser. Off by default in every environment; set
  `ENABLE_SWAGGER=true` to enable it locally, then visit:
  - `http://localhost:3000/api-docs` — the interactive UI
  - `http://localhost:3000/api-docs.json` — the raw OpenAPI 3.0 document

## Project Structure

This is `backend/` inside the monorepo root (see the
[repository root README](../README.md) for the full `backend/` +
`frontend/` + `handbook/` + `docs/` layout).

```
src/
├── app.js, server.js        # Express app assembly + process lifecycle
├── config/                  # env.js, database.js, logger.js — one shared instance each
├── docs/                     # OpenAPI registry/generator/security + Swagger UI mounting
├── errors/                  # Typed AppError hierarchy
├── middlewares/              # auth, permission (RBAC), validate, upload (Multer), error, notFound
├── modules/                  # Feature-first domain modules (auth, users, rbac, employees, audit)
├── routes/                   # Router aggregation
└── utils/                    # asyncHandler, jwt

prisma/                       # Schema + migrations
planning/                     # Approved action plan for each feature
```

`handbook/` (per-feature deep-dive docs, shared with the frontend) now
lives at the repository root — `../handbook/`, not nested inside
`backend/`.

## Documentation

- **[`CLAUDE.md`](./CLAUDE.md)** — project context, architecture decisions, and the running feature progress log.
- **[`../handbook/`](../handbook)** — one deep-dive chapter per feature (theory, architecture, security, common mistakes, interview prep), plus a [cumulative progress summary and interview-prep sheet](../handbook/00-progress-summary-and-interview-prep.md).
- **[`../handbook/TESTING_GUIDE.md`](../handbook/TESTING_GUIDE.md)** — a sequential, end-to-end manual test runbook: every endpoint paired with a database query (Prisma + raw SQL) that verifies the resulting state.
- **[`planning/`](./planning)** — the approved action plan for each feature, written and reviewed before implementation.

## Roadmap

- [x] Project setup & folder structure
- [x] Express app bootstrap
- [x] PostgreSQL + Prisma setup
- [x] Environment config & validation (Zod)
- [x] Logging (Winston)
- [x] User model & Auth: Register/Login
- [x] JWT Access + Refresh Tokens
- [x] RBAC (roles & permissions)
- [x] Employee CRUD
- [x] Employee search, pagination, filtering, sorting
- [x] Audit logs
- [x] File uploads (Multer + Cloudinary)
- [x] Swagger API docs
- [ ] Dockerization
- [ ] Testing strategy
