---
Domain: Training
Status: Implemented (2026-09-16)
Date: 2026-07-28
Depends on: docs/domain-identity-employee-lifecycle.md, docs/domain-attendance.md (precedent only)
---

# Domain Sign-off: Training

## 1. Domain Overview

Training tracks **what learning programs exist and which employees have completed them** — course/program catalog plus per-employee enrollment and completion history, including compliance-training renewal.

**Business problem this domain solves:** organizations need to track skill-development participation and, in particular, mandatory/compliance training completion (e.g., annual safety or security-awareness training) — without this domain, that tracking either doesn't happen in-system or is bolted awkwardly onto Employee records.

**Why no other domain can own it:** Performance evaluates *how well* someone works, not *what they've learned*; the two are related in the real world but not the same concept, and conflating them would force Performance's simple rating model to carry unrelated structure. Designation could in principle target which trainings are required for a role, but building that targeting logic is deliberately deferred (§6) — Training must stand on its own without depending on a targeting engine that doesn't exist yet.

## 2. Business Lifecycle

- **TrainingProgram creation:** `ADMIN`/HR creates a named program (e.g., "Annual Security Awareness"), optionally marked `mandatory`. Same status-lifecycle shape as Branch/Department/Designation: `ACTIVE | INACTIVE`, hard-delete only if unreferenced.
- **Enrollment — repeatable, not single-current-value.** Unlike Branch/Department/Designation/Shift (where an Employee holds one current value), an employee can enroll in the *same* TrainingProgram multiple times over their tenure — retaking after a failed attempt, or renewing an annually-required compliance course. **Each enrollment attempt is its own historical record**, not an overwritten current value. This places Training alongside Attendance/Leave/Payroll/Performance as a transactional/historical domain, not a master-data-with-current-value domain like the axes designed earlier in this review.
- **Enrollment workflow:** `Enrolled → In Progress → Completed | Failed | Withdrawn`.
- **Who performs:** `ADMIN`/HR assigns enrollments (or an employee self-enrolls in optional, non-mandatory programs — a lighter-weight action than any approval-gated workflow designed so far, since training enrollment carries no compliance risk in either direction the way Leave or Payroll do).
- **Who consumes:** compliance reporting (is this employee currently compliant with mandatory training X) — computed, not stored (§3).

## 3. Relationships

**Enrollment → Employee: mandatory FK, many enrollments per employee per program allowed (§2).**

**Enrollment → TrainingProgram: mandatory FK**, must reference an `ACTIVE` program at enrollment time (positive-allowlist, consistent with every prior domain).

**Compliance status is computed, not stored — reusing Attendance's ADR-AT03 pattern.** For a mandatory/compliance TrainingProgram with a renewal period (e.g., annual), "is this employee currently compliant" is determined by finding the employee's most recent `Completed` enrollment for that program and checking whether its completion date plus the renewal period is still in the future. This is **computed on read**, exactly like Attendance's effective daily status, rather than maintained as a separately-stored boolean that could silently go stale relative to the enrollment history it's derived from — the same reasoning (a derived value should not duplicate the facts it's derived from) applies here for the same reason it applied there.

**No automated targeting from Designation/Department.** A TrainingProgram is not automatically assigned based on an employee's Designation or Department — enrollment is always an explicit action (§2). Building a rules engine that auto-enrolls employees based on role/department is a real, common HRMS feature but is deferred (§6) as unverified scope.

**No enforcement coupling to Payroll or Performance.** Failing to complete mandatory training does not block a payroll run or automatically affect a performance rating — Training remains purely a tracking domain; any future compliance-enforcement linkage is an explicit, separate future decision, not built now.

## 4. Business Rules

**Mandatory invariants:**
- A TrainingProgram can never be hard-deleted while any Enrollment references it.
- Compliance status for a given employee/program is always computed from the enrollment history, never stored as an independently-maintained flag.

**Recommended practices:**
- Keep `TrainingProgram` minimal: name, description, `mandatory` flag, optional `renewalPeriod` (for compliance courses), status. Resist adding cost/budget tracking, external-provider integration fields, or skill/competency tagging — none verified as required.
- Keep `Enrollment` minimal: status, completedAt, optional score/certificate reference (reusing the same generic document-storage pattern as `EmployeeDocument`/Recruitment's Candidate resumes, rather than inventing a new certificate-file mechanism).

## 5. Architecture

- **Aggregates:** `TrainingProgram` (master data), `Enrollment` (per-attempt historical record).
- **Ownership:** Enrollment references Employee and TrainingProgram by ID; no embedding.
- **Repository/service responsibilities:** a Training service handles enrollment-workflow transitions and provides the single reusable "is employee X currently compliant with program Y" computed query — reusing the same "expose one shared computed-status query rather than let every consumer reimplement it" principle already established for Holiday Calendar's resolution query (ADR-HC04) and Attendance's coordinating service.
- **Cross-domain interaction:** synchronous read of Employee only (existence); no reads from or writes to Designation/Department (no targeting engine, §3) or Payroll/Performance (no enforcement coupling, §3).
- **What belongs inside Training:** program catalog, enrollment history, computed compliance status.
- **What does NOT belong inside Training:** role/department-based auto-targeting, compliance-enforcement actions in other domains, external LMS/provider integration.

## 6. Future Proofing

- **What could break this design:** a verified requirement for automated training assignment based on Designation/Department would need a targeting-rules concept — additive on top of today's explicit-enrollment model (existing enrollments and history remain valid; targeting would only affect how *future* enrollments get created). A verified requirement for compliance-enforcement (e.g., blocking payroll for non-compliant employees) would introduce a new cross-domain dependency *from* Payroll *into* Training — not built now, and Payroll's own sign-off does not anticipate it either (consistent absence, not an oversight).
- **Design now vs. defer:** design now — TrainingProgram/Enrollment, repeatable-enrollment history, computed compliance status. Defer — auto-targeting, compliance-enforcement coupling, external LMS integration, cost/budget tracking, notifications/renewal reminders (no notification infrastructure exists anywhere in this codebase today — verified absence, not a gap specific to Training).
- **Trade-off accepted:** compliance tracking is passive (visible on query) rather than proactive (no automated reminder when a renewal is approaching); acceptable given no notification infrastructure exists to build on top of yet.

## 7. Challenge the Design

**Self-critique — is passive, query-only compliance tracking actually useful without proactive reminders?** Less useful than a full solution, but still strictly better than not tracking it at all, and it is the correct scope given that no notification system exists anywhere in this project to build reminders on top of — building one notification mechanism just for Training would be solving a much bigger, project-wide gap through the lens of one domain, which is out of proportion to this document's scope.

**Alternative considered and rejected — single-current-enrollment-per-program model (like Branch/Department's single-current-value pattern).** Rejected explicitly (§2): unlike a branch or department assignment, retaking or renewing training is normal and expected, so history must be preserved as multiple records, not overwritten — this is a case where copying the earlier axes' pattern would have been wrong, and the deliberate divergence is stated rather than glossed over.

**Alternative considered and rejected — storing compliance status as a maintained boolean/date field, updated whenever an enrollment completes.** Rejected: identical reasoning to Attendance's ADR-AT03 — a derived value stored redundantly can drift from the facts (e.g., if a completion record is later corrected or a renewal period changes), whereas computing it on read from the enrollment history is always consistent by construction.

**Recommendation stands:** TrainingProgram/Enrollment with repeatable history, computed (not stored) compliance status, no auto-targeting or enforcement coupling.

## 8. Open Questions

1. Should a future compliance-enforcement linkage to Payroll or Performance ever be built? Explicitly not decided — a future dependency, not a current one.
2. ~~Permission scoping — same unresolved pattern as prior domains; here, likely `ADMIN`/HR for mandatory-program enrollment, with self-enrollment permitted for optional programs.~~ **Resolved (2026-09-16)** — implemented exactly as this document's own suggested default; see ADR-TR04.

## 9. Deferred Decisions

| Decision | Reason for Deferral |
|---|---|
| Auto-targeting of training by Designation/Department | No verified requirement; additive on top of explicit enrollment. |
| Compliance-enforcement coupling to Payroll/Performance | No verified requirement; would introduce new cross-domain dependencies not currently justified. |
| Renewal reminder notifications | No notification infrastructure exists anywhere in this project yet. |
| External LMS/provider integration, cost/budget tracking | No verified requirement. |

## 10. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Passive compliance tracking without reminders may lead to missed renewals | Low | Medium | Accepted trade-off (§6/§7); additive once notification infrastructure exists project-wide. |
| No auto-targeting means mandatory training could be under-assigned by human oversight | Low | Medium | Accepted; explicit enrollment is a deliberate, simple starting model (§7). |

## 11. Assumptions

- Assumed (industry practice) that most training tracking needs are satisfied by explicit enrollment plus computed compliance status, without a targeting engine or enforcement coupling — a reasonable v1 scope, not a verified constraint against adding either later.

## 12. Impact on Future Domains

Any future domain must never violate:
1. Enrollment history is append-only per attempt — never overwritten as a single current value.
2. Compliance status is always computed from enrollment history, never independently stored.
3. Training does not read from or enforce anything in Payroll or Performance unless a future, explicitly-designed dependency decides otherwise.

This domain has no direct downstream dependents remaining in the approved design order other than the general reporting/compliance concerns already named above.

## Architecture Decision Records

**ADR-TR01 — TrainingProgram/Enrollment as Distinct Aggregates, Repeatable Enrollment**
Status: Accepted; **Implemented** (2026-09-16)
Summary: Deliberately diverges from the single-current-value pattern used by Branch/Department/Designation/Shift, since retaking/renewing training is normal.
Implementation notes: `Enrollment.status` (`ENROLLED→IN_PROGRESS→COMPLETED|FAILED`, `WITHDRAWN` from either non-terminal stage) is a guarded state machine, the same strictly-sequential-forward-stages convention as every other workflow aggregate in this review — a judgment call on the doc's own diagram, flagged, since it doesn't fully specify whether `WITHDRAWN` branches only off `IN_PROGRESS` or off `ENROLLED` too (implemented as reachable from either, the more realistic reading). No unique constraint on `(employeeId, trainingProgramId)`, confirming repeatability at the schema level.

**ADR-TR02 — Compliance Status Computed on Read**
Status: Accepted; **Implemented** (2026-09-16)
Summary: Reuses the Attendance ADR-AT03 principle: derived values are computed from source facts, never redundantly stored.
Implementation notes: `enrollmentService.getComplianceStatus(employeeId, trainingProgramId)` finds the most recent `COMPLETED` enrollment and checks `completedAt + renewalPeriodDays` against now; absent `renewalPeriodDays` means compliant indefinitely once completed once. A bulk variant, `getComplianceReport`, composes this across every mandatory `ACTIVE` program for one employee — the minimal shape §2's "who consumes: compliance reporting" implies, exposed via `GET /training-compliance`.

**ADR-TR03 — No Auto-Targeting, No Enforcement Coupling**
Status: Accepted; Implemented (2026-09-16) by omission
Summary: Explicit enrollment only; no automated assignment by role/department, no blocking effect on Payroll/Performance.
Implementation notes: no code anywhere in Training reads from Designation/Department for targeting purposes, or writes to/reads from Payroll/Performance — confirmed by construction, not by a negative test.

**ADR-TR04 — Permission Scoping**
Status: Accepted; Implemented (2026-09-16)
Summary: `TrainingProgram` follows the `ADMIN`-only-mutation master-data pattern (read for all roles). `Enrollment` splits authoring (`create:own` self-enrollment on non-mandatory programs only, enforced as a hard service-layer rule per §2's wording; `create:any` for ADMIN/HR enrolling anyone in anything), visibility (`read:own`/`read:any`, the same auto-scoped-list pattern `GET /leave-requests` established), lifecycle management (`manage:any` — the only path to `IN_PROGRESS`/`COMPLETED`/`FAILED`, since self-attested completion would undermine compliance tracking's whole point), and self-service withdrawal (`withdraw:own`, an employee can call off their own enrollment but nothing more). 10 new permissions (78 → 88 total). Deliberately **no `MANAGER` reports-visibility** — unlike Leave/Performance, §2's "who performs" never mentions managers, only `ADMIN`/HR and self-enrollment; not invented with no textual basis. `Enrollment.delete` (`manage:any`, unrestricted by status) mirrors Attendance's own unrestricted-delete precedent, since this is compliance data that sometimes needs outright correction, not just a workflow-transition-only model.

## Final Sign-off

**Implementation readiness:** Implemented (2026-09-16). Structurally complete and live-verified end-to-end (program creation, self-enrollment on an optional program, the mandatory-program self-enroll rejection, ADMIN-driven enrollment/progression/completion, the employee blocked from self-completing, self-withdrawal, the computed compliance calculation in both single-program and bulk-report shapes, and cross-employee visibility correctly blocked).

**Confidence score: 92%**

**Remaining blockers:** None. Open Question #1 (future compliance-enforcement linkage to Payroll/Performance) remains a genuine future dependency, not a current blocker, exactly as originally assessed.

**Recommended next domain:** Asset Management — the last master-data-adjacent domain before Exit Management closes the loop back to Identity's offboarding.
