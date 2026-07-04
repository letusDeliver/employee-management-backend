# Backend Engineering Handbook

Internal engineering handbook for the Employee Management App backend —
doubles as senior backend interview preparation material. One chapter is
written per completed feature, in build order, immediately after that
feature ships.

## Overview

- [Progress Summary & Interview Prep (Features 1–7)](./00-progress-summary-and-interview-prep.md) — cumulative recap, every real bug/surprise found, and a consolidated interview Q&A sheet. Updated periodically, not after every single feature.
- [API Endpoints Handbook](./API_ENDPOINTS.md) — a living, implementation-accurate reference for every endpoint (headers, validation, every status code, Postman/cURL examples, security/negative testing, request lifecycle). Updated after every feature that touches an endpoint — see `CLAUDE.md` Rule 17.

## Chapters

1. [Project Setup & Folder Structure](./01-project-setup-and-folder-structure.md)
2. [Express App Bootstrap](./02-express-app-bootstrap.md)
3. [PostgreSQL + Prisma Setup](./03-postgresql-prisma-setup.md)
4. [Environment Config & Validation (Zod)](./04-environment-config-validation.md)
5. [Logging (Winston)](./05-logging-winston.md)
6. [User Model & Auth (Register/Login)](./06-user-model-auth.md)
7. [JWT Access + Refresh Tokens](./07-jwt-access-refresh-tokens.md)
8. [RBAC (Roles & Permissions)](./08-rbac.md)

## Stack

Node.js · Express · JavaScript (ES Modules) · PostgreSQL · Prisma · JWT +
Refresh Tokens · RBAC · Cloudinary · Multer · Docker · Swagger · Winston ·
Morgan · Helmet · Zod

## Architecture

Clean Architecture + Feature-First organization:

```
HTTP Request → Route → Controller (thin) → Service (business logic)
             → Repository (DB access) → Prisma → PostgreSQL
```

See each chapter's Architecture section for how that feature slots into
this pipeline.
