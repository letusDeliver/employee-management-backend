# Engineering Handbook

Internal engineering handbook for the Employee Management App — shared
between the backend and the Angular frontend since the monorepo
restructuring — doubles as senior interview preparation material. One
chapter is written per completed feature, in build order, immediately
after that feature ships.

## Overview

- [Progress Summary & Interview Prep (Features 1–7)](./00-progress-summary-and-interview-prep.md) — cumulative recap, every real bug/surprise found, and a consolidated interview Q&A sheet. Updated periodically, not after every single feature.
- [API Endpoints Handbook](./API_ENDPOINTS.md) — a living, implementation-accurate reference for every endpoint (headers, validation, every status code, Postman/cURL examples, security/negative testing, request lifecycle). Updated after every feature that touches an endpoint — see `CLAUDE.md` Rule 17.
- [Manual Testing Guide](./TESTING_GUIDE.md) — a sequential, end-to-end runbook: every endpoint paired with the database query (Prisma + raw SQL) that verifies the resulting state actually changed correctly. The interim manual QA process until automated tests land.

## Backend Chapters

1. [Project Setup & Folder Structure](./01-project-setup-and-folder-structure.md)
2. [Express App Bootstrap](./02-express-app-bootstrap.md)
3. [PostgreSQL + Prisma Setup](./03-postgresql-prisma-setup.md)
4. [Environment Config & Validation (Zod)](./04-environment-config-validation.md)
5. [Logging (Winston)](./05-logging-winston.md)
6. [User Model & Auth (Register/Login)](./06-user-model-auth.md)
7. [JWT Access + Refresh Tokens](./07-jwt-access-refresh-tokens.md)
8. [RBAC (Roles & Permissions)](./08-rbac.md)
9. [RBAC Redesign + Employee CRUD](./09-rbac-redesign-and-employee-crud.md)
10. [Employee Search, Pagination, Filtering, Sorting](./10-employee-search-pagination-filtering-sorting.md)
11. [Audit Logs](./11-audit-logs.md)
12. [File Uploads (Multer + Cloudinary)](./12-file-uploads.md)
13. [Swagger / OpenAPI Docs](./13-swagger-api-docs.md)

## Frontend Chapters

0. [Angular Project Initialization](./frontend-00-project-initialization.md)

## Backend Stack

Node.js · Express · JavaScript (ES Modules) · PostgreSQL · Prisma · JWT +
Refresh Tokens · RBAC · Cloudinary · Multer · Docker · Swagger · Winston ·
Morgan · Helmet · Zod

## Frontend Stack

Angular 21 (standalone) · TypeScript (strict) · Signals · Angular
Material · Tailwind CSS · RxJS · ESLint (`@angular-eslint`) · Prettier ·
Vitest

## Backend Architecture

Clean Architecture + Feature-First organization:

```
HTTP Request → Route → Controller (thin) → Service (business logic)
             → Repository (DB access) → Prisma → PostgreSQL
```

## Frontend Architecture

Layered + Feature-First — see
[`docs/frontend-architecture-blueprint.md`](../docs/frontend-architecture-blueprint.md)
for the full architecture constitution and
[`frontend/CLAUDE.md`](../frontend/CLAUDE.md) for the 8-phase feature
workflow every frontend chapter follows.

See each chapter's own Architecture section for how that feature slots
into its side's pipeline.
