---
Domain: Shift
Status: FINAL
Date: 2026-07-27
Depends on: docs/domain-identity-employee-lifecycle.md, docs/domain-holiday-calendar.md
---

# Domain Sign-off: Shift

## 1. Domain Overview

Shift defines an employee's **expected recurring working pattern** — start/end time and which days of the week are working days — as distinct from Holiday Calendar's dated, occasional exceptions.

**Business problem this domain solves:** Attendance (not yet designed) cannot determine "was this person late," "did they work overtime," or "was their absence on a working day" without a baseline expectation of when they're supposed to work. Without Shift, that expectation would need to be hard-coded or duplicated inside Attendance itself.

**Why no other domain can own it:** Holiday Calendar deliberately excludes recurring weekly off-days (see [[domain-holiday-calendar]] §9) — that concept belongs here, not there, because a weekly off-day recurs indefinitely while a holiday is a specific dated exception. Branch cannot own it: shift patterns vary by role/team within the same location (e.g., support staff on a night shift, corporate staff on a day shift, both at the same branch) — a branch-level default would not fit that reality without immediately needing a per-employee override anyway, so this domain assigns shift at the Employee level directly rather than introducing a Branch-level layer that would need overriding on day one.

## 2. Business Lifecycle

- **Creation:** `ADMIN` creates a named Shift (e.g., "Day Shift 9–6", "Night Shift 10pm–7am").
- **Update:** adjust times/working days (affects future Attendance calculations only, never retroactively — see §4).
- **Archive:** `status: ACTIVE | INACTIVE`, same pattern as prior domains.
- **Deletion:** hard delete only if zero Employees currently reference it.
- **Assignment:** `ADMIN` assigns a Shift to an Employee at hire or on schedule change.
- **Who consumes:** future Attendance domain (lateness/overtime/absence calculation).

## 3. Relationships

**Employee owns `shiftId`, nullable.** Unlike Department/Designation/Employment Type (mandatory), Shift assignment is optional — mirroring Branch's nullable pattern rather than Department's mandatory one. **Reasoning:** not every employee necessarily operates under a fixed-hours expectation (e.g., certain contractor or flexible-work arrangements might have no defined shift), and a verified requirement forcing every employee into a shift does not exist today. An employee with no `shiftId` is treated by future Attendance logic as having no fixed-hours expectation to check against — a safe, unsurprising default, consistent with the positive-allowlist philosophy applied elsewhere in this review.

**Single current value, no history.** Same pattern as every prior axis: reassigning a Shift overwrites the current value; no shift-change history is modeled now. Deferred per the same additive-migration reasoning used throughout.

**No relationship to Branch, Department, Designation, or Employment Type.** Shift is assigned independently — a deliberate continuation of the orthogonal-axis philosophy, extended to a fourth axis for the same reason as Designation (§3 of [[domain-designation]]): forcing shift to be scoped under Branch or Department would require a valid-combination mapping this review has repeatedly declined to build without a verified need.

**Relationship to the future Attendance domain:** Attendance reads `Employee.shiftId` → Shift's working-hours/working-days to compute expected-vs-actual. Shift itself does not compute or store any attendance outcome — ownership boundary identical in spirit to Employment Type's relationship with Leave/Payroll (§3 ADR-ET03): the classification lives here, the consuming business logic lives in the domain that needs it.

## 4. Business Rules

**Mandatory invariants:**
- A Shift's working days must be a non-empty subset of the seven weekdays.
- A Shift can never be hard-deleted while referenced by any Employee.
- Changing a Shift's times/working days affects only future Attendance calculations; it must never retroactively alter the interpretation of already-recorded attendance (a data-integrity concern for the future Attendance domain to honor, flagged here because it originates from this domain's mutability).

**Recommended practices:**
- **Overnight (midnight-crossing) shifts must be explicitly supported by the data model now, not deferred.** Unlike most deferred items in this review, this is deliberately designed now rather than later: night shifts (e.g., 10pm–7am) are a common, foreseeable HRMS requirement, not a speculative one, and getting the day-boundary semantics wrong at the schema level would corrupt Attendance's day-attribution logic in a way that is expensive to retroactively fix (already-computed attendance records would need reinterpretation, not just a schema migration). Recommendation: a Shift where `endTime < startTime` is interpreted as crossing midnight (the shift belongs to the calendar day it starts on); this rule should be encoded once, here, rather than reimplemented ad hoc inside Attendance.
- Keep the aggregate minimal: name, `startTime`, `endTime`, `workingDays`, `status`. Resist adding break-time deduction, grace-period-for-lateness, or rotation/rostering fields — those are Attendance-calculation concerns (grace period) or a materially bigger scheduling-engine concern (rotation) that no verified requirement justifies building now.

## 5. Architecture

- **Aggregate boundaries:** Shift owns only its own time/working-day definition — no embedded Employee list, no attendance calculation logic.
- **Ownership:** Employee owns the nullable `shiftId` FK.
- **Repository responsibilities:** Shift repository owns Shift's own persistence only.
- **Cross-domain interaction:** synchronous direct read, same established pattern (ADR-B06/ADR-D06/etc.) — Attendance resolves `Employee.shiftId` → Shift definition when computing daily outcomes.
- **What belongs inside Shift:** time boundaries, working-day pattern, the midnight-crossing interpretation rule.
- **What does NOT belong inside Shift:** lateness grace periods, overtime thresholds, absence/attendance outcomes, rotation/rostering schedules — all future Attendance-domain concerns.
- **Future extension point:** once Branch gains a `timezone` field (explicitly deferred in [[domain-branch]]'s Deferred Decisions table), Shift's `startTime`/`endTime` will need to be interpreted in that timezone for organizations spanning multiple time zones. Not built now — no verified multi-timezone requirement exists — but flagged explicitly as a real, known gap rather than an oversight.

## 6. Future Proofing

- **What could break this design:** a verified requirement for rotating/rostered shifts (an employee's shift changes week-to-week on a defined pattern) would require a materially different model — a schedule/roster aggregate referencing multiple Shifts over time, not a single static `shiftId`. Not built now (no verified requirement); this design's single-current-value approach is the additive base a future rostering feature would extend, not replace.
- **Design now vs. defer:** design now — overnight-shift support (justified above as foreseeable, not speculative), minimal aggregate, nullable assignment. Defer — rotation/rostering, timezone-aware interpretation, break-time/grace-period fields.
- **Trade-off accepted:** no support for an employee whose working pattern changes week-to-week without manual reassignment; acceptable because no verified requirement demands it, and static shift assignment is the common case this system should serve first.

## 7. Challenge the Design

**Self-critique — is designing overnight-shift support now, while deferring almost everything else, an inconsistent application of YAGNI?** No — the distinction is foreseeability and retrofit cost, not "build everything possible." Rotation/rostering is a genuinely bigger, separate feature with its own aggregate shape that most organizations do not need (deferred safely). Overnight-shift day-boundary semantics is a small, cheap-to-decide-now detail baked into the same fields already being designed (`startTime`/`endTime`) — deferring it would not reduce scope, it would just mean deciding it later under worse conditions (after Attendance already exists and depends on an ambiguous interpretation).

**Alternative considered and rejected — Shift assigned at Branch or Department level with per-Employee override.** Rejected (§3): the override would be needed immediately in practice (different roles at the same branch commonly work different shifts), so the base-level assignment would add a layer of indirection without reducing the need for per-employee assignment — pure added complexity.

**Alternative considered and rejected — building shift rotation/rostering now since "shifts obviously rotate in real companies."** Rejected: true for some organizations, not verified as a requirement for this one; the single-current-value model is the correct additive foundation, and building a rostering engine speculatively would be exactly the kind of "common in other HRMS products but not asked for here" scope the standing project philosophy explicitly warns against.

**Recommendation stands:** minimal Shift aggregate, nullable Employee-level assignment, overnight-shift semantics decided now, rotation/timezone explicitly deferred.

## 8. Open Questions

1. ~~Permission scoping for Shift management — same unresolved pattern as prior domains.~~ **Resolved (2026-09-15) — see ADR-SH05.**
2. Whether a default/fallback Shift should exist for employees with no assignment, or whether "no shift = no fixed-hours expectation" (current decision) is sufficient — recommend the latter unless Attendance's own design surfaces a reason otherwise.

## 9. Deferred Decisions

| Decision | Reason for Deferral |
|---|---|
| Shift rotation / rostering | No verified requirement; materially larger feature, additive on top of this design if ever needed. |
| Timezone-aware shift interpretation | Depends on Branch's own deferred `timezone` field; no verified multi-timezone requirement today. |
| Break-time deduction / lateness grace period | Belongs to Attendance's calculation rules, not Shift's own definition. |
| Shift-change history | Consistent with every other axis in this review; additive later if needed. |

## 10. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Overnight-shift semantics decided here are wrong or incomplete once Attendance's real calculation logic is designed | Medium | Low | Interpretation rule is explicit and documented (§4); Attendance's own sign-off should re-verify it fits before finalizing. |
| No rotation support may prove insufficient for shift-heavy organizations (e.g., manufacturing, support) | Medium | Medium | Explicitly deferred, additive path named (§6); not a blocker for the common static-shift case. |
| Nullable `shiftId` means some employees have literally no attendance expectation modeled | Low | Low | Accepted default (§3); revisit only if a verified requirement demands universal shift coverage. |

## 11. Assumptions

- Assumed (industry practice) that most employees hold one static, recurring shift pattern rather than a rotating schedule — a reasonable default for the initial system scope, not a verified customer requirement.
- Assumed no current multi-timezone operating requirement, consistent with Branch's own deferred timezone field.

## 12. Impact on Future Domains

Any future domain must never violate:
1. `Employee.shiftId` remains nullable, single-current-value.
2. Shift never embeds attendance-outcome logic (lateness/overtime/absence) — that lives entirely in Attendance.
3. The midnight-crossing interpretation rule (§4) is the single authoritative definition Attendance must consume, not reimplement.
4. Shift is never hard-deleted while referenced.

This most directly constrains the future **Attendance** domain, which is the primary and near-immediate consumer of this domain's data.

## Architecture Decision Records

**ADR-SH01 — Shift as an Independent, Employee-Level Aggregate**
Status: Accepted
Summary: Shift is assigned directly to Employee, not nested under Branch or Department.

**ADR-SH02 — Nullable shiftId, Single Current Value**
Status: Accepted
Summary: Employees may have no shift assigned; reassignment overwrites, no history.

**ADR-SH03 — Overnight Shift Semantics Decided Now**
Status: Accepted
Summary: `endTime < startTime` is interpreted as crossing midnight, attributed to the starting calendar day.
Consequences: Attendance must consume this interpretation rather than defining its own.

**ADR-SH04 — Rotation/Rostering Explicitly Deferred**
Status: Deferred
Summary: No verified requirement for rotating schedules; single static shift per employee is today's scope.

**ADR-SH05 — Permission Scoping**
Status: Accepted; Implemented (2026-09-15)
Summary: `ADMIN`-only mutations (`shift:create/update/delete`), `shift:read` granted to every role — the same default every prior domain in this review has resolved to (Branch ADR-B07, Department ADR-D08, Designation ADR-DS06, Holiday Calendar ADR-HC06). No verified requirement surfaced to diverge from it here.

## Final Sign-off

**Implementation readiness:** Implemented (2026-09-15). No structural blockers.

**Confidence score: 90%**

**Implementation notes:**
- `startTime`/`endTime` implemented as `"HH:mm"` strings (24-hour, regex-validated at the Zod boundary), not `DateTime` — Postgres/Prisma have no first-class time-only type in this stack, and a `DateTime` would force an arbitrary date component onto a value that is semantically time-of-day only. This is an implementation detail, not a divergence from this document's own recommendation (§4 names the fields, not their storage type).
- The overnight-shift interpretation rule (ADR-SH03) is implemented as a single exported pure function, `shiftService.isOvernightShift({ startTime, endTime })`, comparing the two zero-padded `"HH:mm"` strings directly (lexicographic order agrees with chronological order for this format). This is the "encoded once, here" primitive §4 asks for — scoped the same way Holiday Calendar's `isDateHolidayInCalendar` was (ADR-HC04): the primitive only, not a full day-attribution resolver, since no consumer (Attendance) exists yet.
- `Employee.shiftId` is nullable with `onDelete: Restrict` (ADR-SH02, §4's "never hard-deleted while referenced" invariant), mirroring `branchId`'s optional-FK treatment rather than `departmentId`/`designationId`'s mandatory one.

**Remaining blockers:** None.

**Recommended next domain:** Attendance — the direct consumer of both Holiday Calendar and Shift, and the point where their combined data actually produces a business outcome (present/absent/late/overtime).
