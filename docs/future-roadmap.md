---
Document: Future Roadmap
Status: FINAL
Date: 2026-07-28
Covers: All 15 signed-off domains
---

# Future Roadmap

A recommended sequencing for turning this architecture review into an implementation plan. This document makes recommendations, not decisions — every sequencing choice here should be validated against real business priority before committing to it.

## Recommended Implementation Phases

**Phase 1 — Master Data Foundation**
Branch, Department, Designation, Employment Type. These four have the shallowest dependency footprint (only Identity beneath them), the highest confidence scores of the entire review (86–90%), and unblock every domain above them. Implementing them together is efficient because they share nearly identical CRUD/lifecycle shape (except Employment Type's deliberate enum divergence, ADR-ET01).

**Phase 2 — Time & Presence**
Holiday Calendar, Shift, Attendance. These form a tight, sequential dependency chain (Attendance needs both of the other two) and should be built in that order. This phase's confidence scores are lower (82–85%), reflecting the genuine complexity introduced by the multi-hop resolution chain (Holiday Calendar §5) and the computed-on-read performance question (Attendance §7) — both should be watched during implementation, not just at design time.

**Phase 3 — Leave & Payroll**
Leave, then Payroll. This is the phase with the most open, business-critical questions in the entire review: Leave's negative-balance/encashment policy (LV05/LV06) and Payroll's salary-unit and contractor-payment-flow questions (PR05, §6/§8 of [[domain-payroll]]) should be resolved **with actual stakeholders before writing code**, not discovered mid-implementation. Payroll has the lowest confidence score of any domain in this review (78%) precisely because these questions are real and unresolved, not because the architecture itself is shaky.

**Phase 4 — People Processes**
Performance, Recruitment, Training. These three are mutually independent (see [[cross-domain-relationship-matrix]] — none reads from or is read by the others) and can be built in any order, or in parallel, once Phase 1 is complete. Recruitment additionally requires Employment Type from Phase 1. Training and Performance require nothing beyond Identity and Phase 1.

**Phase 5 — Assets & Exit**
Asset Management, then Exit Management. Asset Management only needs Identity. Exit Management is last because it deliberately depends on Asset Management (active-assignment query) and has a real, named blocking dependency on Leave's encashment policy (LV06/EM05) — do not schedule Exit Management's final-settlement feature before that policy question is closed.

## Cross-Cutting Work That Should Happen Once, Not Per-Domain

Several gaps were flagged independently in almost every domain's sign-off. Building a shared solution once, rather than one-off per domain, avoids exactly the kind of drift the master-data axes' "single source of truth" reasoning was meant to prevent in the first place:

1. **Permission scoping model.** Nearly every domain (Branch, Department, Designation, Holiday Calendar, Shift, Leave, Payroll, Recruitment, Training, Asset Management, Exit Management) independently left "who beyond `ADMIN` can manage this" open. Recommend resolving this once, as a general RBAC-scoping decision (extending the existing `Role`/`Permission`/`RolePermission` model already in place), rather than deciding it eleven separate times.
2. **AuditLog extension pattern.** Branch, Department, Designation, and by implication Attendance/Leave/Payroll all assume the generic `AuditLog` model extends cleanly to new `entityType` values. Confirm this once (it almost certainly requires no schema change, only consistent usage) rather than re-verifying it per domain.
3. **Approval-workflow infrastructure.** Attendance's regularization workflow, Leave's multi-level approval, and Asset Management's asset-request workflow all independently deferred the same underlying missing capability: a general request/approve mechanism beyond the simple manager-approval pattern already reused by Leave and Performance. If more than one of these three becomes a real requirement, build the general capability once rather than three bespoke versions.
4. **Notification infrastructure.** Currently named explicitly only by Training (renewal reminders), but would also serve Leave (approval notifications) and Exit Management (clearance reminders) the moment any of them is prioritized. No notification mechanism exists anywhere in this codebase today — this is a project-wide, not domain-specific, gap.

## Decisions Requiring Non-Architectural Input Before Implementation

These cannot be resolved by further design work — they need business, legal, or stakeholder input:

| Decision | Domain | Who Should Resolve It |
|---|---|---|
| Salary period unit (monthly? annual?) | Payroll (PR05) | Finance/HR stakeholders |
| Contractor payment mechanism (payroll vs. invoice) | Payroll | Finance/HR stakeholders |
| Tax/statutory deduction rules | Payroll (PR04) | Legal/compliance, jurisdiction-specific |
| Leave carry-forward/encashment policy | Leave (LV06) | HR policy owners |
| Candidate PII retention period | Recruitment (RC04) | Legal/compliance |
| Notice-period policy by role/jurisdiction | Exit Management | HR/legal |

## What "Done" Looks Like for This Review

All fifteen domains (Identity & Employee Lifecycle, Branch, Department, Designation, Employment Type, Holiday Calendar, Shift, Attendance, Leave, Payroll, Performance, Recruitment, Training, Asset Management, Exit Management) have a signed-off architectural record. Every cross-domain relationship is documented and consistent (no write-across-boundary violations anywhere — [[cross-domain-relationship-matrix]]). Every deferred decision has a stated reason and, where relevant, an additive migration path ([[deferred-decisions-register]]). Every open ADR is tracked centrally ([[adr-index]]). This is the complete business-architecture foundation this review set out to build — implementation planning (technical design, schema, APIs) is the deliberate next step, out of scope for this review by its own standing rules.

## Cross-References

- Full domain list and status: [[architecture-index]]
- Dependency ordering: [[domain-dependency-graph]]
- Every ADR: [[adr-index]]
- Every relationship: [[cross-domain-relationship-matrix]]
- Every deferred item: [[deferred-decisions-register]]
