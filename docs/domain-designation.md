---
Domain: Designation
Status: Implemented (2026-09-13)
Date: 2026-07-27
Depends on: docs/domain-identity-employee-lifecycle.md, docs/domain-branch.md, docs/domain-department.md
---

# Domain Sign-off: Designation

## 1. Domain Overview

Designation is the **job title** classification of an Employee — "what role does this person hold" (Software Engineer, Sales Manager, HR Business Partner), independent of which function (Department) or location (Branch) they sit in.

**Verified fact:** today, `Employee.jobTitle` (`prisma/schema.prisma:90`) is a plain required `String`, exactly as free-text and ungoverned as `department` was before this review — same typo/duplication/no-rename-propagation problem, same missing single source of truth.

**Business problem this domain solves:** identical in shape to Department's problem — job titles must be a governed, canonical catalog so reporting ("how many Software Engineers do we have"), org-chart display, and any future title-driven logic (e.g., approval routing by seniority) can rely on stable values instead of free text.

**Why no other domain can own it:** Employee references a title but should not define the catalog of valid titles (same reasoning as Department). Department cannot own it: a title is not inherently a property of a department (see §3 for the explicit orthogonality decision made here). Branch cannot own it — location has no bearing on title. Grade/Band (an explicitly deferred domain, not designed in this review — see [[domain-branch]]'s Phase 1 note) is related but distinct: Designation is the *label* for a role, Grade/Band would be a compensation-banding classification that could, in a future design, reference Designation — that direction of dependency is not built today.

## 2. Business Lifecycle

- **Creation:** `ADMIN` creates a new Designation (title, optional code).
- **Update:** rename (typo correction, standardization) — same governance value as Department's rename.
- **Archive:** `status: ACTIVE | INACTIVE`, mirroring Branch/Department (ADR-B04/ADR-D04 precedent).
- **Deletion:** hard delete permitted only when zero Employee references exist.
- **Who performs:** `ADMIN` (consistent with Branch/Department; see §5 for the open question of whether this should extend to `MANAGER`).
- **Who approves:** no approval workflow exists in this codebase; direct ADMIN action, consistent with Branch/Department.
- **Who consumes:** Employee domain (FK reference), future Recruitment domain (job requisitions will reference a Designation for the role being hired), future Performance domain (title-based review templates, not decided here).

## 3. Relationships

**Designation is a third independent, orthogonal axis — not scoped to Department.** This is the central relationship decision for this domain, and it deliberately extends the same orthogonality principle already established between Branch and Department (ADR-B02) one level further.

**Reasoning:** the alternative — scoping each Designation to a single Department (`Designation.departmentId`) — was considered and rejected. A title like "Manager" or "Business Analyst" legitimately recurs across multiple departments (a Finance Manager and a Sales Manager are both "Manager" plus a department, not two unrelated titles). Scoping titles per-department would force duplicate title rows per department (`"Manager (Finance)"`, `"Manager (Sales)"`) or require a Department–Designation valid-combination mapping — and a valid-combination mapping between two master-data axes was already explicitly deferred for Branch↔Department (see [[domain-branch]] §6 Deferred Decisions); introducing it here for Department↔Designation would contradict that same YAGNI reasoning without a new verified requirement forcing it.

**Relationship to Employee — Single Current Value, No History**, mandatory FK. Same reasoning and same divergence-from-Branch pattern as Department (ADR-D07): `jobTitle` is currently a required `String`, so `Employee.designationId` is mandatory, not nullable.

**Relationship to the (not-yet-designed) Grade/Band domain** — explicitly out of scope here. If Grade/Band is ever designed, it may reference Designation (e.g., "Software Engineer" maps to a band range), but Designation must not be designed to depend on Grade/Band, since Grade/Band's own necessity was flagged in Phase 1 as possibly worth deferring entirely. Designation must stand on its own without it.

**Relationship to Branch and Department — none.** All three (Branch, Department, Designation) are independent, orthogonal classification axes on Employee. No axis nests or owns another.

## 4. Business Rules

**Mandatory invariants:**
- Designation `name`/title must be non-empty (trimmed) and unique (case-insensitive) among non-archived designations.
- A Designation can never be hard-deleted while any Employee references it.
- Deactivating a Designation never alters existing `Employee.designationId` references.
- `designationId` is mandatory on Employee creation, consistent with the current schema's required `jobTitle`.

**Recommended practices:**
- Inactive Designations are not assignable to new employees or as a transfer/promotion target; existing assignments remain valid (positive allowlist, same as Branch/Department).
- Keep the aggregate to identity fields only (`name`, `code`, `status`) — resist adding `seniorityLevel`, `salaryBand`, or `department scoping` fields; those belong to Grade/Band or a future Department-linkage decision, neither of which is justified by a verified requirement today.
- Designation `code` (e.g., `SWE`, `SM`) is recommended for future integration/export use, not mandatory.

**Scalability concerns:** similar to Department — expected to be a small, slow-changing catalog (tens to low hundreds of rows), low pagination risk.

## 5. Architecture

- **Aggregate boundaries:** Designation owns only its own identity fields — no embedded Employee list, no Department linkage, no Grade/Band linkage.
- **Ownership:** Employee owns the `designationId` FK, mirroring `departmentId`/`branchId`/`managerId`.
- **Repository responsibilities:** Designation repository handles only Designation's own persistence (create, rename, activate/deactivate, existence/status lookup); it never performs Employee-shaped queries.
- **Domain service responsibilities:** validate name uniqueness on create/rename; enforce hard-delete-only-if-unreferenced; enforce positive-allowlist assignability.
- **Cross-domain interaction:** synchronous direct read, identical pattern to Branch (ADR-B06) and Department (ADR-D06) — Employee-side assignment performs an existence+status check against the Designation repository.
- **What belongs inside Designation:** title text, optional code, status.
- **What does NOT belong inside Designation:** department scoping, compensation/grade data, seniority ranking, reporting-line implications (already fully handled by the existing independent `Employee.managerId` self-relation).
- **Future extension points (outside the aggregate):** a future Grade/Band domain referencing Designation; a future Recruitment domain referencing Designation for job requisitions.

## 6. Future Proofing

- **What could break this design:** a verified future requirement that titles genuinely must vary by department (e.g., regulatory titles that only exist in certain functions). If that emerges, the additive path is a nullable `Designation.departmentId` or a separate valid-combination mapping table — either can be layered on without altering existing rows.
- **Design now vs. defer:** design now — orthogonality, mandatory FK, status lifecycle. Defer — Department scoping, Grade/Band linkage, seniority levels.
- **Trade-off accepted:** by not scoping titles to departments, the system cannot today prevent a nonsensical assignment (e.g., "Chief Medical Officer" title inside a "Sales" department) — this is accepted as a data-quality/process concern for the org administering the system, not a constraint the schema should enforce absent a verified requirement.

## 7. Challenge the Design

**Self-critique 1 — is orthogonality still right for a third axis, or does the reasoning weaken as more axes pile up?** Each additional orthogonal axis (Branch, Department, now Designation) increases the *unconstrained combination space* — nothing stops an absurd Branch+Department+Designation combination. Counter-argument: this is the same trade-off already accepted for Branch↔Department (see [[domain-branch]] §11), and the alternative (valid-combination mapping tables between every pair of axes) is combinatorially worse to maintain than the occasional bad-data entry, which is correctable by editing the Employee record. The trade-off does not get meaningfully worse by adding a third orthogonal axis; it would get worse if axes were pairwise cross-validated, which is exactly what's being deliberately avoided.

**Self-critique 2 — should Designation and Department be merged into one concept ("Role"), since many small organizations effectively treat them as the same thing?** Rejected: even organizations that appear to align title and department 1:1 today can diverge later (a Designation of "Manager" applies across departments the moment the org grows past its earliest structure) — merging them would require an expensive split later, whereas keeping them separate costs nothing when they happen to align.

**Alternatives considered and rejected:**
- Designation scoped per Department (`Designation.departmentId`) — rejected (§3).
- Merged Department+Designation into a single "Role" concept — rejected (self-critique 2).
- Building Grade/Band now since Designation "will need it eventually" — rejected: no verified requirement, and Phase 1 already flagged Grade/Band as possibly unnecessary; Designation's design does not require it to be useful on its own (title governance has standalone value).

**Recommendation stands:** independent, orthogonal, mandatory-FK Designation, structurally identical in treatment to Department but explicitly justified on its own terms rather than copied blindly.

## 8. Open Questions

**Resolved (2026-09-13):** Permission scoping (ADR-DS06) — `ADMIN`-only mutations, `designation:read` granted to all roles. Same resolution as Branch (ADR-B07) and Department (ADR-D08); no verified requirement emerged to diverge.

## 9. Deferred Decisions

| Decision | Reason for Deferral |
|---|---|
| Department-scoped Designations / valid-combination mapping | No verified requirement; additive path exists if ever needed. |
| Grade/Band linkage | Grade/Band itself is not yet designed and was flagged in Phase 1 as possibly unnecessary. |
| Seniority/ranking on Designation | No verified requirement; would need its own business rules (e.g., promotion ordering) not yet justified. |
| Designation-driven approval routing (e.g., title implies signing authority) | Belongs to a future workflow/approvals capability, not this domain. |

## 10. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Permission scoping left open (ADR-DS06) | Medium | Medium | Resolve before or at implementation start, same as Branch/Department. |
| No schema-level guard against nonsensical Branch+Department+Designation combinations | Low | Low | Accepted trade-off (§7); correctable at the data level. |
| Designation and Department drift into perceived redundancy for small orgs, causing confusion | Low | Low | Documented distinction here; naming/UI copy should reinforce "title" vs. "function" framing when implemented. |

## 11. Assumptions

- Assumed (industry practice) that most organizations maintain title catalogs independent of department structure — consistent with common HRIS practice (Workday "Business Title" vs. "Cost Center/Supervisory Organization" are independent fields).
- ~~Assumed that `Employee.jobTitle` will be migrated to `Employee.designationId` via the same backfill-one-row-per-distinct-string approach described for Department~~ — **confirmed in implementation**: the same expand→backfill→contract sequence ran against live dev data (30 Employee rows, 17 distinct free-text `jobTitle` values, including junk data like `"sderwf"` and `"B"`), with a hard zero-null assertion gate before the contract migration. Zero data loss.

## 12. Impact on Future Domains

Any future domain must never violate:
1. Designation remains orthogonal to Branch and Department — no nesting, no mandatory cross-axis validation.
2. `Employee.designationId` is single-value, current-only, and mandatory.
3. Designation is never hard-deleted while referenced.
4. Designation assignability is always a positive allowlist.
5. Designation carries no embedded Grade/Band, seniority, or department-scoping data unless a future domain's design explicitly justifies it via additive migration.

This most directly constrains a future **Grade/Band** domain (if ever built — it would reference Designation, not the reverse) and the future **Recruitment** domain (job requisitions will reference Designation for the role being hired).

## Architecture Decision Records

**ADR-DS01 — Designation as a First-Class Domain**
Status: Accepted
Summary: Promote `Employee.jobTitle` from free-text `String` to a governed `Designation` aggregate.

**ADR-DS02 — Designation Orthogonal to Department and Branch**
Status: Accepted
Summary: Designation is a third independent classification axis; no department-scoping, no valid-combination mapping.

**ADR-DS03 — Single Current designationId, No History**
Status: Accepted
Summary: No title-change history model now; deferred to a future additive model if ever needed.

**ADR-DS04 — Status Field, Not deletedAt**
Status: Accepted
Summary: Designation lifecycle uses `status: ACTIVE | INACTIVE`.

**ADR-DS05 — Positive Allowlist Assignability**
Status: Accepted
Summary: Designation assignability is always checked as `status === ACTIVE`.

**ADR-DS06 — Permission Scoping**
Status: Accepted; Implemented (2026-09-13)
Summary: `ADMIN`-only mutations, `designation:read` granted to every role — same resolution as Branch (ADR-B07) and Department (ADR-D08).

**ADR-DS07 — designationId Mandatory (Not Nullable)**
Status: Accepted
Summary: Mandatory FK, preserving current schema's non-nullable `jobTitle` semantics.

## Final Sign-off

**Implementation readiness:** Implemented (2026-09-13). All ADRs resolved.

**Confidence score: 91%** (was 86% pre-implementation; raised on the same basis as Department's post-implementation revision — the mandatory-FK migration proved out cleanly against real, messy live data, and permission scoping resolved without surprises).

**Remaining blockers:** None.

**Recommended next domain:** Employment Type — a smaller, simpler master-data domain (Full-Time / Part-Time / Contract / Intern) that determines eligibility rules for later domains (Leave accrual, Payroll calculation basis).
