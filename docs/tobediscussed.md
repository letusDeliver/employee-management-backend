# To Be Discussed: Employee ↔ User Architecture Review

Status: **Paused after Phase 1.** Parked by explicit user request to switch topics. Resume by picking up Phase 2 below.

This is a formal, staff-engineer-style architecture review of the Employee/User domain, structured into 7 phases. Rules and progress are captured here so the session can resume later without re-deriving anything already covered.

## Standing discussion rules (apply to every phase)

- Architecture review, not a coding session — think like a Staff Engineer, prioritize business reasoning over implementation detail.
- Use codebase evidence for every conclusion; explicitly flag anything uncertain/unverifiable rather than guessing.
- Distinguish **verified fact** / **reasonable inference** / **opinion** explicitly in answers.
- Challenge assumptions, including the user's own — do not optimize for agreement.
- **No code or implementation until Phase 6, and even then only after explicit approval.** Nothing gets implemented unless the user explicitly asks.
- In Phase 7, evaluate any user-proposed enhancement against this 11-point checklist: (1) problem it solves, (2) real business vs. only technical problem, (3) simplifies or complicates the architecture, (4) modules affected, (5) DB changes required, (6) API changes needed, (7) backward compatibility impact, (8) existing-data migration approach, (9) new edge cases introduced, (10) simpler alternatives, (11) recommend or not, and why.

## Phase outline

1. **Domain Understanding** — What is a User? What is an Employee? Why do both exist? Exclusive responsibilities of each? Why not one entity? Architectural benefit of the separation? — ✅ **Answered, see below.**
2. **Lifecycle Discussion** — Creation flows for each, why separated, who's responsible, can one exist without the other, deletion/unlink behavior, business scenarios behind these decisions. — ⏳ Not started.
3. **Relationship Analysis** — Why optional, why not 1:1, why Employee owns the FK, constraints, edge cases, rehire/onboarding/offboarding behavior, the *why* not just the *how*. — ⏳ Not started.
4. **Business Workflows** — Role of User vs. Employee in Auth, AuthZ/RBAC, Employee Management, User Management, HR workflows, Reporting, Documents, Audit Logs, Notifications — who owns what and could it live elsewhere. — ⏳ Not started.
5. **Architecture Review** — Strengths, trade-offs, coupling, hidden dependencies, tech debt, scalability/maintainability concerns. No changes proposed yet. — ⏳ Not started (largely pre-covered in the earlier Stage-A "Parts 1-5" pass — see Prior Context below).
6. **Enhancement Brainstorm** — For each enhancement: business problem, architectural fit, impacted modules, DB/API/frontend changes, migration, backward compatibility, risks, alternatives, recommendation. Discussion only, no implementation. — ⏳ Not started.
7. **Cross-Question & Design Review** — User challenges the design; defend/critique using the 11-point checklist per proposal. — ⏳ Not started.

---

## Phase 1 — Domain Understanding (answered)

**What is a User?** Verified fact: `User` (`backend/prisma/schema.prisma:9-30`) is the auth/authorization identity — `email`, hashed `password`, `tokensValidAfter` (session invalidation marker), profile-picture fields, relations to `RefreshToken`, `UserRole`, `AuditLog`.

**What is an Employee?** Verified fact: `Employee` (`backend/prisma/schema.prisma:85-110`) is the HR record — `department`, `jobTitle`, `salary`, `dateOfJoining`, `managerId` (self-relation), `deletedAt` (soft delete). Data *about* employment, not a credential.

**Why both exist / business purpose.** Verified fact: `Employee.userId` is nullable and deliberately non-unique (`schema.prisma:101-107`); `register()` (`auth.service.js:37-62`) creates only a `User`, never an `Employee`. Inference (not documented anywhere as a stated rationale): "can authenticate" and "is a tracked HR employee" are independent facts about a person because they genuinely are in a real org — a login can exist before HR onboarding finishes, and an HR record can predate (or never get) an account.

**Responsibilities exclusive to User.** Verified: credentials, `RefreshToken`, `UserRole`/permission resolution, `tokensValidAfter`, profile picture. Nothing HR-shaped touches `user.repository.js` / `auth.service.js`.

**Responsibilities exclusive to Employee.** Verified: `department`/`jobTitle`/`salary`/`dateOfJoining`/`managerId`/`deletedAt`/`documents`. Nothing auth-shaped touches `employee.repository.js`.

**Why not one entity.** No design doc/commit exists arguing this explicitly — flagged as unverifiable as a historical reason. What *is* verifiable: merging would conflict with the current registration flow, since `Employee`'s core fields (`department`, `jobTitle`, `salary`, `dateOfJoining`) are all **required** at creation (`employee.validation.js:8-28`), and `register()` produces a bare `User` with no HR data at all. Merging would force either nullable HR columns (weakening guarantees for records that do have HR data) or blocking registration until HR data exists (contradicting the observed self-service flow). Opinion: this is a coherent justification for the design as it stands, not a confirmed historical motive.

**Architectural benefit of the separation.** Verified: independent permission scoping (`user:list` is ADMIN-only; `employee:*` is ADMIN+MANAGER — `prisma/seed.js:56-62`), independent lifecycle (User has no delete path at all; Employee has full soft-delete + audit trail), independent schema evolution (Employee can grow HR-specific columns without touching the auth-critical User table).

**Flagged for Phase 2:** `Employee`'s required-at-creation fields mean there is no "draft"/"pending onboarding" state — relevant once we discuss lifecycle.

---

## Prior context already covered (Stage A, pre-Phase-1 pass)

Before this 7-phase structure was adopted, an earlier less formal pass already covered equivalent ground in 5 parts — Domain Understanding, Creation Flow (full UI→Service→API→DB trace for both entities), Relationship Analysis (cardinality/FK/ownership/sync), Usage Throughout the Application (auth, authz, reporting, audit, notifications), and Architecture Review (strengths/weaknesses/hidden coupling/simplification opportunities). That pass ended with four candidate enhancement ideas floated for the (then-upcoming) brainstorm phase:

1. A user-search/picker UI for linking Employee↔User (replacing the current plain-UUID-paste inputs in `employee-form.component.ts`).
2. A User deletion/offboarding flow (none exists today — verified, no delete method on `user.repository.js`/`user.service.js`/`user.routes.js`).
3. Denormalizing minimal linked-user info onto the Employee API response, to remove the `UserDirectoryService` enrichment dependency.
4. Unifying `EmployeeStore` onto the shared `list-query-state.util.ts` pattern.

These four are candidates to revisit once Phase 6 is reached — not yet evaluated against the 11-point checklist.

## Key supporting evidence on file (for fast resume, no re-research needed)

- `backend/prisma/schema.prisma` — `User` (9-30), `Employee` (85-110, incl. the partial-unique-index comment at 101-107), `EmployeeDocument`, `AuditLog`, `RefreshToken`, `Role`/`Permission`/`UserRole`/`RolePermission`.
- `backend/src/modules/auth/auth.service.js` — `register()` (37-62): duplicate-email check, bcrypt hash, one transaction creating `User` + default `EMPLOYEE` role.
- `backend/src/modules/employees/employee.service.js` — `createEmployee()` (41-80), `getEmployeeById()` ownership check for `:own` scope (82-96), `rethrowForeignKeyViolationAsBadRequest` (30-38).
- `backend/src/modules/employees/employee.validation.js` — `createEmployeeSchema` (8-28, all core fields required), `updateEmployeeSchema` (30-41, `userId`/`managerId` nullable+optional to distinguish "leave as-is" vs "clear").
- `backend/src/modules/employees/employee.repository.js` — never `include`s the `user` relation; responses only ever carry `userId` as a string.
- `backend/src/modules/employees/employee.controller.js` / `employee.routes.js` — permission gating (`employee:create`, `employee:read:any`/`:own`, `employee:update:any`, `employee:delete:any`); list is `:any`-only.
- `backend/src/modules/rbac/rbac.repository.js` — RBAC entirely `User`/`Role`-rooted, no `Employee` involvement.
- `backend/src/modules/users/user.repository.js`, `user.service.js`, `user.controller.js`, `user.routes.js` — confirmed only 3 routes exist (`GET /`, `POST /me/profile-picture`, `DELETE /me/profile-picture`); no create/update(general)/delete-user capability anywhere.
- `backend/prisma/seed.js` — permission set and `ROLE_PERMISSIONS` map (ADMIN/MANAGER/EMPLOYEE).
- `frontend/src/app/core/users/user-directory.service.ts` — `UserDirectoryService`, cached `GET /users?limit=100`, `resolveDisplayName()`, never fabricates data; doc comment states `features/employees` must never import `features/users` directly.
- `frontend/src/app/features/employees/data-access/employee.model.ts`, `employee.mapper.ts` — `userId`/`managerId` handling, omit-vs-null semantics, local-date-parts `dateOfJoining` handling.
- `frontend/src/app/features/employees/employee-list/employee-table.component.ts` — "Employee" column resolves name via `UserDirectoryService`, fire-and-forget `ensureLoaded()`, errors swallowed deliberately.
- `frontend/src/app/features/employees/employee-form/employee-form.component.ts` — `userId`/`managerId` are plain UUID text inputs, `selfManagedValidator` mirrors backend's `assertNotSelfManaged`.

## Resume instructions

Next session: re-read this file, then continue directly with **Phase 2 — Lifecycle Discussion**, same rules, same evidence-first style. No new tool calls should be needed to answer Phase 2 — the creation-flow evidence for both entities was already gathered in the Stage-A pass referenced above.
