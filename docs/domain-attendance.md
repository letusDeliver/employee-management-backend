---
Domain: Attendance
Status: FINAL — with open questions on regularization workflow and multi-punch tracking
Date: 2026-07-27
Depends on: docs/domain-identity-employee-lifecycle.md, docs/domain-branch.md, docs/domain-holiday-calendar.md, docs/domain-shift.md
---

# Domain Sign-off: Attendance

## 1. Domain Overview

Attendance records **the fact of an employee's presence on a given date** — check-in/check-out times and a resulting daily status (Present, Absent, Late, Half-Day) — and reconciles that fact against what Shift and Holiday Calendar say should have happened.

**Business problem this domain solves:** every domain designed so far in this Phase 2 sequence (Branch, Department, Designation, Employment Type, Holiday Calendar, Shift) has been master data — classification, not activity. Attendance is the first domain that records something that *happened*, daily, at scale. It exists to answer "did this person work today, and how does that compare to their expected schedule" — a question no prior domain can answer alone, since Shift only defines expectation and Holiday Calendar only defines exceptions; neither records actual occurrence.

**Why no other domain can own it:** Shift and Holiday Calendar are correctly scoped as *expectation* domains (§1 of their own sign-offs) — folding actual daily presence facts into either would conflate "what should happen" with "what did happen," the same category error that would occur if Employee tried to own its own audit history instead of relying on the generic `AuditLog`.

## 2. Business Lifecycle — and a Structural Shift From Prior Domains

Every domain from Branch through Shift has followed the same lifecycle shape: create → update → archive (status) → hard-delete-if-unreferenced. **Attendance breaks that shape**, and this needs to be named explicitly rather than forced into the same mold.

- **Creation:** an `AttendanceRecord` (one per employee per calendar date) is created by a check-in action, typically self-service (the employee marks their own check-in/check-out), though administrative creation (HR marking attendance manually for an exception) must also be supported.
- **Update:** correction of a check-in/check-out time (e.g., forgotten check-out) by `ADMIN`/HR. This is the domain's most business-sensitive mutation and should be tracked via the existing generic `AuditLog` model (`entityType: "AttendanceRecord"`), the same reusable mechanism already used for Employee and User mutations — not a bespoke Attendance-specific correction-history table.
- **No archive/status lifecycle in the Branch/Department sense.** An attendance record is a historical fact about a specific date; it is never "deactivated." It is either correct or corrected — there is no third state.
- **No hard-delete-if-unreferenced rule, because nothing references an AttendanceRecord by FK the way Employee references Branch.** Attendance records are closer in nature to `AuditLog` rows — an append-mostly historical ledger — than to Branch/Department's referenced-master-data shape. Deletion of a genuinely erroneous record (as opposed to correction) should be rare and itself audit-logged, not a routine lifecycle step.
- **Who consumes:** future Leave domain (to distinguish an approved-leave day from a genuine absence — see §3), future Payroll domain (attendance outcomes feed pay calculation, particularly for hourly/part-time employment types).

## 3. Relationships

**AttendanceRecord → Employee: mandatory FK, one record per (employeeId, date).** The uniqueness constraint is itself a business invariant (§4) — an employee cannot have two attendance records for the same date.

**AttendanceRecord reads Shift and Holiday Calendar; it does not embed or duplicate them.** Determining whether a given date was even a working day (needed to distinguish "absent" from "was a holiday" or "was a weekly off") requires the resolution chain already flagged in Holiday Calendar's sign-off (§5 of [[domain-holiday-calendar]]) plus a new equivalent check against Shift's working-days pattern. **Decision: this resolution is owned by a coordinating "Attendance Calculation Service"**, not duplicated inline wherever attendance is computed — this is the concrete point where the reusable-query recommendation from Holiday Calendar's sign-off (ADR-HC04) actually gets consumed, rather than remaining a hypothetical for "whoever designs Attendance next."

**Relationship to the future Leave domain — the central architectural decision of this domain.** When an employee has an approved leave for a date, that date's effective status should read as "On Leave," not "Absent." Two shapes were considered for how this reconciliation happens:

- **Option A (chosen): Attendance stores only raw presence facts (check-in/check-out, or their absence); "effective daily status" — Present / Absent / Late / Half-Day / On Leave / Holiday / Week-Off — is a *computed* value, resolved at read time by cross-referencing Attendance + Leave + Holiday Calendar + Shift. No domain writes into another domain's stored data.
- **Option B (rejected): Leave, upon approval, writes an "On Leave" status directly into that date's AttendanceRecord.**

**Reasoning for choosing A over B:** every cross-domain interaction accepted so far in this entire review (Branch/Department/Designation/Shift existence checks, the Identity domain's FK-violation pattern) has been a *synchronous read* — no domain has ever been designed to write into another domain's aggregate. Option B would introduce the first cross-domain *write* in the architecture, which is a materially bigger coupling commitment than anything built so far, and no verified requirement (e.g., a proven read-time performance problem at real scale) justifies that leap yet. Option A preserves the existing "read, don't write across boundaries" discipline and keeps Attendance and Leave decoupled — Leave can be designed, and its own approval workflow can evolve, without Attendance's schema ever needing to change to accommodate it.
*Classification: recommendation, explicitly reasoned against the alternative, not asserted as the only possible answer — this is exactly the kind of decision the Discussion Rules require surfacing with trade-offs rather than picking silently.*

**Trade-off accepted:** computing "effective status" for a date always requires a small cross-domain read (Attendance + Leave + Holiday + Shift) rather than one table lookup. Accepted because this read is bounded (one employee, one date, or one employee, one date range for a report) and is exactly the kind of read a coordinating service (§2, §5) should own once — not a systemic performance risk absent evidence otherwise.

## 4. Business Rules

**Mandatory invariants:**
- Exactly one `AttendanceRecord` may exist per `(employeeId, date)` pair.
- A record for a date that Holiday Calendar or Shift's working-days pattern marks as non-working is not required to exist; its absence is correctly interpreted as Holiday/Week-Off, not Absent (this is why the computed-status service, not raw record absence, must be the thing any consumer queries — see §3).
- Corrections to an existing record must be tracked via `AuditLog` (`beforeData`/`afterData`), not silently overwritten with no trace.

**Recommended practices:**
- Start with single check-in/single check-out per day (one punch pair). Defer multi-punch (break-tracking, multiple ins/outs per day) — see §7.
- Lateness/overtime should be computed relative to the employee's assigned Shift (if any); an employee with no Shift assigned (`shiftId` nullable per [[domain-shift]] §3) has presence/absence tracked but no lateness/overtime computed, consistent with the "no shift = no fixed-hours expectation" default already decided.

## 5. Architecture

- **Aggregate:** `AttendanceRecord` — raw facts only (employeeId, date, checkIn, checkOut). No embedded Shift/Holiday/Leave data.
- **Ownership:** Attendance repository owns only AttendanceRecord persistence; it never writes to Employee, Shift, Holiday Calendar, or Leave.
- **Coordinating service ("Attendance Calculation Service"):** the one place that reads Shift + Holiday Calendar + Leave (once designed) + raw AttendanceRecord to produce an *effective daily status*. This service does not persist its output by default (§3, Option A) — it computes on read. This is the first domain in the review to need an explicit read-side coordinating service beyond a simple existence check, and it is named here deliberately so Leave's own design does not reinvent it.
- **Cross-domain interaction:** synchronous reads only, consistent with every prior domain; no cross-domain writes (§3).
- **What belongs inside Attendance:** raw check-in/check-out facts, the per-date uniqueness invariant, correction audit trail.
- **What does NOT belong inside Attendance:** leave-day determination (Leave's own approved-leave data, read not duplicated), holiday/week-off determination (Holiday Calendar/Shift, read not duplicated), overtime pay calculation (Payroll's concern, once designed, consuming Attendance's computed output).

## 6. Future Proofing

- **What could break this design:** a verified requirement for real-time biometric/geofenced check-in (hardware/device integration) would add a new ingestion path but would not change the core `AttendanceRecord` shape — additive, not a redesign. A verified requirement for precise multi-break tracking (e.g., statutory break-compliance logging for hourly workers) would require moving from single check-in/check-out to a punch-event log — a bigger structural change, named explicitly here as a real future fork, not hidden.
- **Design now vs. defer:** design now — single daily record, per-date uniqueness, computed (not stored) effective status, audit-logged corrections. Defer — multi-punch/break tracking, biometric/device ingestion, regularization approval workflow (an employee requesting a correction and a manager approving it — no approval-workflow infrastructure exists anywhere in this codebase yet, so this is deferred pending that broader capability, not specific to Attendance).
- **Trade-off accepted:** corrections today are a direct `ADMIN`/HR edit, not a request-and-approve workflow. Accepted because no approval-workflow domain has been designed anywhere in this review yet; building one just for Attendance would be premature and inconsistent with the rest of the system's current capabilities.

## 7. Challenge the Design

**Self-critique — is computing effective status on every read, rather than storing it, going to become a real performance problem?** Possibly, at large scale (e.g., a company-wide monthly attendance report for thousands of employees × 30 days). This is named honestly as a risk (§8/§9), not dismissed. The recommended response if it materializes is a **read-model/cache**, populated by the coordinating service and invalidated on the relevant writes (Attendance correction, Leave approval, Holiday Calendar change) — but building that cache now, without a demonstrated performance problem, would be speculative infrastructure the project's standing YAGNI philosophy explicitly warns against. The additive path (add a cache later) is preserved by today's design; nothing here blocks it.

**Alternative considered and rejected — Leave writes into Attendance on approval (Option B, §3).** Rejected for the reasons in §3: it would be the first cross-domain write in the entire architecture, a bigger coupling commitment than the problem justifies today.

**Alternative considered and rejected — multi-punch (event-log) model from day one.** Rejected: adds real complexity (break-duration rules, multiple in/out pairs per day) with no verified requirement demanding it; single check-in/check-out serves the common salaried-office case this system is being built for first.

**Recommendation stands:** raw-fact AttendanceRecord, computed (not stored) effective status via a coordinating service, audit-logged corrections, multi-punch and regularization workflow explicitly deferred.

## 8. Open Questions

1. Regularization workflow (employee-requested correction + manager approval) — deferred pending a general approval-workflow capability not yet designed anywhere in this system.
2. Multi-punch/break tracking — deferred; revisit if a verified statutory or operational requirement emerges.
3. Whether computed effective status needs a caching/read-model layer — deferred until a real performance problem is demonstrated (§7).

## 9. Deferred Decisions

| Decision | Reason for Deferral |
|---|---|
| Multi-punch (break-tracking) event log | No verified requirement; single check-in/check-out serves the common case. |
| Biometric/geofenced device ingestion | No verified requirement, no existing hardware-integration infrastructure. |
| Regularization approval workflow | No approval-workflow capability exists anywhere in this system yet; broader than Attendance alone. |
| Effective-status caching/read-model | Only justified once a real, demonstrated performance problem exists. |

## 10. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Computed-on-read effective status becomes a performance bottleneck at scale | Medium | Medium | Named explicitly (§7); additive cache/read-model path preserved, not blocked by today's design. |
| Direct-edit corrections without an approval workflow could be misused or under-scrutinized | Low | Low | Mitigated by mandatory `AuditLog` tracking (§2, §4) — every correction is visible after the fact even without a pre-approval gate. |
| Single check-in/check-out may prove insufficient for hourly/statutory break-compliance needs | Medium | Low | Explicitly deferred with the structural fork named (§6); not a silent gap. |

## 11. Assumptions

- Assumed (industry practice) that most organizations using this system operate salaried, single-shift attendance tracking rather than statutory break-by-break compliance logging — a reasonable initial scope, not a verified requirement.
- Assumed no current requirement for biometric/hardware attendance capture.

## 12. Impact on Future Domains

Any future domain must never violate:
1. Attendance never receives cross-domain writes from Leave or any other domain — reconciliation happens by read, in the coordinating service, not by mutation.
2. Effective daily status is a computed value, not a source of truth stored redundantly in multiple places.
3. Corrections are always audit-logged via the generic `AuditLog` model.
4. One `AttendanceRecord` per `(employeeId, date)`.

This most directly constrains the future **Leave** domain (must expose an "approved leave for employee X on date Y" query for the coordinating service to consume, and must never attempt to write into Attendance) and the future **Payroll** domain (which will read Attendance's computed effective status, particularly overtime/absence data, as an input to pay calculation).

## Architecture Decision Records

**ADR-AT01 — Attendance as a Raw-Fact Ledger, Not Master Data**
Status: Accepted
Summary: AttendanceRecord breaks the Branch/Department lifecycle mold; it is an append-mostly historical ledger, closer in nature to `AuditLog` than to prior master-data domains.

**ADR-AT02 — One Record Per (Employee, Date)**
Status: Accepted
Summary: Enforced uniqueness invariant.

**ADR-AT03 — Effective Status Computed on Read, Not Stored (Leave Reconciliation)**
Status: Accepted
Summary: Attendance never receives writes from Leave; a coordinating service computes effective status by reading Attendance + Leave + Holiday Calendar + Shift together.
Consequences: No cross-domain write pattern is introduced anywhere in this architecture. A future caching layer is the additive answer if performance ever demands it.

**ADR-AT04 — Corrections Tracked via Generic AuditLog**
Status: Accepted
Summary: Reuses the existing `AuditLog` model rather than a bespoke correction-history mechanism.

**ADR-AT05 — Single Check-in/Check-out, Multi-Punch Deferred**
Status: Deferred (base case accepted, extension deferred)
Summary: One punch pair per day is today's scope; break-level event logging is a named future fork, not built now.

## Final Sign-off

**Implementation readiness:** Ready, with the explicit understanding that Leave's design (next in sequence after Payroll's prerequisites, per the dependency graph) must honor ADR-AT03's read-only constraint.

**Confidence score: 82%** — the lowest so far in this review, reflecting the genuine open performance question (§7/§10) and the not-yet-designed Leave domain that this domain's central decision (ADR-AT03) depends on being honored correctly later.

**Remaining blockers:** None structural. Confirm ADR-AT03 is honored when Leave is designed next; revisit caching only if a real performance problem emerges post-implementation.

**Recommended next domain:** Leave — the domain whose design must directly honor the read-only reconciliation contract just established here.
