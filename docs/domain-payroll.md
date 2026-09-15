---
Domain: Payroll
Status: FINAL — Implemented (2026-09-15); tax/statutory deduction calculation and a separate contractor/invoice-based payment flow remain explicitly out of scope
Date: 2026-07-27
Depends on: docs/domain-identity-employee-lifecycle.md, docs/domain-branch.md, docs/domain-department.md, docs/domain-designation.md, docs/domain-employment-type.md, docs/domain-attendance.md, docs/domain-leave.md
---

# Domain Sign-off: Payroll

## 1. Domain Overview

Payroll calculates and permanently records **what each employee was actually paid for a given period**, using base salary plus adjustments from Attendance (unpaid absence, overtime) and Leave (unpaid-leave deductions).

**Verified fact:** `Employee.salary` (`prisma/schema.prisma:91`) already exists as a required `Decimal` field — base compensation is not a new concept this domain introduces; Payroll's job is to *calculate periodic pay from it*, not to define it.

**Business problem this domain solves:** every domain designed so far feeds into a single question this domain must finally answer: given an employee's base salary, their attendance record, and their approved leave, what did they actually earn this period, and what is the permanent, auditable record of that calculation? No prior domain produces that output.

**Why no other domain can own it:** Attendance and Leave are both deliberately scoped to stop at "the facts" (raw presence, approved leave/balance) without computing pay — both their own sign-offs explicitly exclude payroll calculation from their boundaries (§5 of [[domain-attendance]], §5 of [[domain-leave]]). Payroll is where those facts are finally converted into money, and that conversion has its own distinct, high-stakes rules (immutability, snapshotting, financial audit) that don't belong bolted onto either upstream domain.

## 2. Business Lifecycle

- **PayrollRun creation:** `ADMIN` (HR/Finance role) initiates a run for a defined period (e.g., "January 2026"), moving through **DRAFT → PROCESSING → FINALIZED → PAID**.
- **Payslip generation:** during PROCESSING, one `Payslip` is generated per active Employee, computing gross pay, deductions, and net pay from that employee's salary, attendance, and leave data for the period.
- **Finalization — the central lifecycle rule of this domain: once a PayrollRun is `FINALIZED`, its Payslips become immutable.** No edit is permitted to a finalized Payslip. A correction to a past error is made via an **adjustment entry in a subsequent PayrollRun**, never by editing history. This mirrors standard accounting practice (never edit closed books; post correcting entries instead) and is a materially stronger rule than any prior domain's mutability — Branch/Department archiving still permits later corrections to the record itself; a finalized Payslip permits none.
- **Payment recording:** moving to `PAID` records that the calculated amounts were actually disbursed (a status transition, not a recalculation).
- **Who performs:** `ADMIN`/Finance role initiates and finalizes runs (no employee self-service action exists in this domain).
- **Who consumes:** the employee (views their own Payslip — a read concern, not a new lifecycle actor), and, in principle, external systems (bank file export, statutory filing) — both explicitly out of scope for this business-architecture review.

## 3. Relationships

**PayrollRun owns Payslips (aggregate-internal, one-to-many, cascade within a DRAFT/PROCESSING run; frozen once FINALIZED).** Each `Payslip` references `employeeId` and `payrollRunId`; exactly one Payslip per `(employeeId, payrollRunId)`.

**The central architectural decision of this domain: Payslip snapshots every input it depends on — it never live-joins to another domain's current state.** This is the escalation of a pattern already present but lower-stakes in prior domains (Branch archiving without touching historical Employee assignments; the generic `AuditLog`'s `beforeData`/`afterData` capturing point-in-time state). Here the pattern becomes a hard requirement because the consequence of getting it wrong is a financial record that silently changes after the fact:
- **Attendance:** Attendance's own effective daily status is computed on read, not stored (ADR-AT03) — which is correct for Attendance's own purposes, but means Payroll, which *does* need an immutable historical record, must call Attendance's coordinating service at run time and **snapshot the computed result** (days present/absent/late, overtime hours) into the Payslip. This is not a contradiction of ADR-AT03; it is the correct consumption pattern for a downstream domain whose own requirements (immutability) differ from Attendance's.
- **Leave:** similarly, approved unpaid-leave days for the period are read and snapshotted as a deduction line item, not referenced live.
- **Employee.salary:** the base salary value is snapshotted at generation time — if an employee's salary changes after a Payslip is finalized, that finalized Payslip must not retroactively change.
- **Department, Designation, Branch names:** because those three domains each deliberately chose "single current value, no history" (ADR-D03, ADR-DS03, ADR-B03), Employee's *current* `departmentId`/`designationId`/`branchId` cannot be trusted to reflect what was true during a past pay period — an employee transferred to a new department last month would otherwise have their January payslip silently display February's department if it live-joined instead of snapshotting. **Payslip must therefore snapshot the department/designation/branch *names* (not just IDs) as they were at generation time.** This is a direct, concrete consequence of decisions made three domains earlier in this review, surfacing here as a real requirement rather than a hypothetical — exactly the kind of downstream impact those domains' own "Impact on Future Domains" sections anticipated in the abstract.

**Reads Employment Type** to determine calculation basis; see §6 for the explicit assumption this rests on (salary period-unit) that is not yet verified.

## 4. Business Rules

**Mandatory invariants:**
- A finalized Payslip is immutable. Corrections are adjustment entries in a later run, never edits to history.
- Exactly one Payslip per `(employeeId, payrollRunId)`.
- PayrollRun periods must not overlap.
- Every monetary and organizational-context input a Payslip depends on (salary, attendance outcome, leave deduction, department/designation/branch names) is snapshotted at generation time, never live-referenced after finalization.

**Recommended practices:**
- Model Payslip earnings and deductions as a generalized child collection — `PayslipLineItem { type: EARNING | DEDUCTION, label, amount }` — rather than fixed columns (`incomeTax`, `providentFund`, `overtimePay`, ...). This avoids a schema migration every time a new deduction or earning type is needed, the same "avoid a wide, brittle schema" reasoning already applied to `AuditLog`'s generic `entityType`/`entityId` shape and `EmployeeDocument`'s generic document model.
- Tax and statutory deductions (income tax, social security, provident fund, and similar jurisdiction-specific calculations) are **explicitly not designed here** — they are complex, jurisdiction-dependent, and out of scope for this business-architecture review. The `PayslipLineItem` shape is deliberately generic enough to accommodate them later as a line item, but the *calculation rules* for any specific deduction type are a distinct future sub-domain design effort, not something this document attempts.

## 5. Architecture

- **Aggregates:** `PayrollRun` (period, status), `Payslip` (per-employee snapshot + line items).
- **Ownership:** PayrollRun owns its Payslips during DRAFT/PROCESSING; Payslip references Employee by ID but never live-joins to it for display/calculation purposes once generated (§3).
- **Repository responsibilities:** Payroll repositories own only Payroll's own persistence; they never write to Employee, Attendance, Leave, Department, Designation, or Branch.
- **Domain service responsibilities:** a Payroll processing service orchestrates, per employee, per run: read base salary (Employee) → read attendance outcome (Attendance's coordinating service) → read approved unpaid leave (Leave) → read current department/designation/branch names (for snapshotting) → compute gross/deductions/net → persist as an immutable Payslip once the run is finalized. This is the largest cross-domain read orchestration in the review so far, consuming five upstream domains' outputs in one operation.
- **Cross-domain interaction:** exclusively synchronous reads, consistent with every domain in this review; Payroll never writes to any domain it reads from.
- **What belongs inside Payroll:** the calculation, the snapshot, the immutability rule, the generalized line-item shape.
- **What does NOT belong inside Payroll:** attendance/leave business rules (read, not redefined), tax/statutory calculation logic (deferred, out of scope), department/branch governance (read-only snapshot consumer).

## 6. Future Proofing

- **What could break this design:** the calculation basis assumed here (a single periodic base salary, uniformly prorated for unpaid absence) may not suit every Employment Type — `CONTRACT` engagements, in particular, are often paid per-invoice or per-milestone rather than via a periodic payroll run at all. This is named explicitly as a real, likely gap, not hidden: this design's default assumption is that `Employee.salary` represents a **monthly** base figure (an assumption, not a verified fact — the schema field carries no unit), and that all Employment Types flow through the same periodic Payslip mechanism. If `CONTRACT` employees should instead be invoiced rather than payrolled, that is a materially different process this domain does not attempt to model.
- **Design now vs. defer:** design now — PayrollRun/Payslip aggregates, immutability rule, snapshot requirement, generalized line-item shape. Defer — tax/statutory deduction calculation logic, multi-currency support, contractor/invoice-based payment flows, automated scheduling of runs (assumed manually triggered by `ADMIN` for now).
- **Trade-off accepted:** no support today for a fundamentally different pay mechanism for non-salaried engagement types; accepted because no verified requirement specifies how those types should actually be paid, and guessing at that mechanism now risks building the wrong thing.

## 7. Challenge the Design

**Self-critique — the salary-unit assumption (monthly) is load-bearing and unverified; is it safe to proceed on it?** No design decision in this document depends on the *specific* unit being monthly rather than annual or bi-weekly — the calculation service simply needs to know the period length `Employee.salary` represents in order to prorate correctly, and that is a confirmable, low-cost fact to verify before implementation, not a structural risk to the aggregate design itself. It is flagged here as an **open question requiring stakeholder confirmation**, not silently assumed as settled (§8).

**Self-critique — is the "no tax/statutory calculation" scope cut too aggressive to call this domain implementation-ready?** For many real deployments, tax withholding is not an optional add-on but a legal requirement of any payroll system. This is acknowledged directly: **this document deliberately treats tax/statutory calculation as a distinct, later sub-domain design effort**, not because it's unimportant, but because it is genuinely a different kind of problem (jurisdiction-specific legal/regulatory rules, not an architectural question this review's methodology — business lifecycle, relationships, aggregates — is well-suited to resolve without country-specific legal input). The `PayslipLineItem` generic shape is the deliberate seam left for that future work to attach to without requiring a schema redesign.

**Alternative considered and rejected — fixed deduction columns (`incomeTax`, `pf`, `esi`, ...) instead of generic line items.** Rejected: every new deduction type would require a migration; the generic shape, already proven by `AuditLog` and `EmployeeDocument` elsewhere in this codebase, avoids that cost.

**Alternative considered and rejected — live-joining Employee/Department/Designation/Branch at Payslip *display* time instead of snapshotting.** Rejected: this is precisely the bug scenario named in §3 (a payslip silently reflecting a later department transfer) — snapshotting at generation time is the only option consistent with immutability once finalized.

**Recommendation stands:** PayrollRun/Payslip with full snapshotting, generic line items, tax logic explicitly deferred, salary-unit assumption flagged for confirmation rather than hidden.

## 8. Open Questions

1. ~~**Salary period unit** (monthly, annual, other)~~ — **Resolved (2026-09-15).** Confirmed directly with the user (acting as stakeholder) before implementation: monthly. `PayrollRun.periodMonth`/`periodYear` express a period as one calendar month (ADR-PR05).
2. **Contractor/invoice-based payment flow** for `CONTRACT` employment type — not designed here; `CONTRACT` employees flow through the same periodic Payslip mechanism as every other Employment Type in this implementation, an explicitly accepted trade-off (§6) pending a real requirement to the contrary.
3. **Tax/statutory deduction calculation rules** — explicitly out of scope; a future sub-domain design effort.
4. ~~Permission scoping~~ — **Resolved (2026-09-15).** No dedicated Finance/Payroll role exists in this system (only `ADMIN`/`MANAGER`/`EMPLOYEE`); inventing a fourth system role wasn't justified by any verified requirement, so `PayrollRun` mutations and reads follow the same `ADMIN`-only pattern as `LeaveType` and every other master-data domain (ADR-PR06). `Payslip` reads split own/any, mirroring Leave/Attendance - but unlike Leave's approval workflow, `MANAGER` does **not** get `payslip:read:any` over reports' pay: no verified requirement calls for that, and pay is more sensitive than leave status.

## 9. Deferred Decisions

| Decision | Reason for Deferral |
|---|---|
| Tax/statutory deduction calculation | Jurisdiction-specific legal complexity; distinct future sub-domain effort. |
| Multi-currency support | No verified requirement. |
| Contractor/invoice-based payment flow | Materially different process; not verified as needed, not designed here. |
| Automated/scheduled PayrollRun triggering | No verified requirement; manual `ADMIN` initiation is today's scope. |
| Payslip correction workflow beyond "adjustment in next run" | No verified requirement for a more elaborate reversal/amendment process. |

## 10. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Salary-unit assumption (monthly) is wrong for some deployments | High | Medium | Must be confirmed with stakeholders before implementation (§8); no structural change needed to fix, just a calculation-parameter confirmation. |
| Contractor engagement types may not fit the periodic-payslip model at all | Medium | Medium | Explicitly flagged (§6/§8) rather than forced into a mechanism that may not apply. |
| Tax/statutory deduction absence means this design alone is not legally sufficient for many real jurisdictions | High | High (for real-world deployment) | Explicitly out of scope by design (§4/§7); flagged as a required follow-on effort, not a silent gap. |
| Five-domain read orchestration (Employee, Attendance, Leave, Department/Designation/Branch) at run time could be a real performance concern for large employee counts | Medium | Medium | Same category of risk already named for Attendance's own computed-on-read approach; mitigate with batch-oriented processing (compute all employees in one pass, not N independent request cycles) at implementation time — a performance-engineering concern, not a structural one. |

## 11. Assumptions

- **Assumed, not verified:** `Employee.salary` represents a monthly base figure. Flagged explicitly as needing stakeholder confirmation (§7/§8) rather than treated as settled.
- Assumed all Employment Types flow through the same periodic payroll mechanism; flagged as possibly wrong for `CONTRACT` (§6).
- Assumed single-currency operation; no verified multi-currency requirement.

## 12. Impact on Future Domains

Any future domain must never violate:
1. A finalized Payslip is immutable; corrections are new adjustment entries, never edits to history.
2. Payslip snapshots all its inputs (salary, attendance outcome, leave deduction, org-context names) at generation time — it never live-joins to current Employee/Department/Designation/Branch state.
3. Tax/statutory deduction logic, when eventually designed, must attach via the generic `PayslipLineItem` shape, not force fixed schema columns.
4. Payroll never writes to Employee, Attendance, Leave, Department, Designation, or Branch.

This most directly constrains the future **Exit Management** domain (a departing employee mid-period needs a final, prorated Payslip — an explicit forward dependency this document does not resolve, mirroring how Identity's own offboarding scope was left for Exit Management to reconcile, per [[domain-identity-employee-lifecycle]] §9) and any future **Recruitment**-driven compensation-offer logic (which would read, not redefine, this domain's salary concept).

## Architecture Decision Records

**ADR-PR01 — PayrollRun/Payslip as Immutable-Once-Finalized Aggregates**
Status: Accepted; Implemented (2026-09-15)
Summary: Finalized Payslips cannot be edited; corrections are adjustment entries in a subsequent run. There is no edit endpoint for a Payslip at any status, not just at FINALIZED - the rule is enforced by omission, not a guarded update path.

**ADR-PR02 — Full Input Snapshotting at Generation Time**
Status: Accepted; Implemented (2026-09-15)
Summary: Salary, attendance outcome, leave deduction, and department/designation/branch names are all snapshotted, never live-joined post-finalization.
Consequences: Directly surfaces the cost of Branch/Department/Designation's earlier "no history" decisions (ADR-B03/ADR-D03/ADR-DS03) — those decisions remain correct and unchanged (per the standing rule against redesigning prior domains), but Payroll is where their trade-off becomes concretely visible and must be compensated for via snapshotting, not by reopening those ADRs.
Implementation note: no overtime line item is generated despite this ADR's original attendance-input framing (§3) mentioning it - `AttendanceRecord` has no overtime field or verified overtime-rate concept anywhere in this project (only `checkIn`/`checkOut` timestamps), so there was nothing verified to snapshot. Named as a known limitation, not silently dropped.

**ADR-PR03 — Generalized PayslipLineItem, Not Fixed Deduction Columns**
Status: Accepted; Implemented (2026-09-15)
Summary: Earnings/deductions modeled as a generic `{type, label, amount}` collection. Every Payslip gets one EARNING line ("Base Salary") and, when applicable, one DEDUCTION line ("Unpaid Absence (N days)").

**ADR-PR04 — Tax/Statutory Calculation Explicitly Out of Scope**
Status: Deferred
Summary: A distinct future sub-domain design effort; this domain only provides the attachment seam (ADR-PR03).

**ADR-PR05 — Salary Period Unit**
Status: Accepted; Implemented (2026-09-15)
Summary: Confirmed directly with the user (acting as stakeholder, per this review's delegated-authority process) before implementation: monthly. `PayrollRun` is keyed on `(periodMonth, periodYear)`.

**ADR-PR06 — Permission Scoping**
Status: Accepted; Implemented (2026-09-15)
Summary: `PayrollRun` (create/read/process/finalize/markPaid/delete) follows the `ADMIN`-only master-data pattern (no dedicated Finance/Payroll role exists or was justified). `Payslip` reads split own/any (mirrors Leave/Attendance), but `MANAGER` gets only `payslip:read:own`, not `payslip:read:any` over reports - a deliberate divergence from Leave's manager-visibility pattern, since no verified requirement extends pay visibility to managers and pay is more sensitive than leave status.

## Final Sign-off

**Implementation readiness:** Implemented (2026-09-15). The salary-unit assumption (ADR-PR05) was confirmed before implementation, closing this domain's most load-bearing open item. The tax/statutory scope cut (ADR-PR04) and the contractor/invoice-based payment flow (§8 item 2) remain explicitly out of scope, not silently treated as complete.

**Confidence score: 90%** — up from 78% now that the salary-unit assumption is confirmed rather than open; the remaining gap is entirely the acknowledged-and-deferred tax/statutory and contractor-flow scope cuts, not an unresolved architectural question.

**Remaining blockers:** None for the scope actually built. Tax/statutory deduction work remains an explicit follow-on effort before real-world deployment (ADR-PR04); a separate contractor/invoice-based payment flow remains undesigned if `CONTRACT` employees turn out to need one (§8 item 2); carry-forward/encashment (Leave's LV06) still blocks a fully accurate final-settlement calculation for Exit Management, not Payroll's own periodic-run scope.

**Recommended next domain:** Performance — the next domain in the roadmap once Payroll's periodic-run mechanism is in place; lower-stakes than Payroll and does not depend on any of Payroll's still-open items.
