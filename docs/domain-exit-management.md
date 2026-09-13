---
Domain: Exit Management
Status: FINAL — with an open dependency on Leave's deferred encashment policy
Date: 2026-07-28
Depends on: docs/domain-identity-employee-lifecycle.md, docs/domain-asset-management.md, docs/domain-payroll.md, docs/domain-leave.md
---

# Domain Sign-off: Exit Management

## 1. Domain Overview

Exit Management owns the **pre-separation business process** — notice period, clearance, and final settlement — that surrounds the single moment Identity's offboarding primitive (`softDeleteEmployee`) already handles.

**Business problem this domain solves:** Identity's own sign-off ([[domain-identity-employee-lifecycle]] §9) explicitly left this reconciliation open: offboarding as originally designed is a single admin action with no notice period, no clearance checklist, and no settlement process — real-world separation is a multi-step, multi-week process, not one action. This domain is where that gap is closed, without reopening Identity's already-accepted design.

**Why no other domain can own it:** Identity's offboarding primitive is deliberately minimal (§2) — a single, already-accepted state transition (soft-delete + eventual access revocation per ADR-006). It is not the right place to grow notice-period tracking, clearance checklists, or settlement orchestration; doing so would mean re-litigating an already-signed-off domain instead of building the richer process around it. This is exactly the same shape as Recruitment's relationship to Identity's onboarding primitive (§1 of [[domain-recruitment]]) — **Exit Management is the structural mirror of Recruitment**: Recruitment is the rich process that precedes and feeds onboarding; Exit Management is the rich process that precedes and feeds offboarding.

## 2. Business Lifecycle

- **ExitCase initiation:** created on voluntary resignation (employee-initiated) or involuntary termination (`ADMIN`/HR-initiated), with `type`, `initiatedAt`, and a `lastWorkingDay` (set explicitly per case — not computed by a notice-period-policy engine, see §6). Status: `INITIATED`.
- **Withdrawal:** for voluntary cases, the employee may rescind before `lastWorkingDay` arrives and before Identity's offboarding primitive has been invoked — status `WITHDRAWN`. **After** the offboarding primitive has run, "undo" is not a withdrawal concern at all — it is a **rehire**, and Identity's own already-designed rehire flow (documented in [[domain-identity-employee-lifecycle]]'s workflow diagrams) is the correct path from that point forward. Exit Management does not invent a second undo mechanism; it defers to the one that already exists.
- **The central lifecycle decision: the trigger for calling Identity's offboarding primitive is `lastWorkingDay` arriving — a time-based trigger — not clearance-checklist completion.** This is deliberately decoupled from clearance progress (see §7 for why). When `lastWorkingDay` is reached, the Exit Orchestration Service invokes Identity's **unmodified** `softDeleteEmployee` process, exactly as Recruitment's Hire Orchestration Service invokes onboarding — and status moves to `SEPARATED`.
- **Clearance, continuing after separation:** a `ClearanceChecklist` (asset return, knowledge transfer, final settlement) is tracked in parallel and may still be in progress after `SEPARATED` — an employee's system access is already revoked, but their laptop may still be in transit back to IT. Status moves to `COMPLETED` once all clearance items are done and final settlement is paid.
- **Who performs:** employee (initiate voluntary resignation, withdraw), `ADMIN`/HR (initiate involuntary termination, manage clearance, mark items done).
- **Who consumes:** the future rehire flow (already designed in Identity, consuming a simple `eligibleForRehire` flag this domain adds — see §6).

## 3. Relationships

**ExitCase → Employee: mandatory FK.** **ClearanceItem → ExitCase: child, one-to-many** (e.g., "Return Assets," "Revoke Access," "Knowledge Transfer," "Final Settlement" — each with its own `status: PENDING | DONE | WAIVED`).

**Reads Asset Management's exposed "all currently-held assets for employee X" query** ([[domain-asset-management]] §5) to auto-populate the "Return Assets" clearance item — the concrete fulfillment of the forward dependency Asset Management's own sign-off explicitly named for whichever domain came next.

**Triggers, does not own, Payroll's final settlement.** At `SEPARATED`, Exit Management flags that a final, prorated Payslip is needed for this employee's last partial pay period — but Payroll, per its own already-accepted design (ADR-PR01/PR02), owns actually computing and generating that Payslip. Exit Management does not create Payslip records itself; this is the same "read/trigger, never write into another domain's aggregate" discipline observed throughout this review.

**Depends on Leave's still-open encashment policy (ADR-LV06).** Final settlement commonly includes payout for unused leave balance — but Leave's own sign-off explicitly deferred whether encashment is even a supported policy ([[domain-leave]] §6/§8). This is not a new gap Exit Management introduces; it is the same open question surfacing a second time, from the settlement side. **This document does not resolve it** — resolving Leave's encashment policy is a prerequisite for Exit Management's final-settlement calculation to be complete, and is named here as an explicit blocking dependency rather than silently assumed one way or the other.

**Invokes Identity's offboarding primitive exactly once, at `lastWorkingDay`**, via a single Exit Orchestration Service — the same "one coordinating service, one boundary point" pattern as Recruitment's Hire Orchestration Service (ADR-RC03).

## 4. Business Rules

**Mandatory invariants:**
- `lastWorkingDay` cannot precede `initiatedAt`.
- Identity's offboarding primitive is invoked exactly once per ExitCase, triggered by `lastWorkingDay`, never by clearance completion.
- Withdrawal is only possible before the offboarding primitive has been invoked; after that point, reversal is a rehire, not a withdrawal.

**Recommended practices:**
- Mandatory clearance items (e.g., asset return) should be resolvable to `DONE` or explicitly `WAIVED` (with a reason, by `ADMIN`) rather than left permanently `PENDING` — an escape hatch for the common real-world case of a lost/unreturned asset that shouldn't block administrative closure forever.
- Include a simple `eligibleForRehire: Boolean` (with optional note) on `ExitCase`, decided at the time of separation — a small, cheap field that directly feeds Identity's already-existing rehire flow with useful context, rather than leaving that flow to start from zero information (see §6/§7 for why this is built now rather than deferred).

## 5. Architecture

- **Aggregates:** `ExitCase` (the separation process itself), `ClearanceItem` (child checklist entries).
- **Ownership:** ExitCase references Employee by ID; ClearanceItem references ExitCase (aggregate-internal) and, where relevant, an Asset (read-only reference, not ownership).
- **Exit Orchestration Service:** the single, sole caller of Identity's `softDeleteEmployee`, triggered by `lastWorkingDay`, decoupled from clearance-checklist state — this is the domain's key architectural decision, elaborated in §7.
- **Cross-domain interaction:** synchronous reads of Employee, Asset Management (active assignments), Leave (balance, pending ADR-LV06's resolution); a triggering signal (not a data write) to Payroll for final-settlement generation; exactly one invocation of Identity's unmodified offboarding primitive.
- **What belongs inside Exit Management:** notice period tracking, clearance checklist, the separation-trigger decision, rehire-eligibility flag.
- **What does NOT belong inside Exit Management:** the offboarding state-transition logic itself (Identity's, unmodified), Payslip calculation (Payroll's, unmodified), asset-return enforcement mechanics (Asset Management's own status/ledger).

## 6. Future Proofing

- **What could break this design:** a verified requirement for configurable, role/jurisdiction-specific notice-period policy (e.g., "30 days for individual contributors, 60 for managers, statutory minimums by region") would require a policy engine computing `lastWorkingDay` automatically — not built now; today's explicit-per-case `lastWorkingDay` is the simple, additive-compatible starting point.
- **Design now vs. defer:** design now — ExitCase/ClearanceItem, time-based (not clearance-based) separation trigger, `eligibleForRehire` flag (justified below as cheap and immediately useful, the same "foreseeable, not speculative" test already applied to Shift's overnight semantics and Asset Management's custody history). Defer — notice-period policy engine, structured exit-interview data collection (kept as free-text for now), automated final-settlement calculation details (Payroll's own scope, pending Leave's encashment policy).
- **Trade-off accepted:** `lastWorkingDay` is manually set per case rather than policy-derived; acceptable because no verified, uniform notice-period policy has been confirmed, and manual entry is a safe, simple starting point that a future policy engine can compute into rather than replace.

## 7. Challenge the Design

**Self-critique — why decouple the offboarding trigger (access revocation) from clearance completion, rather than the simpler "revoke access only once everything is fully wrapped up"?** This is the central design decision of this domain and deserves its reasoning stated plainly: security exposure from a departed employee retaining system access is a live risk for every day it persists, while an unreturned laptop or an incomplete knowledge-transfer note is an administrative loose end, not a security incident. Coupling the two — waiting for full clearance before revoking access — would mean a slow asset return (which can lag for entirely mundane logistics reasons) directly extends a security-sensitive window. Decoupling them means access is revoked precisely when it should be (the last working day), while clearance continues on its own, appropriately less urgent, timeline. This mirrors the same "separate the time-critical fact from the administrative process around it" instinct already applied in Payroll (snapshot the moment, don't wait for administrative finality) and Attendance (raw fact vs. derived reconciliation).

**Self-critique — is adding `eligibleForRehire` now, while everything else is deferred, another inconsistency?** Tested against the same criterion applied to Shift and Asset Management: it is a single field, decided at a moment (separation) when the relevant judgment is fresh and the person making it is already engaged in the process, and it directly serves an already-existing consumer (Identity's rehire flow) rather than a speculative future one. That combination — near-zero cost, immediate real consumer — is exactly what has justified "build now" in every prior instance of that pattern in this review; it is not being invoked loosely here.

**Alternative considered and rejected — trigger offboarding at clearance completion instead of lastWorkingDay.** Rejected for the security-exposure reasoning above.

**Alternative considered and rejected — Exit Management directly creates the final settlement Payslip itself, bypassing Payroll's own aggregate.** Rejected: would violate Payroll's own accepted design (Payslips are only created through Payroll's own generation process, always fully snapshotted per ADR-PR02) — Exit Management triggers, Payroll executes, exactly like every other cross-domain relationship in this review.

**Recommendation stands:** time-based (not clearance-based) separation trigger, single Exit Orchestration Service boundary into unmodified Identity offboarding, cheap `eligibleForRehire` flag, final-settlement calculation explicitly left to Payroll pending Leave's encashment policy.

## 8. Open Questions

1. **Leave encashment policy (ADR-LV06)** — final settlement's unused-leave payout cannot be fully specified until this is resolved; named here as a blocking dependency, not resolved.
2. Notice-period policy (fixed per case vs. role/jurisdiction-driven) — deferred (§6).
3. Permission scoping for initiating involuntary termination — narrower than general `ADMIN` in most real organizations (likely restricted to HR/senior management); same unresolved category as prior domains, arguably more sensitive here.

## 9. Deferred Decisions

| Decision | Reason for Deferral |
|---|---|
| Notice-period policy engine | No verified, uniform policy confirmed; manual per-case entry is the safe starting point. |
| Structured exit-interview data collection | No verified requirement beyond free-text notes. |
| Final-settlement calculation detail (unused-leave encashment) | Blocked on Leave's own deferred ADR-LV06; not resolved here. |

## 10. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Access revocation depends on Identity's ADR-006 (offboarding revokes access) actually being implemented, which per Identity's own sign-off is accepted architecture but **not yet implemented** | High | High (until Identity's ADR-006 is implemented) | Named explicitly; this is an existing, already-flagged Identity-domain gap, not one this document introduces or can resolve — Exit Management's design is correct regardless of when ADR-006 is implemented, but its real-world security value depends on that implementation happening. |
| Final settlement cannot be fully calculated until Leave's encashment policy is resolved | Medium | Medium | Explicit blocking dependency named (§3/§8); does not block the rest of this domain's design. |
| Manual `lastWorkingDay` entry could be set inconsistently across cases without a policy engine | Low | Low | Accepted trade-off (§6); additive policy engine path preserved. |

## 11. Assumptions

- Assumed voluntary resignation and involuntary termination share the same ExitCase/ClearanceItem structure, differing only in `type` and who initiates — a reasonable simplification, not verified against every possible termination-for-cause legal nuance (which may carry additional documentation requirements in some jurisdictions, out of scope here).

## 12. Impact on Future Domains

This is the final domain in the approved dependency order. Its own constraints:
1. Identity's offboarding primitive remains invoked exactly once, at `lastWorkingDay`, never modified or duplicated.
2. Rehire after a completed separation uses Identity's existing rehire flow — Exit Management does not build a second one.
3. Final settlement is always generated through Payroll's own process, never created directly by Exit Management.
4. Leave's encashment policy (ADR-LV06) must be resolved before final-settlement calculation can be considered complete.

**Resolution of Identity's open question, from this side:** Identity's own sign-off left open whether onboarding and offboarding should be one service or two ([[domain-identity-employee-lifecycle]] §5). This domain's existence is relevant context for that decision, not a redesign of it: Exit Management's clean mirroring of Recruitment (§1) — two separate rich pre/post-processes, each invoking a distinct, minimal Identity primitive — is a natural argument for keeping onboarding and offboarding as distinct concerns at the orchestration level, symmetric with Recruitment and Exit Management being distinct domains. The final implementation decision remains Identity's own to make; this document only notes the symmetry as supporting context.

## Architecture Decision Records

**ADR-EM01 — Exit Management as the Structural Mirror of Recruitment**
Status: Accepted
Summary: A rich pre/post-process domain surrounding a minimal, unmodified Identity primitive, exactly like Recruitment surrounds onboarding.

**ADR-EM02 — Separation Trigger Decoupled from Clearance Completion**
Status: Accepted
Summary: Identity's offboarding primitive is invoked at `lastWorkingDay` (time-based), not at full clearance completion (administrative), to avoid extending a security-sensitive access window for administrative reasons.

**ADR-EM03 — Post-Separation Reversal Uses Identity's Existing Rehire Flow**
Status: Accepted
Summary: No second "undo offboarding" mechanism is built; rehire is the correct, already-designed path.

**ADR-EM04 — eligibleForRehire Flag Built Now**
Status: Accepted
Summary: Low-cost field with an immediate, already-existing consumer (Identity's rehire flow).

**ADR-EM05 — Final Settlement Blocked on Leave's ADR-LV06**
Status: Deferred — Open (blocking dependency, not resolved here)

## Final Sign-off

**Implementation readiness:** Conditionally ready. The process design is structurally complete and correctly reconciled against Identity's existing offboarding scope (per Identity's own §9 requirement); full final-settlement calculation cannot be considered complete until Leave's encashment policy (ADR-LV06) is resolved, and real-world security value depends on Identity's own ADR-006 being implemented.

**Confidence score: 84%**

**Remaining blockers:** Resolve Leave's encashment policy (ADR-LV06); confirm Identity's ADR-006 (access revocation on offboarding) is implemented before relying on this domain's security-timing guarantee (ADR-EM02) in production; confirm permission scoping for involuntary termination.

**Recommended next step:** all thirteen domains in the approved dependency order (Department through Exit Management) are now complete. Per the standing instruction, proceed to the final architecture-index and supporting cross-cutting documents.
