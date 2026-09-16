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
| `POST`   | `/auth/logout`                         | Refresh-token cookie                                   | Revoke the refresh token and invalidate this user's outstanding access tokens (any tab/device) server-side                                                                                                            |
| `GET`    | `/auth/me`                             | Access token (Bearer)                                  | Return the current authenticated user                                                                                                                                                                                 |
| `GET`    | `/users`                               | Access token, `user:list` permission                   | List registered users — paginated (`page`/`limit`), searchable (`search`, across `name`/`email`), filterable (`role`), sortable (`sortBy`/`order`)                                                                    |
| `POST`   | `/employees`                           | Access token, `employee:create` permission             | Create an Employee (HR) record                                                                                                                                                                                        |
| `GET`    | `/employees`                           | Access token, `employee:read:any` permission           | List non-deleted Employee records — paginated (`page`/`limit`), searchable (`search`, across the linked Department's name + linked Designation's name + linked User name/email), filterable (`departmentId`/`designationId`/`employmentType`/`managerId`/`shiftId`), sortable (`sortBy`/`order`) |
| `GET`    | `/employees/:id`                       | Access token, `employee:read:any` or `:own` permission | Get one Employee record (own record allowed for `EMPLOYEE`)                                                                                                                                                           |
| `PATCH`  | `/employees/:id`                       | Access token, `employee:update:any` permission         | Partially update an Employee record                                                                                                                                                                                   |
| `DELETE` | `/employees/:id`                       | Access token, `employee:delete:any` permission         | Soft-delete an Employee record                                                                                                                                                                                        |
| `POST`   | `/users/me/profile-picture`            | Access token (self only)                               | Upload/replace the caller's own avatar                                                                                                                                                                                |
| `DELETE` | `/users/me/profile-picture`            | Access token (self only)                               | Remove the caller's own avatar                                                                                                                                                                                        |
| `POST`   | `/employees/:id/documents`             | Access token, `employee:update:any` permission         | Upload a document (resume, ID proof, etc.) to an Employee record                                                                                                                                                      |
| `GET`    | `/employees/:id/documents`             | Access token, `employee:read:any` or `:own` permission | List an Employee's documents                                                                                                                                                                                          |
| `DELETE` | `/employees/:id/documents/:documentId` | Access token, `employee:update:any` permission         | Permanently remove a document                                                                                                                                                                                         |
| `POST`   | `/branches`                            | Access token, `branch:create` permission (ADMIN only)   | Create a Branch (work location)                                                                                                                                                                                       |
| `GET`    | `/branches`                            | Access token, `branch:read` permission (every role)     | List Branch records — paginated, searchable (`name`/`code`), filterable (`status`), sortable                                                                                                                          |
| `GET`    | `/branches/:id`                        | Access token, `branch:read` permission (every role)     | Get one Branch record                                                                                                                                                                                                 |
| `PATCH`  | `/branches/:id`                        | Access token, `branch:update` permission (ADMIN only)   | Update a Branch, including activating/deactivating it                                                                                                                                                                 |
| `DELETE` | `/branches/:id`                        | Access token, `branch:delete` permission (ADMIN only)   | Hard-delete a Branch — only when zero Employee records reference it                                                                                                                                                   |
| `POST`   | `/departments`                         | Access token, `department:create` permission (ADMIN only) | Create a Department (functional/organizational classification)                                                                                                                                                       |
| `GET`    | `/departments`                         | Access token, `department:read` permission (every role) | List Department records — paginated, searchable (`name`/`code`, case-insensitive), filterable (`status`), sortable                                                                                                    |
| `GET`    | `/departments/:id`                     | Access token, `department:read` permission (every role) | Get one Department record                                                                                                                                                                                             |
| `PATCH`  | `/departments/:id`                     | Access token, `department:update` permission (ADMIN only) | Update a Department, including activating/deactivating it                                                                                                                                                             |
| `DELETE` | `/departments/:id`                     | Access token, `department:delete` permission (ADMIN only) | Hard-delete a Department — only when zero Employee records reference it                                                                                                                                               |
| `POST`   | `/designations`                        | Access token, `designation:create` permission (ADMIN only) | Create a Designation (job title classification)                                                                                                                                                                       |
| `GET`    | `/designations`                        | Access token, `designation:read` permission (every role) | List Designation records — paginated, searchable (`name`/`code`, case-insensitive), filterable (`status`), sortable                                                                                                   |
| `GET`    | `/designations/:id`                    | Access token, `designation:read` permission (every role) | Get one Designation record                                                                                                                                                                                            |
| `PATCH`  | `/designations/:id`                    | Access token, `designation:update` permission (ADMIN only) | Update a Designation, including activating/deactivating it                                                                                                                                                            |
| `DELETE` | `/designations/:id`                    | Access token, `designation:delete` permission (ADMIN only) | Hard-delete a Designation — only when zero Employee records reference it                                                                                                                                              |
| `POST`   | `/holiday-calendars`                   | Access token, `holidayCalendar:create` permission (ADMIN only) | Create a Holiday Calendar (named, year-agnostic container)                                                                                                                                                        |
| `GET`    | `/holiday-calendars`                   | Access token, `holidayCalendar:read` permission (every role) | List Holiday Calendar records — paginated, searchable (`name`), filterable (`status`), sortable                                                                                                                     |
| `GET`    | `/holiday-calendars/:id`               | Access token, `holidayCalendar:read` permission (every role) | Get one Holiday Calendar record (does not include Holiday entries — see the `/holidays` endpoint below)                                                                                                              |
| `PATCH`  | `/holiday-calendars/:id`               | Access token, `holidayCalendar:update` permission (ADMIN only) | Update a Holiday Calendar, including activating/deactivating it                                                                                                                                                      |
| `DELETE` | `/holiday-calendars/:id`               | Access token, `holidayCalendar:delete` permission (ADMIN only) | Hard-delete a Holiday Calendar — only when zero Branch records reference it (Holiday entries cascade-delete)                                                                                                         |
| `POST`   | `/holiday-calendars/:id/holidays`      | Access token, `holidayCalendar:update` permission (ADMIN only) | Add a Holiday entry (date must be unique within the calendar)                                                                                                                                                        |
| `GET`    | `/holiday-calendars/:id/holidays`      | Access token, `holidayCalendar:read` permission (every role) | List a Holiday Calendar's Holiday entries, ordered by date                                                                                                                                                           |
| `PATCH`  | `/holiday-calendars/:id/holidays/:holidayId` | Access token, `holidayCalendar:update` permission (ADMIN only) | Update a Holiday entry                                                                                                                                                                                          |
| `DELETE` | `/holiday-calendars/:id/holidays/:holidayId` | Access token, `holidayCalendar:update` permission (ADMIN only) | Remove a Holiday entry (no reference restriction)                                                                                                                                                               |
| `POST`   | `/shifts`                              | Access token, `shift:create` permission (ADMIN only)    | Create a Shift (recurring working-hours/working-days pattern)                                                                                                                                                          |
| `GET`    | `/shifts`                              | Access token, `shift:read` permission (every role)      | List Shift records — paginated, searchable (`name`), filterable (`status`), sortable                                                                                                                                  |
| `GET`    | `/shifts/:id`                          | Access token, `shift:read` permission (every role)      | Get one Shift record                                                                                                                                                                                                   |
| `PATCH`  | `/shifts/:id`                          | Access token, `shift:update` permission (ADMIN only)    | Update a Shift, including activating/deactivating it                                                                                                                                                                   |
| `DELETE` | `/shifts/:id`                          | Access token, `shift:delete` permission (ADMIN only)    | Hard-delete a Shift — only when zero Employee records reference it                                                                                                                                                     |
| `POST`   | `/attendance/check-in`                 | Access token, `attendance:checkin` permission (every role) | Self-service check-in for the caller's own Employee record (today, server time — no body)                                                                                                                          |
| `PATCH`  | `/attendance/check-out`                | Access token, `attendance:checkin` permission (every role) | Self-service check-out for the caller's own Employee record (today, server time — no body)                                                                                                                         |
| `POST`   | `/attendance`                          | Access token, `attendance:create:any` permission (ADMIN/MANAGER) | Administratively create an AttendanceRecord for any Employee                                                                                                                                                  |
| `GET`    | `/attendance`                          | Access token, `attendance:read:any` permission (ADMIN/MANAGER) | List AttendanceRecords — paginated, filterable (`employeeId`, `dateFrom`/`dateTo`), sortable (no auto-scoped `:own` listing, same shape as `GET /employees`)                                                     |
| `GET`    | `/attendance/effective-status`         | Access token, `attendance:read:any` or `:own` permission | Compute an Employee's effective daily status (`PRESENT`/`LATE`/`HALF_DAY`/`ABSENT`/`HOLIDAY`/`WEEK_OFF`/`ON_LEAVE`) for one date — `employeeId` optional, defaults to caller's own                                          |
| `GET`    | `/attendance/:id`                      | Access token, `attendance:read:any` or `:own` permission | Get one AttendanceRecord (own record allowed for `EMPLOYEE`)                                                                                                                                                       |
| `PATCH`  | `/attendance/:id`                      | Access token, `attendance:update:any` permission (ADMIN/MANAGER) | Correct an AttendanceRecord's `checkIn`/`checkOut`/`isHalfDay`                                                                                                                                                |
| `DELETE` | `/attendance/:id`                      | Access token, `attendance:delete:any` permission (ADMIN/MANAGER) | Delete an AttendanceRecord — no reference-count restriction, rare and audit-logged                                                                                                                            |
| `POST`   | `/leave-types`                         | Access token, `leaveType:create` permission (ADMIN only) | Create a Leave Type (e.g. Annual, Sick, Casual)                                                                                                                                                                        |
| `GET`    | `/leave-types`                         | Access token, `leaveType:read` permission (every role)  | List Leave Type records — paginated, searchable (`name`), filterable (`status`), sortable                                                                                                                             |
| `GET`    | `/leave-types/:id`                     | Access token, `leaveType:read` permission (every role)  | Get one Leave Type record                                                                                                                                                                                              |
| `PATCH`  | `/leave-types/:id`                     | Access token, `leaveType:update` permission (ADMIN only) | Update a Leave Type, including activating/deactivating it                                                                                                                                                              |
| `DELETE` | `/leave-types/:id`                     | Access token, `leaveType:delete` permission (ADMIN only) | Hard-delete a Leave Type — only when zero LeaveRequest/LeaveBalance records reference it                                                                                                                               |
| `POST`   | `/leave-requests`                      | Access token, `leaveRequest:create:own` permission (every role) | Apply for leave against the caller's own Employee record — rejects an overlapping Pending/Approved request                                                                                                     |
| `GET`    | `/leave-requests`                      | Access token, `leaveRequest:read:any` or `:own` permission | List Leave Requests — auto-scoped to the caller's own `employeeId` without `:any` (diverges from `GET /attendance`'s any-only shape)                                                                             |
| `GET`    | `/leave-requests/:id`                  | Access token, `leaveRequest:read:any` or `:own` permission | Get one Leave Request (own record allowed for `EMPLOYEE`)                                                                                                                                                         |
| `PATCH`  | `/leave-requests/:id/approve`          | Access token, `leaveRequest:decide:any` (ADMIN) or `:decide:reports` (MANAGER, own reports only) | Approve a Pending request — computes holiday/week-off-excluded duration and deducts the balance                                                                             |
| `PATCH`  | `/leave-requests/:id/reject`           | Access token, `leaveRequest:decide:any` or `:decide:reports` | Reject a Pending request — no balance change                                                                                                                                                                  |
| `PATCH`  | `/leave-requests/:id/cancel`           | Access token, `leaveRequest:cancel:own` or `:cancel:any` (ADMIN) | Cancel a Pending or future-dated Approved request — restores the balance if it was Approved                                                                                                                   |
| `GET`    | `/leave-balances`                      | Access token, `leaveBalance:read:any` or `:own` permission | List Leave Balances — same own-vs-any auto-scoping as `GET /leave-requests`; `remaining` is not stored, compute as `entitlement - consumed`                                                                     |
| `GET`    | `/leave-balances/:id`                  | Access token, `leaveBalance:read:any` or `:own` permission | Get one Leave Balance                                                                                                                                                                                              |
| `PATCH`  | `/leave-balances/:id`                  | Access token, `leaveBalance:adjust:any` permission (ADMIN only) | Manually adjust `entitlement`/`consumed` — the escape hatch for the strict no-negative-balance default, always audit-logged                                                                                  |
| `POST`   | `/payroll-runs`                        | Access token, `payrollRun:create` permission (ADMIN only) | Create a DRAFT PayrollRun for a calendar month (`periodMonth`/`periodYear`) — periods must not overlap                                                                                                          |
| `GET`    | `/payroll-runs`                        | Access token, `payrollRun:read` permission (ADMIN only) | List PayrollRun records — paginated, filterable (`status`, `periodYear`), sortable                                                                                                                              |
| `GET`    | `/payroll-runs/:id`                    | Access token, `payrollRun:read` permission (ADMIN only) | Get one PayrollRun record, including `payslipCount`                                                                                                                                                              |
| `PATCH`  | `/payroll-runs/:id/process`            | Access token, `payrollRun:process` permission (ADMIN only) | Generate one Payslip per active Employee and move DRAFT → PROCESSING                                                                                                                                            |
| `PATCH`  | `/payroll-runs/:id/finalize`           | Access token, `payrollRun:finalize` permission (ADMIN only) | Move PROCESSING → FINALIZED — the run's Payslips become immutable                                                                                                                                               |
| `PATCH`  | `/payroll-runs/:id/mark-paid`          | Access token, `payrollRun:markPaid` permission (ADMIN only) | Move FINALIZED → PAID — a pure status transition, not a recalculation                                                                                                                                           |
| `DELETE` | `/payroll-runs/:id`                    | Access token, `payrollRun:delete` permission (ADMIN only) | Delete a DRAFT PayrollRun — by construction it has zero Payslips yet                                                                                                                                            |
| `GET`    | `/payslips`                            | Access token, `payslip:read:any` or `:own` permission | List Payslips — same own-vs-any auto-scoping as `GET /leave-requests`; filterable (`employeeId` [`:any` only], `payrollRunId`), sortable                                                                        |
| `GET`    | `/payslips/:id`                        | Access token, `payslip:read:any` or `:own` permission | Get one Payslip, including its `lineItems` breakdown — no edit endpoint exists at any status                                                                                                                    |
| `POST`   | `/review-cycles`                       | Access token, `reviewCycle:create` permission (ADMIN only) | Create a Review Cycle (e.g. "H1 2026 Review")                                                                                                                                                                     |
| `GET`    | `/review-cycles`                       | Access token, `reviewCycle:read` permission (every role) | List Review Cycle records — paginated, searchable (`name`), filterable (`status`), sortable                                                                                                                     |
| `GET`    | `/review-cycles/:id`                   | Access token, `reviewCycle:read` permission (every role) | Get one Review Cycle record                                                                                                                                                                                       |
| `PATCH`  | `/review-cycles/:id`                   | Access token, `reviewCycle:update` permission (ADMIN only) | Update a Review Cycle, including opening/closing it                                                                                                                                                               |
| `DELETE` | `/review-cycles/:id`                   | Access token, `reviewCycle:delete` permission (ADMIN only) | Hard-delete a Review Cycle — only when zero PerformanceReview records reference it                                                                                                                                |
| `POST`   | `/performance-reviews`                 | Access token, `performanceReview:create:reports` or `:create:any` | Author a Draft review for a direct report (MANAGER) or any employee (ADMIN, required when the employee has no manager, with an explicit `reviewerId`)                                                    |
| `GET`    | `/performance-reviews`                 | Access token, `performanceReview:read:any`, `:read:own`, or `:manage:reports` | List Performance Reviews — auto-scoped to own reviews and/or reports' reviews without `:any`, extending `GET /leave-requests`'s own/any shape with a manager's-reports branch |
| `GET`    | `/performance-reviews/:id`              | Access token, any performance-review read/manage permission | Get one Performance Review, including its `addenda` breakdown                                                                                                                                                    |
| `PATCH`  | `/performance-reviews/:id`              | Access token, `performanceReview:manage:reports` or `:manage:any` | Edit rating/managerComments — Draft only; once Submitted, use addenda instead                                                                                                                                    |
| `PATCH`  | `/performance-reviews/:id/submit`       | Access token, `performanceReview:manage:reports` or `:manage:any` | Move Draft → Submitted — requires rating and managerComments set; snapshots department/designation/branch names at this moment                                                                                  |
| `PATCH`  | `/performance-reviews/:id/self-assessment` | Access token, `performanceReview:selfAssess:own` | The reviewed employee sets their own self-assessment — any time before Acknowledged                                                                                                                          |
| `PATCH`  | `/performance-reviews/:id/acknowledge`  | Access token, `performanceReview:acknowledge:own` | The reviewed employee acknowledges a Submitted review — Submitted → Acknowledged, no admin/manager override exists                                                                                              |
| `DELETE` | `/performance-reviews/:id`              | Access token, `performanceReview:manage:reports` or `:manage:any` | Delete a Draft Performance Review — mirrors PayrollRun's Draft-only-delete convenience                                                                                                                          |
| `POST`   | `/performance-reviews/:id/addenda`      | Access token (any read/manage permission that grants access to this review) | Append a comment — the mechanism for adding commentary once a review is Acknowledged, without editing its frozen content                                                                          |
| `POST`   | `/job-requisitions`                    | Access token, `jobRequisition:create` (ADMIN only) | Create a Job Requisition — Department/Designation mandatory, Branch optional, mirroring Employee's own axes                                                                                                      |
| `GET`    | `/job-requisitions`                    | Access token, `jobRequisition:read` (ADMIN only) | List Job Requisitions — paginated, filterable, sortable                                                                                                                                                           |
| `GET`    | `/job-requisitions/:id`                | Access token, `jobRequisition:read` (ADMIN only) | Get one Job Requisition                                                                                                                                                                                           |
| `PATCH`  | `/job-requisitions/:id/status`         | Access token, `jobRequisition:update` (ADMIN only) | Transition status — `OPEN`↔`ON_HOLD`, either to `CANCELLED`; `CLOSED` is rejected here, set only automatically when openings are exhausted                                                                      |
| `DELETE` | `/job-requisitions/:id`                | Access token, `jobRequisition:delete` (ADMIN only) | Hard-delete a Job Requisition — only when zero Application records reference it                                                                                                                                  |
| `POST`   | `/candidates`                          | Access token, `candidate:create` (ADMIN only) | Create a Candidate — not a `User`, no system login, no email-uniqueness constraint                                                                                                                               |
| `GET`    | `/candidates`                          | Access token, `candidate:read` (ADMIN only) | List Candidates — paginated, searchable (name/email/phone), sortable                                                                                                                                              |
| `GET`    | `/candidates/:id`                      | Access token, `candidate:read` (ADMIN only) | Get one Candidate                                                                                                                                                                                                 |
| `PATCH`  | `/candidates/:id`                      | Access token, `candidate:update` (ADMIN only) | Update a Candidate                                                                                                                                                                                                |
| `DELETE` | `/candidates/:id`                      | Access token, `candidate:delete` (ADMIN only) | Hard-delete a Candidate — only when zero Application records reference it; does not resolve the still-open PII-retention question for a candidate who went through a pipeline                                  |
| `POST`   | `/candidates/:id/documents`            | Access token, `candidate:update` (ADMIN only) | Upload a Candidate document (e.g. resume) — mirrors `POST /employees/:id/documents` exactly                                                                                                                      |
| `GET`    | `/candidates/:id/documents`            | Access token, `candidate:read` (ADMIN only) | List a Candidate's documents                                                                                                                                                                                      |
| `DELETE` | `/candidates/:id/documents/:documentId` | Access token, `candidate:update` (ADMIN only) | Delete a Candidate document                                                                                                                                                                                      |
| `POST`   | `/applications`                        | Access token, `application:create` (ADMIN only) | Create an Application — links a Candidate to a JobRequisition, starts `APPLIED`; rejected if the requisition isn't `OPEN`/`ON_HOLD`                                                                              |
| `GET`    | `/applications`                        | Access token, `application:read` (ADMIN only) | List Applications — paginated, filterable, sortable                                                                                                                                                               |
| `GET`    | `/applications/:id`                    | Access token, `application:read` (ADMIN only) | Get one Application, including its Candidate, JobRequisition, Interviews, and Offers                                                                                                                             |
| `PATCH`  | `/applications/:id/status`             | Access token, `application:update` (ADMIN only) | Transition status — `APPLIED→SCREENING→INTERVIEW→OFFER` strictly sequential; `REJECTED`/`WITHDRAWN` from any non-terminal stage; `HIRED` is not settable here                                                   |
| `POST`   | `/applications/:id/hire`               | Access token, `application:hire` (ADMIN only) | The Hire Orchestration Service boundary — requires an `OFFER`-stage application with an Accepted offer; invokes Identity's onboarding process, creating an Employee (and optionally a User)                     |
| `POST`   | `/applications/:id/interviews`         | Access token, `application:update` (ADMIN only) | Schedule an Interview — interviewer and time only; feedback/recommendation added later                                                                                                                           |
| `GET`    | `/applications/:id/interviews`         | Access token, `application:read` (ADMIN only) | List an Application's Interviews                                                                                                                                                                                  |
| `PATCH`  | `/applications/:id/interviews/:interviewId` | Access token, `application:update` (ADMIN only) | Update an Interview's feedback/recommendation, or reschedule it                                                                                                                                              |
| `DELETE` | `/applications/:id/interviews/:interviewId` | Access token, `application:update` (ADMIN only) | Delete an Interview                                                                                                                                                                                           |
| `POST`   | `/applications/:id/offers`             | Access token, `application:update` (ADMIN only) | Create an Offer — only while the Application is in the `OFFER` stage; only one Pending offer per Application at a time                                                                                           |
| `PATCH`  | `/applications/:id/offers/:offerId/accept` | Access token, `application:update` (ADMIN only) | Accept a Pending offer                                                                                                                                                                                        |
| `PATCH`  | `/applications/:id/offers/:offerId/decline` | Access token, `application:update` (ADMIN only) | Decline a Pending offer                                                                                                                                                                                      |
| `PATCH`  | `/applications/:id/offers/:offerId/expire` | Access token, `application:update` (ADMIN only) | Mark a Pending offer Expired — manual, no scheduled/automatic expiry exists project-wide                                                                                                                     |
| `POST`   | `/training-programs`                   | Access token, `trainingProgram:create` (ADMIN only) | Create a Training Program — `mandatory` flag governs whether self-enrollment is allowed                                                                                                                          |
| `GET`    | `/training-programs`                   | Access token, `trainingProgram:read` (every role) | List Training Programs — paginated, searchable, filterable (mandatory/status), sortable                                                                                                                          |
| `GET`    | `/training-programs/:id`               | Access token, `trainingProgram:read` (every role) | Get one Training Program                                                                                                                                                                                          |
| `PATCH`  | `/training-programs/:id`               | Access token, `trainingProgram:update` (ADMIN only) | Update a Training Program, including deactivating it                                                                                                                                                             |
| `DELETE` | `/training-programs/:id`               | Access token, `trainingProgram:delete` (ADMIN only) | Hard-delete a Training Program — only when zero Enrollment records reference it                                                                                                                                  |
| `POST`   | `/enrollments`                         | Access token, `enrollment:create:own` or `:create:any` | Self-enroll (non-mandatory programs only) or enroll any employee (ADMIN/HR, employeeId required, any program including mandatory)                                                                        |
| `GET`    | `/enrollments`                         | Access token, `enrollment:read:own` or `:read:any` | List Enrollments — auto-scoped to own without `:any`, the same pattern `GET /leave-requests` established                                                                                                         |
| `GET`    | `/enrollments/:id`                     | Access token, `enrollment:read:own` or `:read:any` | Get one Enrollment                                                                                                                                                                                                |
| `PATCH`  | `/enrollments/:id/status`              | Access token, `enrollment:manage:any` or `:withdraw:own` | Transition status — `ENROLLED→IN_PROGRESS→COMPLETED\|FAILED` sequential, `WITHDRAWN` from either non-terminal stage; only `manage:any` can mark Completed/Failed                                          |
| `DELETE` | `/enrollments/:id`                     | Access token, `enrollment:manage:any` | Delete an Enrollment — unrestricted by status, mirrors Attendance's own delete convention                                                                                                                        |
| `POST`   | `/enrollments/:id/documents`           | Access token, any enrollment read/manage permission | Upload an Enrollment document (e.g. certificate) — mirrors Employee/Candidate document uploads exactly                                                                                                    |
| `GET`    | `/enrollments/:id/documents`           | Access token, any enrollment read/manage permission | List an Enrollment's documents                                                                                                                                                                                    |
| `DELETE` | `/enrollments/:id/documents/:documentId` | Access token, any enrollment read/manage permission | Delete an Enrollment document                                                                                                                                                                              |
| `GET`    | `/training-compliance`                 | Access token, `enrollment:read:own` or `:read:any` | Computed (not stored) compliance status — single program (`trainingProgramId` query param) or a bulk report across every mandatory program                                                                      |

`POST`/`PATCH /employees` also accept an optional `branchId`, validated
against Branch's positive-allowlist rule (must exist and be `ACTIVE`).

`POST`/`PATCH /branches` also accept an optional `holidayCalendarId`
(2026-09-13, `docs/domain-holiday-calendar.md` ADR-HC03), validated the
same way — must exist and be `ACTIVE`. Absence means no holidays are
applied for that branch, never an error.

`POST`/`PATCH /employees` also accept an optional `shiftId` (2026-09-15,
`docs/domain-shift.md` ADR-SH02), validated the same way — must exist and
be `ACTIVE`. Absence means no fixed-hours expectation for that employee,
never an error. Shift's `startTime`/`endTime` are 24-hour `"HH:mm"`
strings; `endTime < startTime` is a valid, deliberately-supported
overnight (midnight-crossing) shift, not an error (ADR-SH03).

**New domain (2026-09-15):** Attendance (`docs/domain-attendance.md`) is
the first domain that breaks the create/update/archive/hard-delete-if-
referenced mold every prior domain followed — `AttendanceRecord` is a
raw-fact historical ledger (one per `(employeeId, date)`), never
"deactivated," only ever corrected (tracked via `AuditLog`, not silently
overwritten). `GET /attendance/effective-status` is the first coordinating
read that cross-references other domains (Holiday Calendar + Shift, and
now Leave) to compute a value that is never persisted. Permission scoping
mirrors `Employee`'s own/any split (self-service `attendance:checkin`
plus `:read:own`/`:read:any`/`:create:any`/`:update:any`/`:delete:any`),
not the ADMIN-only-mutation shape used by every master-data domain above.

**New domain (2026-09-15):** Leave (`docs/domain-leave.md`) is this
review's largest domain — three aggregates (`LeaveType`, `LeaveRequest`,
`LeaveBalance`) and its first genuine multi-party approval workflow
(`PENDING → APPROVED | REJECTED`, `APPROVED → CANCELLED` while
future-dated). `LeaveType` follows the `ADMIN`-only-mutation pattern;
`LeaveRequest`/`LeaveBalance` mirror `Employee`'s own/any split, the same
divergence Attendance's own permission model already established.
Approval authority is `ADMIN` (unconditional) or `MANAGER` (their own
direct reports only, checked via `Employee.managerId`) — two distinct
permissions (`leaveRequest:decide:any`/`:decide:reports`), not one shared
key. Leave-day duration excludes holidays/week-offs (reusing Holiday
Calendar's `isDateHolidayInCalendar` and Shift's `workingDays`, the same
primitives Attendance already consumes) and is computed once at approval
time. `LeaveBalance` entitlement is prorated by hire date in the hire
year (full entitlement every year after), computed lazily on first need
rather than via a scheduled grant job — this project has no scheduler
infrastructure. `PATCH /leave-balances/:id` (ADMIN-only) is the audit-
logged manual-override escape hatch for the strict no-negative-balance
default. This domain also closes the gap Attendance's `GET
/attendance/effective-status` named when it was first built:
`leaveService.hasApprovedLeaveOnDate()` now feeds an `ON_LEAVE` branch
into that endpoint's resolution order, a pure read with no write back
into Attendance.

**New domain (2026-09-15):** Payroll (`docs/domain-payroll.md`) is the
domain every prior domain in this review was building toward — given an
Employee's base salary, attendance record, and approved leave, what did
they actually earn this period, and what is the permanent record of that
calculation. Two aggregates, `PayrollRun` (`DRAFT → PROCESSING →
FINALIZED → PAID`) and `Payslip` (plus a generic `PayslipLineItem` child,
`{type, label, amount}` — the same "avoid a wide, brittle schema"
reasoning already applied to `AuditLog`/`EmployeeDocument`). Processing
generates one Payslip per active Employee in the same step, computing
gross pay, an unpaid-day deduction, and net pay by calling
`attendanceService.getEffectiveStatus()` for each calendar day of the
period — the third consumer of that read chain after Attendance's own
endpoints and Leave's `ON_LEAVE` integration. `Employee.salary` is
confirmed to represent a **monthly** figure (stakeholder-confirmed before
implementation, not assumed). Every input — salary, department/
designation/branch names, employment type, the computed attendance/leave
outcome — is snapshotted onto the Payslip at generation time and never
live-joined afterward: a January Payslip must not silently reflect a
department transfer that happened in February. There is no edit endpoint
for a Payslip at any status; a correction is an adjustment line item in a
later run. `LeaveType` gained an additive `isPaid` field
(`docs/domain-leave.md` ADR-LV09) so an approved leave day can be told
apart as paid or unpaid for this calculation. `PayrollRun` follows the
`ADMIN`-only-mutation pattern (no dedicated Finance/Payroll role exists);
`Payslip` reads split own/any, but `MANAGER` gets only `:own`, not
visibility into their reports' pay.

**New domain (2026-09-15):** Performance (`docs/domain-performance.md`) —
this review's second explicit multi-party workflow after Leave.
`ReviewCycle` (master data, `OPEN`/`CLOSED`) and `PerformanceReview`
(`DRAFT → SUBMITTED → ACKNOWLEDGED`), plus an append-only `ReviewAddendum`
child for post-Acknowledgement commentary. `reviewerId` is resolved from
`Employee.managerId` and stored at creation time — a manager's later
reassignment never rewrites who authored a past review; `ADMIN` must
supply `reviewerId` explicitly when the target employee has no manager.
Org-context (department/designation/branch names) is snapshotted at
**Submit** specifically, not at creation. `PATCH` (editing rating/
comments) only works while `DRAFT` — once `SUBMITTED`, further commentary
goes through addenda instead. `rating` is a closed 5-value categorical
enum (`OUTSTANDING` … `UNSATISFACTORY`). Permission model: `ReviewCycle`
is `ADMIN`-only; `PerformanceReview` splits authoring
(`create:reports`/`create:any`, extending Leave's manager-plus-admin-
fallback shape) from lifecycle management (`manage:reports`/`manage:any`)
and the reviewed employee's own actions (`read:own`, `acknowledge:own`,
`selfAssess:own`). Adding an addendum needs no dedicated permission —
gated by whichever read/manage permission already grants access to that
specific review.

**New domain (2026-09-16):** Recruitment (`docs/domain-recruitment.md`) —
the largest domain in this review, five coordinated aggregates
(`JobRequisition`, `Candidate`, `Application`, `Interview`, `Offer`)
covering the pre-employment pipeline that ultimately produces the Employee
records every other domain assumes already exist. `JobRequisition` mirrors
Employee's own department/designation/branch axes and auto-closes once
`remainingOpenings` reaches zero. `Candidate` is explicitly not a `User` —
no system login, no email-uniqueness constraint, and (unlike Employee) a
real hard-delete when unreferenced. `Application` carries a guarded state
machine (`APPLIED → SCREENING → INTERVIEW → OFFER → HIRED | REJECTED |
WITHDRAWN`) where forward stages are strictly sequential and `HIRED` is
reachable only through the dedicated Hire action, never the generic status
endpoint. `Offer` allows only one `PENDING` offer per Application at a
time, enforced by a partial unique index. The **Hire** step is the single
orchestration boundary into Identity: recon found that the onboarding
process this domain's own design assumed already existed
(`docs/domain-identity-employee-lifecycle.md` §2 — search-by-email, then
reuse-or-create a `User`, then link) had never actually been built, so it
was built here as a new, narrowly-scoped `employeeOnboarding.service.js`
module, reused as Identity's own real onboarding implementation, not a
Recruitment-specific shortcut. Access provisioning defaults to `false`
(no login) per Identity's own asymmetric-defaults principle; an admin
supplies an `initialPassword` only when a genuinely new hire needs one (no
invite-email mechanism exists anywhere in this project). Permission
scoping (`ADR-RC05`) is `ADMIN`-only across every aggregate — unlike Leave/
Payroll/Performance, nothing here has a natural "own" scope, since a
Candidate isn't a system identity at all.

**New domain (2026-09-16):** Training (`docs/domain-training.md`) — two
aggregates, `TrainingProgram` (master data) and `Enrollment` (a per-attempt
historical record, deliberately repeatable — unlike Branch/Department/
Designation/Shift's single-current-value axes, retaking or renewing
training is normal, so no uniqueness constraint exists on `(employeeId,
trainingProgramId)`). `Enrollment.status` is a guarded state machine
(`ENROLLED → IN_PROGRESS → COMPLETED | FAILED` strictly sequential,
`WITHDRAWN` from either non-terminal stage). Self-enrollment
(`enrollment:create:own`) is restricted to non-mandatory programs — a hard
service-layer rule, not just a suggestion — mandatory-program enrollment
must go through `enrollment:create:any` (`ADMIN`/HR). Only `enrollment:
manage:any` can mark an enrollment `COMPLETED`/`FAILED`/`IN_PROGRESS`; an
employee can withdraw their own enrollment (`enrollment:withdraw:own`) but
cannot self-attest completion, which would undermine compliance tracking's
whole point. Compliance status is **computed on read, never stored**
(reusing Attendance's ADR-AT03 principle) — `GET /training-compliance`
finds the most recent `COMPLETED` enrollment for a program and checks it
against that program's `renewalPeriodDays` (absent means compliant
indefinitely once completed once), in both a single-program and a bulk
across-every-mandatory-program shape. Deliberately **no `MANAGER`
reports-visibility** — unlike Leave/Performance, the domain doc's own "who
performs" text never mentions managers, only `ADMIN`/HR and self-enrollment.

**Breaking change (2026-09-13):** Employee's free-text `department`
(`String`) field was removed and replaced by a **mandatory**
`departmentId`, validated the same way as `branchId` but required, not
optional (existing data was backfilled via
`backend/prisma/backfill-department.js` before the column was dropped).

**Breaking change (2026-09-13):** Employee's free-text `jobTitle`
(`String`) field was removed and replaced by a **mandatory**
`designationId`, same treatment as `departmentId` above (existing data was
backfilled via `backend/prisma/backfill-designation.js` before the column
was dropped).

**New required field (2026-09-13):** `POST`/`PATCH /employees` now also
require `employmentType` (`FULL_TIME`/`PART_TIME`/`CONTRACT`/`INTERN`) — a
closed, code-defined enum, not a managed master-data table like
Branch/Department/Designation (see `docs/domain-employment-type.md`,
ADR-ET01). Unlike those three, there was no free-text precursor column;
the 30 pre-existing Employee rows were assigned `FULL_TIME` by a one-time
migration default, then the default was dropped so every future write
must specify it explicitly.

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
├── modules/                  # Feature-first domain modules (auth, users, rbac, employees, branches, departments, designations, holidayCalendars, audit)
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
