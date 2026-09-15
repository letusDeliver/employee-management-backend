---
Domain: Performance
Status: FINAL — Implemented (2026-09-15)
Date: 2026-07-27
Depends on: docs/domain-identity-employee-lifecycle.md, docs/domain-department.md, docs/domain-designation.md, docs/domain-branch.md
---

# Domain Sign-off: Performance

## 1. Domain Overview

Performance manages **periodic evaluation of an employee's work** — review cycles, ratings, and manager/self commentary — producing a permanent record of how an employee was assessed at a point in time.

**Business problem this domain solves:** organizations need a governed process for periodic performance evaluation (e.g., half-yearly or annual review cycles), distinct from the day-to-day facts Attendance records or the compensation Payroll calculates. Without this domain, evaluation would either not happen systematically or be tracked outside the system entirely.

**Why no other domain can own it:** Payroll deliberately does not consume or produce performance ratings (§9 of [[domain-payroll]] scopes Payroll to salary/attendance/leave-driven calculation only) — a future performance-linked compensation feature may one day read from this domain, but that dependency runs *from* a future domain *into* Performance, not the reverse, and is not built now (see §6). Identity/Employee Lifecycle owns the employment relationship itself but not its periodic evaluation — evaluation is a distinct recurring business process, not a lifecycle event like onboarding/offboarding.

## 2. Business Lifecycle

- **ReviewCycle creation:** `ADMIN`/HR defines a cycle window (e.g., "H1 2026 Review," start/end dates) — master data, same status-lifecycle shape as Branch/Department (`ACTIVE`/`INACTIVE`... here more naturally `OPEN`/`CLOSED`, but structurally identical).
- **PerformanceReview creation:** one review per `(employeeId, reviewCycleId)`, moving through **Draft → Submitted → Acknowledged**. The employee's direct manager (`Employee.managerId`, reused from Identity — same actor as Leave's approver) authors the manager assessment; the employee may optionally provide a self-assessment within the same review.
- **Acknowledgement and the immutability rule — a lighter-weight echo of Payroll's finalization rule.** Once an employee acknowledges a submitted review, it becomes a historical record; further comments are added as an **addendum**, not an edit to the acknowledged content, mirroring Payroll's "adjustment entry, never edit history" principle (ADR-PR01) — at a lower stakes level appropriate to this domain (a review is a personnel record, not a financial one, so this is a recommended practice here rather than as hard-enforced an invariant as Payroll's).
- **Who consumes:** the employee (views their own review history), potentially a future compensation-review process (not built — see §6).

## 3. Relationships

**PerformanceReview → Employee (subject) and Employee (reviewer, via `managerId`): both mandatory FKs.** Reuses the existing manager relationship rather than inventing a new "reviewer" concept — consistent with how Leave reused the same relationship for approval.

**PerformanceReview → ReviewCycle: mandatory FK.** Uniqueness: one review per employee per cycle.

**Snapshotting department/designation/branch names — recommended, not mandatory, here.** Following the same reasoning established in Payroll (ADR-PR02) — Department, Designation, and Branch each deliberately keep no assignment history (ADR-D03/ADR-DS03/ADR-B03) — a PerformanceReview conducted in March referencing "Engineering / Software Engineer / Bangalore" should still show that context even if the employee transfers departments in April. **Distinction from Payroll:** for Payroll this snapshotting is a mandatory invariant because a financial record silently changing is a compliance-grade defect; for Performance, it is a strongly recommended practice because getting it wrong produces a confusing but not financially consequential record. The same underlying architectural insight applies at a lower enforcement stakes.

**No relationship to Attendance, Leave, or Payroll.** A performance rating is not computed from attendance/leave data in this design — no verified requirement ties them together, and conflating "did they show up" with "how well did they perform" would be a significant, unrequested scope expansion.

## 4. Business Rules

**Mandatory invariants:**
- One `PerformanceReview` per `(employeeId, reviewCycleId)`.
- A `ReviewCycle` cannot be hard-deleted while any review references it.

**Recommended practices:**
- Acknowledged reviews are not edited; corrections are addenda (§2).
- Snapshot organizational context (department/designation/branch names) at submission time (§3).
- Keep the rating model simple: a single categorical or numeric rating plus free-text commentary. Resist building a full goal/OKR-tracking sub-system, competency-framework-per-Designation, or 360-degree/peer-feedback collection — none are verified requirements, and each is a materially larger feature than periodic manager/self rating.

## 5. Architecture

- **Aggregates:** `ReviewCycle` (master data), `PerformanceReview` (per-employee workflow record).
- **Ownership:** PerformanceReview references Employee (subject + reviewer) and ReviewCycle by ID; no embedding.
- **Repository/service responsibilities:** identical shape to Leave's workflow aggregate — a domain service manages the Draft→Submitted→Acknowledged transitions and performs the organizational-context snapshot at submission time.
- **Cross-domain interaction:** synchronous reads only (Employee for manager relationship and org-context snapshot); no writes to any other domain, no reads from Attendance/Leave/Payroll.
- **What belongs inside Performance:** review cycles, ratings, commentary, the snapshot.
- **What does NOT belong inside Performance:** goal/OKR tracking, compensation linkage, competency frameworks — all explicitly deferred (§6).

## 6. Future Proofing

- **What could break this design:** a verified requirement for performance-linked compensation (bonus/raise tied to rating) would introduce a new dependency *from* a future Payroll-adjacent process *into* Performance (reading ratings as an input) — additive, since Performance's own aggregate does not need to change to support being read by something else later.
- **Design now vs. defer:** design now — ReviewCycle/PerformanceReview, simple rating + commentary, org-context snapshot. Defer — goal/OKR tracking, 360-degree feedback, competency frameworks per Designation, performance-to-compensation linkage.
- **Trade-off accepted:** no structured goal-tracking within a cycle; a review's commentary is free text rather than evaluated against pre-set, trackable goals. Accepted because no verified requirement demands structured goal management, and it is a substantially larger feature to design well.

## 7. Challenge the Design

**Self-critique — is a simple rating + commentary too thin to be useful, given how much real performance-management software offers (goals, calibration, 360 feedback)?** Deliberately thin, and that is the point: this review's standing philosophy explicitly warns against building features "simply because they are common in other HRMS products." A periodic, manager-authored, employee-acknowledged rating with snapshotted context is a complete, useful, and honestly-scoped v1 — richer features are additive extensions to `PerformanceReview`, not replacements for it.

**Alternative considered and rejected — full goal/OKR sub-system built now.** Rejected: no verified requirement, materially larger scope, and the additive path (a `Goal` child entity referencing `PerformanceReview` or `ReviewCycle`) is preserved by today's minimal design.

**Alternative considered and rejected — treating acknowledgement immutability as a hard invariant identical in strength to Payroll's.** Rejected: the stakes differ (financial record vs. personnel record), and forcing identical rigidity here would add process friction (e.g., preventing a manager from fixing an obvious typo before the employee has even read it) without a corresponding benefit — the recommended-not-mandatory framing (§3) is the deliberate, calibrated choice.

**Recommendation stands:** minimal ReviewCycle/PerformanceReview, recommended (not mandatory) org-context snapshot, everything richer explicitly deferred.

## 8. Open Questions

1. Should performance ratings ever feed compensation decisions? Explicitly not decided here — a future dependency, not a current one (§6).
2. ~~Permission scoping~~ — **Resolved (2026-09-15).** Implemented almost exactly as this section anticipated: `ReviewCycle` follows the `ADMIN`-only master-data pattern; `PerformanceReview` splits into `create:reports`/`create:any` (authoring authority, mirroring Leave's manager-plus-admin-fallback shape) and `manage:reports`/`manage:any` (editing while Draft, submitting, deleting while Draft), plus `read:own`/`read:any`, `acknowledge:own`, and `selfAssess:own` for the reviewed employee's own actions (ADR-PF05).

## 9. Deferred Decisions

| Decision | Reason for Deferral |
|---|---|
| Goal/OKR tracking within a cycle | No verified requirement; materially larger feature. |
| 360-degree/peer feedback | No verified requirement. |
| Competency frameworks per Designation | No verified requirement; would couple Performance to Designation more tightly than justified today. |
| Performance-to-compensation linkage | No verified requirement; would be a future domain's dependency on Performance, not built now. |

## 10. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Thin rating model may be seen as insufficient by larger organizations | Low | Medium | Explicitly named as a deliberate, additive-friendly scope cut (§7), not an oversight. |
| Recommended (not mandatory) org-context snapshot may be skipped in a rushed implementation | Low | Low | Documented explicitly here as recommended practice with clear reasoning (§3), so it isn't silently dropped. |

## 11. Assumptions

- Assumed (industry practice) that manager-plus-self rating is a sufficient starting evaluation model for most organizations; richer models are common but not universal, and none are verified as required here.

## 12. Impact on Future Domains

Any future domain must never violate:
1. Performance never reads from or writes to Attendance, Leave, or Payroll.
2. Any future performance-to-compensation feature depends *on* Performance (reads its ratings); Performance does not depend on it.
3. Acknowledged reviews are corrected via addenda, not edits (recommended practice to preserve).

This most directly constrains any future **Compensation Review** capability (not part of this review's dependency graph) and reinforces, rather than alters, the Department/Designation/Branch "no history" trade-off already accepted.

## Architecture Decision Records

**ADR-PF01 — ReviewCycle/PerformanceReview as Distinct Aggregates**
Status: Accepted; Implemented (2026-09-15)
Summary: This review's second explicit multi-party workflow after Leave - Draft → Submitted → Acknowledged. Implementation refinement: `PATCH` (editing rating/comments) is only permitted while `DRAFT`, not also while `SUBMITTED` as the doc's own looser wording could be read to allow - a deliberately stricter, simpler-to-reason-about checkpoint, flagged as a judgment call rather than a literal reading.

**ADR-PF02 — Reuses Employee.managerId as Reviewer**
Status: Accepted; Implemented (2026-09-15)
Summary: `reviewerId` is resolved from `Employee.managerId` at creation time and stored (not a live join), so a later manager change never retroactively rewrites who authored a past review. When the target employee has no manager, `ADMIN` (via `create:any`) must supply `reviewerId` explicitly - the doc's own admin-fallback framing, made concrete as a required field rather than an implicit substitution, since (unlike Leave's `decide:any`) `reviewerId` is a stored, mandatory column, not a pure authorization check.

**ADR-PF03 — Org-Context Snapshot at Submission (Recommended, Not Mandatory)**
Status: Accepted (recommendation); Implemented (2026-09-15)
Summary: Same insight as Payroll's ADR-PR02, applied at a calibrated, lower enforcement level appropriate to a personnel (not financial) record. Implemented exactly as worded - the snapshot is taken at the Submit transition specifically, not at creation, since a Draft review's organizational context isn't yet meaningful.

**ADR-PF04 — Goal/OKR, 360 Feedback, Competency Frameworks Deferred**
Status: Deferred

**ADR-PF05 — Permission Scoping**
Status: Accepted; Implemented (2026-09-15)
Summary: `ReviewCycle` follows the `ADMIN`-only master-data pattern (read for all roles). `PerformanceReview` splits authoring authority (`create:reports` for MANAGER over their own direct reports, `create:any` for ADMIN) from lifecycle management (`manage:reports`/`manage:any`, covering edit-while-Draft, submit, and delete-while-Draft) and from the reviewed employee's own actions (`read:own`, `acknowledge:own`, `selfAssess:own`) - 12 new permission keys total, `ADMIN`/`MANAGER` also holding the `:own`-suffixed self-service keys per this project's established convention (an admin/manager account is also potentially someone's report).

**ADR-PF06 — Addenda Are Ungated by a Dedicated Permission**
Status: Accepted; Implemented (2026-09-15)
Summary: Adding an addendum comment (the mechanism §2 names for post-Acknowledgement commentary) requires no new permission key - it is gated by whichever read/manage permission already grants the caller access to that specific review (the reviewer, ADMIN, or the reviewed employee themselves). Avoids a 13th permission key for a lightweight, always-available action.

## Final Sign-off

**Implementation readiness:** Implemented (2026-09-15). No structural blockers were found during implementation.

**Confidence score: 92%** — up from 88%, reflecting a clean implementation with no genuinely blocking open questions (unlike Payroll's salary-unit confirmation) and permission scoping resolved exactly along the lines this section's own §8 anticipated.

**Remaining blockers:** None. Performance-to-compensation linkage (§8 item 1) remains an explicitly deferred future dependency, not a current blocker.

**Recommended next domain:** Recruitment — the domain that determines how new Employee records originate in the first place, closing the loop back toward the Identity domain's onboarding entry point.
