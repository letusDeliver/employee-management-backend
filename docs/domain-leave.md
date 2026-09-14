---
Domain: Leave
Status: FINAL — with open questions on carry-forward and encashment policy
Date: 2026-07-27
Depends on: docs/domain-identity-employee-lifecycle.md, docs/domain-employment-type.md, docs/domain-holiday-calendar.md, docs/domain-attendance.md
---

# Domain Sign-off: Leave

## 1. Domain Overview

Leave manages **employee requests for planned time off** — leave types (Annual, Sick, Casual), balance entitlement/consumption, and the approval workflow that decides whether a request is granted.

**Business problem this domain solves:** employees need a governed way to request time off, managers need a way to approve/reject it, and the organization needs to track how much leave each employee has consumed against their entitlement — none of which any prior domain provides. This is also the first domain requiring an actual **approval workflow** (Pending → Approved/Rejected), a structural shape none of the six prior domains needed (they had at most an Active/Inactive lifecycle, not a multi-party decision process).

**Why no other domain can own it:** Attendance deliberately excludes this — its own sign-off (ADR-AT03) establishes that Attendance must never receive writes from Leave, only read from it, precisely so that Leave's own approval logic and balance rules can evolve independently. Employment Type deliberately excludes leave *rules* from its own scope (ADR-ET03) while flagging itself as an input Leave must consume for entitlement/accrual — that consumption happens here, fulfilling that flagged dependency.

## 2. Business Lifecycle

**Three aggregates, not one** — this domain has more internal structure than prior master-data domains:

- **LeaveType** (master data: "Annual Leave," "Sick Leave," "Casual Leave") — created/renamed/archived by `ADMIN`, same status-lifecycle and hard-delete-if-unreferenced shape as Branch/Department/Designation. Carries a `defaultAnnualEntitlement` (e.g., 18 days/year).
- **LeaveRequest** (transactional, workflow-driven): created by the employee (self-service application) with `leaveTypeId`, `startDate`, `endDate`, `reason`. Moves through **Pending → Approved | Rejected**, and separately **Approved → Cancelled** (see below). This is the first explicit workflow state machine in the review.
- **LeaveBalance** (per employee, per leaveType, per year): tracks entitlement, consumed, and remaining days. Updated when a `LeaveRequest` is approved (deduct) or an approved-but-future-dated request is cancelled (restore).

**Approval actor:** the employee's direct manager (`Employee.managerId`, the existing self-relation from the Identity domain — see [[domain-identity-employee-lifecycle]]) is the natural approver, reusing an already-verified relationship rather than inventing a new one. **Fallback rule:** if `managerId` is null (a verified-possible state per the existing schema), `ADMIN` approves directly. This mirrors how the existing codebase already treats `managerId` as optional.

**Cancellation:** an employee may cancel a `Pending` request outright, or an `Approved` request that has not yet started (future-dated), restoring the deducted balance. An `Approved` request whose dates have already elapsed cannot be cancelled retroactively — correcting a past leave record is a regularization concern, explicitly the same category of problem Attendance's own sign-off already deferred (its "regularization workflow," §8 of [[domain-attendance]]) rather than something Leave should solve independently.

**Who consumes:** the future Payroll domain (unpaid-leave-type deductions, if any — not decided here); the Attendance domain's coordinating service (reads approved Leave to compute effective daily status, per ADR-AT03).

## 3. Relationships

**LeaveRequest → Employee: mandatory FK.** **LeaveRequest → LeaveType: mandatory FK**, must reference an `ACTIVE` LeaveType at request time (positive-allowlist, consistent with every prior domain).

**LeaveBalance is Leave's own internal aggregate, not a cross-domain write target.** When a `LeaveRequest` is approved, Leave updates its *own* `LeaveBalance` record. This is an intra-domain write, not a cross-domain one, and is fully consistent with ADR-AT03's rule — that rule forbids Leave from writing into *Attendance's* aggregate; it says nothing about, and does not need to say anything about, a domain updating its own internal state. This distinction is worth stating explicitly so the "no cross-domain writes" principle established for Attendance is not over-read as "no domain may ever write anywhere."

**Reads Employment Type for entitlement rules.** Different Employment Types may warrant different entitlement policies (e.g., `INTERN` receiving reduced or no annual leave, `PART_TIME` receiving prorated entitlement). Leave reads `Employee.employmentType` synchronously when computing a `LeaveBalance`'s entitlement — fulfilling exactly the dependency Employment Type's own sign-off flagged and deliberately left unresolved for Leave to answer (§12 of [[domain-employment-type]]).
*Classification: recommendation — the specific proration formula (e.g., "50% for part-time") is an industry-practice default, not a verified customer requirement, and should be treated as configurable rather than hard-coded once implemented.*

**Reads Holiday Calendar (and Shift's working-days pattern) to compute leave-day duration.** A five-calendar-day leave request that spans one public holiday and one weekly off-day should deduct three days from balance, not five. This reuses the same holiday-resolution query already recommended in Holiday Calendar's own sign-off (ADR-HC04) — Leave is the second consumer of that query, alongside Attendance, which is exactly why that query was recommended to live in one shared place rather than being implemented ad hoc per consumer.

**Is read, never written to, by Attendance.** Leave must expose a query — "does employee X have an approved leave covering date Y" — for Attendance's coordinating service to consume (§3 of [[domain-attendance]]). This is the concrete fulfillment of the contract Attendance's sign-off named as a requirement for whichever domain designed Leave.

## 4. Business Rules

**Mandatory invariants:**
- A `LeaveRequest`'s `startDate` must not be after its `endDate`.
- An employee cannot have two `Pending` or `Approved` leave requests with overlapping date ranges.
- A `LeaveRequest` cannot be approved if it would drive the relevant `LeaveBalance` negative — **default policy is no negative balance**; leave beyond entitlement is rejected, not silently allowed (see §6 for why "advance leave" / negative-balance policy is deferred rather than decided either way).
- Leave duration for balance-deduction purposes excludes holidays and weekly off-days within the requested range (§3).
- `LeaveBalance` changes (accrual grant, deduction, restoration) must be tracked, at minimum via the generic `AuditLog` model, given their direct financial/entitlement significance.

**Recommended practices:**
- Entitlement is granted as an **annual lump sum at the start of each calendar year**, prorated by hire date in the year of joining (e.g., an employee joining July 1 receives roughly half the annual entitlement) — a simple, common, defensible starting model. **Explicitly not built now:** monthly/periodic accrual schedules, carry-forward to the next year, and encashment (cashing out unused leave) — see §6.
- Keep `LeaveType` minimal (name, code, `defaultAnnualEntitlement`, status) — resist embedding entitlement-calculation logic (proration formulas, carry-forward rules) directly on `LeaveType`; that logic belongs in the domain service that computes `LeaveBalance`, not in the master-data row itself.

## 5. Architecture

- **Aggregates:** `LeaveType` (master data), `LeaveRequest` (workflow), `LeaveBalance` (per-employee ledger) — three distinct aggregates within one bounded domain, each with a different lifecycle shape, named explicitly rather than collapsed into one table.
- **Ownership:** LeaveRequest owns `employeeId`/`leaveTypeId` FKs; LeaveBalance owns `employeeId`/`leaveTypeId`/year as its natural key.
- **Repository responsibilities:** each aggregate has its own repository; the LeaveRequest repository never mutates LeaveBalance directly — that happens through a domain service (see below) so the balance-update side effect of approval is explicit and testable, not buried inside a repository method.
- **Domain service responsibilities:** a Leave application/approval service orchestrates: validate no overlapping requests → on approval, compute holiday/week-off-excluded duration (reading Holiday Calendar + Shift) → deduct from LeaveBalance → audit-log the balance change. This mirrors the existing `auth.service.js` `register()` cross-repository orchestration precedent (see [[domain-identity-employee-lifecycle]]) — a service coordinating multiple repositories within (here) and across (Holiday Calendar, Shift) domain boundaries.
- **Cross-domain interaction:** synchronous reads of Employee (managerId, employmentType), Holiday Calendar, and Shift; synchronous reads *by* Attendance of Leave's approved-request data. No cross-domain writes in either direction (§3).
- **What belongs inside Leave:** leave types, requests, balances, the approval workflow, holiday-aware duration calculation.
- **What does NOT belong inside Leave:** attendance-status materialization (Attendance's own computed-status service owns that reconciliation), payroll unpaid-deduction calculation (Payroll's concern, consuming Leave's data once designed).

## 6. Future Proofing

- **What could break this design:** a verified requirement for carry-forward (unused leave rolling into next year, often capped) or encashment (cashing out unused leave, often at year-end or offboarding) would require `LeaveBalance` to track a "carried-forward" component distinct from "this year's grant" — additive to today's per-year ledger shape, not a redesign. A verified requirement for accrual-based (monthly) rather than lump-sum entitlement would change how `LeaveBalance` is populated but not its fundamental per-employee-per-type-per-year shape.
- **Design now vs. defer:** design now — three-aggregate structure, overlap/negative-balance invariants, holiday-aware duration, manager-approval workflow. Defer — carry-forward, encashment, monthly accrual schedules, negative-balance/advance-leave policy, leave-type-specific rules (e.g., sick leave requiring a medical certificate above N consecutive days).
- **Trade-off accepted:** an employee who joins mid-year and immediately needs more leave than their prorated entitlement allows has no "advance" mechanism today; they must wait for the next entitlement grant (or an `ADMIN` manual balance adjustment, which the audit-logged balance-change invariant already supports as an escape hatch without new schema).

## 7. Challenge the Design

**Self-critique — is direct-manager-only approval too rigid for organizations wanting multi-level or HR-co-approval?** Reusing `managerId` is deliberately the simplest correct answer given what already exists (no new relationship invented), but it does mean there is no support for a second-level approval or an HR override step beyond the `ADMIN` fallback for a null manager. Counter-argument: no verified requirement demands multi-level approval, and the `ADMIN` fallback already provides an escape hatch for exceptional cases; building a generalized multi-step approval-workflow engine now — for Leave alone — would be exactly the kind of speculative infrastructure this review's standing philosophy warns against, especially since Attendance's own regularization workflow was deferred for the identical reason (no approval-workflow capability exists yet, project-wide).

**Self-critique — should LeaveBalance be computed on read (like Attendance's effective status) instead of stored?** Deliberately decided differently, and that difference is justified, not accidental: Attendance's computed-on-read decision (ADR-AT03) was specifically about *not writing into another domain's aggregate*. LeaveBalance is Leave's own aggregate — computing it fresh on every read would mean replaying every historical LeaveRequest for that employee/type/year on every balance check, a real and unnecessary cost for a value that changes only at well-defined discrete events (grant, approval, cancellation). Storing it and updating it transactionally at those events is the correct choice here, precisely because this is intra-domain state, not a cross-domain reconciliation.

**Alternatives considered and rejected:**
- Multi-level/committee approval workflow — rejected, no verified requirement, escape hatch (`ADMIN`) already exists (§7 above).
- Computed (not stored) LeaveBalance — rejected, wrong context for that pattern (§7 above).
- Building carry-forward/encashment now "since most companies eventually need it" — rejected: same standing YAGNI discipline applied throughout this review; additive path is preserved (§6).

**Recommendation stands:** three-aggregate structure, manager-approval-with-admin-fallback, stored LeaveBalance updated at discrete events, holiday-aware duration via the shared resolution query.

## 8. Open Questions

1. Carry-forward and encashment policy — explicitly deferred (§6), not decided either way.
2. Negative-balance / advance-leave policy — explicitly deferred; current default is strict no-negative-balance.
3. Leave-type-specific sub-rules (e.g., medical certificate required above N consecutive sick days) — deferred; no verified requirement yet.
4. ~~Permission scoping for LeaveType management — same unresolved `ADMIN`-only vs. broader pattern as prior domains.~~ **Resolved (2026-09-15) — see ADR-LV07.**
5. Entitlement-proration formula and any employment-type-based adjustment — **partially resolved (2026-09-15)**: the hire-date proration leg of §4's own recommendation is implemented concretely (see ADR-LV03's implementation note); no employment-type-based adjustment was added, since no verified formula exists and hard-coding one was explicitly warned against (§3). Still not confirmed with real business stakeholders, as this section originally requested.

## 9. Deferred Decisions

| Decision | Reason for Deferral |
|---|---|
| Carry-forward / encashment | No verified requirement; additive to the per-year LeaveBalance shape. |
| Monthly/periodic accrual instead of annual lump sum | No verified requirement; annual lump-sum is a simpler, defensible starting model. |
| Negative-balance / advance-leave policy | No verified requirement; strict no-negative-balance is the safer default. |
| Multi-level approval workflow | No verified requirement; no approval-workflow infrastructure exists project-wide yet. |
| Leave-type-specific sub-rules (medical certificates, etc.) | No verified requirement. |

## 10. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Strict no-negative-balance policy may block a legitimate business need (e.g., compassionate leave beyond entitlement) | Medium | Medium | `ADMIN` manual balance adjustment (audit-logged) is the accepted escape hatch until/unless a formal advance-leave policy is designed. |
| Single-level manager approval may be insufficient for larger organizations | Low | Low | `ADMIN` fallback exists; multi-level workflow is an explicitly named, deferred extension (§7). |
| Holiday-aware duration calculation depends on Holiday Calendar/Shift data being correctly maintained | Medium | Low | Inherited risk, already flagged in those domains' own sign-offs; not new here. |

## 11. Assumptions

- Assumed (industry practice) that annual lump-sum entitlement, prorated at hire, is an acceptable starting policy for most adopting organizations — common in many HRIS defaults, not a verified customer requirement.
- Assumed direct-manager approval (with admin fallback) is sufficient governance for the initial scope; no verified requirement for multi-level approval exists.

## 12. Impact on Future Domains

Any future domain must never violate:
1. Leave never receives writes from Attendance or any other domain — Attendance reads from Leave, never the reverse (ADR-AT03, reaffirmed here from Leave's side).
2. LeaveBalance is Leave's own internal state, correctly distinguished from the cross-domain-write prohibition that governs Attendance.
3. Leave-day duration calculation always excludes holidays/week-offs via the shared resolution query, never a bespoke recalculation.
4. No negative LeaveBalance without an explicit, audit-logged manual override.

This most directly constrains the future **Payroll** domain, which will need to read Leave data (e.g., to determine unpaid-leave deductions, if any leave types are unpaid — a policy not decided here) as one of its calculation inputs.

## Architecture Decision Records

**ADR-LV01 — Three Aggregates: LeaveType, LeaveRequest, LeaveBalance**
Status: Accepted; Implemented (2026-09-15)
Summary: Distinct lifecycle shapes (master data, workflow, ledger) are modeled as distinct aggregates rather than collapsed into one table.
Implementation note: `LeaveType` has no `code` field (same reasoning as `HolidayCalendar` - this domain's own sign-off never names one as useful).

**ADR-LV02 — Manager-Approval Workflow with Admin Fallback**
Status: Accepted; Implemented (2026-09-15) — refined, see note
Summary: Reuses existing `Employee.managerId`; `ADMIN` approves when no manager is assigned.
Implementation note: implemented as two distinct permissions rather than one shared `:any` key - `leaveRequest:decide:any` (ADMIN, unconditional on every request, not just the null-manager fallback case §2 literally describes) and `leaveRequest:decide:reports` (MANAGER, scoped in the service to the caller's own direct reports via `Employee.managerId`). This widens ADMIN's authority slightly beyond the doc's literal "fallback when managerId is null" wording, consistent with the "audit-logged manual override as escape hatch" philosophy already applied to LeaveBalance (§10) - worth naming explicitly as a refinement, not a silent reinterpretation.

**ADR-LV03 — LeaveBalance Stored, Not Computed-on-Read**
Status: Accepted; Implemented (2026-09-15)
Summary: Deliberately different from Attendance's ADR-AT03, justified by the intra-domain vs. cross-domain distinction (§7).
Implementation note: balances are computed **lazily** (`leaveService.getOrCreateLeaveBalance`), not by a scheduled annual grant job - this project has no scheduler/cron infrastructure, so the first read or approval that needs a given (employee, leaveType, year) balance computes and persists it via the concrete hire-year proration formula: full `defaultAnnualEntitlement` every year after hire, zero before hire, and `defaultAnnualEntitlement × (daysRemainingInHireYear / totalDaysInHireYear)` (rounded to 2 decimals) during the hire year itself. No employment-type-based adjustment (§3's own caveat honored - not hard-coding an unverified formula).

**ADR-LV04 — Holiday-Aware Duration via Shared Resolution Query**
Status: Accepted; Implemented (2026-09-15)
Summary: Reuses the query recommended in Holiday Calendar's ADR-HC04; second consumer alongside Attendance.
Implementation note: `leaveService`'s internal `computeLeaveDuration` reads the employee's Branch → HolidayCalendar → `isDateHolidayInCalendar` and Shift → `workingDays`, iterating the requested date range once at approval time - computed and stored on `LeaveRequest.durationDays`, never recalculated afterward.

**ADR-LV05 — Strict No-Negative-Balance Default**
Status: Accepted (default policy); Implemented (2026-09-15)
Summary: Leave requests exceeding balance are rejected by default; manual admin override is the escape hatch.
Implementation note: the escape hatch is real, not just described - `PATCH /leave-balances/:id` (`leaveBalance:adjust:any`, ADMIN-only, always audit-logged).

**ADR-LV06 — Carry-Forward / Encashment Deferred**
Status: Deferred
Summary: No verified requirement; additive to today's per-year ledger shape if ever needed.

**ADR-LV07 — Permission Scoping**
Status: Accepted; Implemented (2026-09-15)
Summary: `LeaveType` follows the established `ADMIN`-only-mutation/read-for-all pattern (matching Branch/Department/Designation/Holiday Calendar/Shift). `LeaveRequest`/`LeaveBalance` instead mirror `Employee`'s own/any split (`leaveRequest:create:own`, `:read:own`/`:read:any`, `:cancel:own`/`:cancel:any`, `:decide:any`/`:decide:reports`; `leaveBalance:read:own`/`:read:any`/`:adjust:any`) - the largest permission surface of any domain in this review (14 keys), proportionate to having three aggregates with genuinely different actor shapes.

**ADR-LV08 — Closes Attendance's ADR-AT03 Leave Leg**
Status: Accepted; Implemented (2026-09-15)
Summary: `leaveService.hasApprovedLeaveOnDate(employeeId, date)` is the query ADR-AT03/§12 named as a requirement for Leave to expose. `attendanceService.getEffectiveStatus()` now consumes it, inserted into the resolution order as `HOLIDAY → WEEK_OFF → ON_LEAVE → ABSENT → HALF_DAY → LATE → PRESENT`. Pure read; Attendance's schema and write paths are untouched, honoring the "no cross-domain writes" contract from both sides.

## Final Sign-off

**Implementation readiness:** Implemented (2026-09-15). Remaining open items (§8) are policy parameters, not structural blockers.

**Confidence score: 87%** — up from 83%, reflecting successful implementation of all three aggregates, the approval workflow, holiday-aware duration, and the Attendance integration. Not higher: the genuine policy ambiguity around negative-balance/carry-forward/encashment/entitlement-proration remains unconfirmed with real business stakeholders, exactly as this section originally flagged.

**Remaining blockers:** None structural. The entitlement-proration formula and any employment-type-based adjustment still await real business-stakeholder confirmation, as this section originally requested - what's implemented is a concrete, reasoned default (§4's own recommendation made concrete), not a verified requirement.

**Recommended next domain:** Payroll — the domain whose calculation inputs (Employment Type, Attendance's effective status, Leave's balance/deduction data) are now all designed and available to depend on.
