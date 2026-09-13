---
Document: Architecture Index
Status: FINAL
Date: 2026-07-28
Covers: All 15 signed-off domains
---

# HRMS/ERP Business Architecture Index

This is the entry point into the complete business-architecture knowledge base produced by the Enterprise HRMS/ERP Business Architecture Review. It exists purely at the business-architecture level — no code, schema, or API was written or specified anywhere in this review; every document is a permanent architectural record intended to guide future implementation.

## Standing Review Rules

- One domain designed at a time, in dependency order, following a fixed 7-step process (Explain → Business Lifecycle → Relationships → Business Rules → Architecture → Future Proofing → Challenge the Design).
- Every claim is classified as **verified fact**, **business/architectural reasoning**, **industry practice**, or **recommendation** — never presented as settled fact when it isn't.
- Accepted decisions in prior domains are treated as immutable; later domains extend or read from them but never silently redesign them. Where a later domain's needs touch an earlier domain's deferred item (e.g., Holiday Calendar picking up Branch's deferred `holidayCalendarId`), that is documented as an additive extension, not a redesign.
- Build only what today's verified requirements demand while preserving additive paths for tomorrow's — no speculative features "because other HRMS products have them."

## Domain Sign-off Documents (Dependency Order)

| # | Domain | Document | Confidence | Status |
|---|---|---|---|---|
| 0 | Identity & Employee Lifecycle | [domain-identity-employee-lifecycle.md](domain-identity-employee-lifecycle.md) | 85% | Final |
| 1 | Branch | [domain-branch.md](domain-branch.md) | 88% | Final — 2 open ADRs |
| 2 | Department | [domain-department.md](domain-department.md) | 87% | Final — 2 open ADRs |
| 3 | Designation | [domain-designation.md](domain-designation.md) | 86% | Final — 1 open ADR |
| 4 | Employment Type | [domain-employment-type.md](domain-employment-type.md) | 90% | Final |
| 5 | Holiday Calendar | [domain-holiday-calendar.md](domain-holiday-calendar.md) | 84% | Final — scope-boundary open items |
| 6 | Shift | [domain-shift.md](domain-shift.md) | 85% | Final |
| 7 | Attendance | [domain-attendance.md](domain-attendance.md) | 82% | Final — performance question open |
| 8 | Leave | [domain-leave.md](domain-leave.md) | 83% | Final — 1 open ADR (LV06) |
| 9 | Payroll | [domain-payroll.md](domain-payroll.md) | 78% | Conditionally ready — 2 open ADRs |
| 10 | Performance | [domain-performance.md](domain-performance.md) | 88% | Final |
| 11 | Recruitment | [domain-recruitment.md](domain-recruitment.md) | 85% | Conditionally ready — 1 open ADR (compliance) |
| 12 | Training | [domain-training.md](domain-training.md) | 87% | Final |
| 13 | Asset Management | [domain-asset-management.md](domain-asset-management.md) | 89% | Final |
| 14 | Exit Management | [domain-exit-management.md](domain-exit-management.md) | 84% | Conditionally ready — 1 open ADR (blocked on Leave) |

**Average confidence: 85%.** The three "conditionally ready" domains (Payroll, Recruitment, Exit Management) are not architecturally incomplete — each has a specific, named, non-architectural blocker (financial-policy confirmation, legal/compliance input, or a dependency on another domain's own open item) documented in its own §12 Final Sign-off.

## Supporting Cross-Cutting Documents

| Document | Purpose |
|---|---|
| [domain-dependency-graph.md](domain-dependency-graph.md) | The full dependency graph (Mermaid), actual design order, and why it held up against the Phase 1 illustrative order. |
| [adr-index.md](adr-index.md) | Every Architecture Decision Record from every domain, in one lookup table, with all open/deferred ADRs flagged separately. |
| [cross-domain-relationship-matrix.md](cross-domain-relationship-matrix.md) | Per-domain reads-from/read-by/triggers table, and the single rule (no cross-domain writes) that holds across all fifteen domains. |
| [deferred-decisions-register.md](deferred-decisions-register.md) | Every explicitly deferred decision across every domain, plus the project-wide recurring gaps (permission scoping, approval workflows, notifications, audit logging) that surfaced independently in multiple domains. |
| [future-roadmap.md](future-roadmap.md) | Recommended implementation phasing, cross-cutting work that should happen once rather than per-domain, and the specific non-architectural decisions (financial, legal, policy) that must be resolved before certain domains can be built. |

## The Architecture in One Paragraph

Every employee-facing fact in this system traces back to `Employee`/`User` (Identity). Four independent, orthogonal classification axes (Branch, Department, Designation, Employment Type) describe *what kind of employee* someone is, each deliberately avoiding hierarchy or cross-validation with the others. Two expectation domains (Holiday Calendar, Shift) describe *when work is expected to happen*. One ledger domain (Attendance) records *what actually happened*, computing its derived status on read rather than storing it. One workflow-plus-ledger domain (Leave) manages planned absence against entitlement, deliberately never writing into Attendance's aggregate. One financial domain (Payroll) converts all of the above into an immutable, fully-snapshotted monetary record — the point in the architecture where the earlier axes' "no history" trade-offs become concretely visible and must be compensated for by snapshotting, not by reopening those decisions. Three independent people-process domains (Performance, Recruitment, Training) each stand on their own with minimal coupling to the operational core. Two domains (Asset Management, Exit Management) close the loop: one builds real custody history because that is its actual purpose, and the other structurally mirrors Recruitment, surrounding Identity's already-accepted offboarding primitive with a richer real-world process without ever modifying it.

## Navigating This Knowledge Base

- Start with [domain-dependency-graph.md](domain-dependency-graph.md) for the shape of the whole system.
- Read domain documents in the order listed above — each explicitly cites and builds on the ones before it.
- Use [adr-index.md](adr-index.md) and [deferred-decisions-register.md](deferred-decisions-register.md) as the two places to check "has this already been decided, and if not, why not" before proposing new architecture.
- Use [future-roadmap.md](future-roadmap.md) when moving from this business-architecture review into actual implementation planning.
