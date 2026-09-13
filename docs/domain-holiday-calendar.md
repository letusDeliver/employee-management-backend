---
Domain: Holiday Calendar
Status: Implemented (2026-09-13)
Date: 2026-07-27
Depends on: docs/domain-identity-employee-lifecycle.md, docs/domain-branch.md
---

# Domain Sign-off: Holiday Calendar

## 1. Domain Overview

Holiday Calendar defines **which dates are non-working for a given part of the organization** — public holidays, national holidays, and company-observed holidays. It exists so Attendance (not designed yet) and Leave (not designed yet) can both answer "is this date a holiday" from one authoritative source instead of each inventing its own notion of it.

**Business problem this domain solves:** holidays vary by geography (a branch in India and a branch in the US do not share the same public holidays), so a single hard-coded or global list cannot serve a multi-location organization. Without a dedicated domain, holiday logic would either be duplicated inside Attendance and Leave independently (drifting out of sync) or hard-coded, defeating the purpose of Branch being a first-class, location-aware domain in the first place.

**Why no other domain can own it:** Branch represents *where*, not *when things are closed* — folding holiday dates directly into Branch would violate Branch's own decision to stay a thin, minimal aggregate (see [[domain-branch]] §2, Aggregate Boundaries). Attendance and Leave will both *consume* holiday data but neither should own it, for the same reason neither should own Department or Designation — a shared classification used by multiple domains belongs in its own domain, not inside the first consumer that happens to need it.

**Note on sequencing:** this domain directly fulfills an item explicitly flagged as deferred in the Branch sign-off's Deferred Decisions table — "timezone/statutory/holiday-calendar fields on Branch." This is the moment that deferred item is picked back up, not a new idea introduced out of sequence.

## 2. Business Lifecycle

- **HolidayCalendar creation:** `ADMIN` creates a named calendar (e.g., "India Public Holidays", "US Public Holidays"). A calendar is a reusable container, not a per-year object — see §3 for why.
- **Holiday entry management:** `ADMIN` adds/edits/removes individual `Holiday` entries (a specific date + name, e.g., `2026-08-15 — Independence Day`) within a calendar. This is a routine, frequent action (calendars are updated at least annually as new years' dates are published).
- **Calendar assignment:** `ADMIN` assigns a HolidayCalendar to one or more Branches (§3).
- **Archive:** `status: ACTIVE | INACTIVE` on the HolidayCalendar itself, mirroring the Branch/Department/Designation pattern.
- **Deletion:** a HolidayCalendar can never be hard-deleted while any Branch references it. Individual `Holiday` entries within a calendar carry no such restriction — they can be freely added/edited/removed since no other domain holds a direct reference to a specific `Holiday` row (consumers query by date, not by Holiday ID).
- **Who consumes:** future Attendance domain (a holiday date is not counted as an absence even with no check-in), future Leave domain (a holiday date is excluded from leave-day deduction).

## 3. Relationships

**HolidayCalendar → Holiday: aggregate-internal, one-to-many, cascade.** `Holiday` entries (date, name, optional flag — see §5) exist only within a HolidayCalendar and are deleted along with it. This mirrors the existing `Employee` → `EmployeeDocument` cascade pattern (`onDelete: Cascade`, `prisma/schema.prisma:115`) — a verified precedent for exactly this parent-owns-children-within-one-aggregate shape.

**Branch → HolidayCalendar: cross-aggregate reference, optional.** `Branch.holidayCalendarId` (nullable) — many Branches can share one HolidayCalendar (e.g., all India branches point to the same "India Public Holidays" calendar); a Branch without an assigned calendar simply has no company/public holidays applied for Attendance/Leave purposes (weekly off-days like Saturday/Sunday are a separate concept, owned by the future Shift domain, not this one — see §9).
*Classification: recommendation. Nullable rather than mandatory because no verified requirement forces every Branch to have a calendar from day one, and treating "no calendar assigned" as "no holidays" is a safe, unsurprising default — consistent with the positive-allowlist philosophy (absence of data means no special treatment, not an error state).*

**Why a calendar is year-agnostic, not a new object per year.** A calendar is a *named container* that accumulates dated `Holiday` entries over time (new rows added each year as dates are published), rather than creating a new `HolidayCalendar` row annually (e.g., "India Holidays 2026", "India Holidays 2027"). This avoids re-pointing every Branch's `holidayCalendarId` every January purely to add next year's dates — a real operational cost that a per-year-object design would impose for no benefit, since the *set of branches observing a given regional calendar* rarely changes even though the *dates* change annually.

**No relationship to Department or Designation.** Holidays are a function of location (Branch) and, in principle, could also vary by Employment Type or by individual employee (religious/optional holidays) — see §9 for why that is deferred, not built now.

## 4. Business Rules

**Mandatory invariants:**
- A `Holiday` entry's date must be unique within its own calendar (no duplicate dates in one calendar).
- A HolidayCalendar can never be hard-deleted while referenced by any Branch.
- Deactivating a HolidayCalendar never deletes its Holiday entries or unassigns it from Branches automatically — deactivation is a signal that the calendar should not be assigned to *new* branches going forward, not a retroactive change (positive-allowlist principle applied to assignment, same as Branch/Department/Designation).

**Recommended practices:**
- Keep `Holiday` entries minimal: date, name, and an `isOptional` flag (for the common "restricted/optional holiday" pattern — see §9) — resist adding region/state-level sub-scoping within a single calendar; if that granularity is needed, model it as a separate calendar instead (keeps the aggregate simple).
- Holiday name should be human-readable and non-empty, but is not required to be unique across dates (two different named observances could theoretically fall on the same imported date before dedup — though the date-uniqueness rule above prevents true duplicates within one calendar).

**Scalability concerns:** low. A calendar has on the order of 10-20 entries per year; even accumulated over many years this remains a small dataset with no pagination concerns.

## 5. Architecture

- **Aggregate boundaries:** `HolidayCalendar` is the aggregate root; `Holiday` is a child entity that exists only within it (no independent identity meaningful outside its parent calendar, no other domain references a `Holiday` row directly).
- **Ownership:** Branch owns the `holidayCalendarId` FK (cross-aggregate reference), mirroring how Employee owns `branchId`/`departmentId`/`designationId` — the referencing side always lives on the "many" or "consuming" aggregate, never embedded into the referenced aggregate.
- **Repository responsibilities:** HolidayCalendar repository owns calendar CRUD and holiday-entry CRUD within a calendar; it never queries Branch or Employee.
- **Domain service responsibilities:** enforce date-uniqueness within a calendar; enforce hard-delete-only-if-unreferenced-by-Branch; provide the query "is date X a holiday for calendar Y" as the single reusable read operation every future consumer (Attendance, Leave) should call rather than re-implementing date matching independently.
- **Cross-domain interaction — the first multi-hop synchronous read chain in this review.** Resolving "is today a holiday for this employee" requires: Employee → `branchId` → Branch → `holidayCalendarId` → HolidayCalendar → Holiday entries for the date. This is three hops deep, one more than any prior domain's cross-domain read. **Recommendation:** this resolution chain should be exposed as a single reusable query (e.g., "is this employee's location observing a holiday on this date") owned by a coordinating service, rather than having Attendance and Leave each independently walk Employee → Branch → HolidayCalendar — the same "don't duplicate cross-domain orchestration logic" principle already applied to `auth.service.js`'s `register()` orchestration in the Identity domain.
*Classification: recommendation, flagged now so that whichever domain (Attendance or Leave) is designed next does not silently duplicate this resolution logic.*

## 6. Future Proofing

- **What could break this design:** a verified requirement for holidays that vary by Department or Designation (uncommon, but not impossible — e.g., a manufacturing floor with different holiday observance than corporate staff at the same branch) would require moving the calendar assignment from Branch-level to a more granular scope. Not built now; the additive path is adding a calendar-assignment override at the Employee level without changing HolidayCalendar's own structure.
- **Design now vs. defer:** design now — HolidayCalendar/Holiday aggregate, Branch-level assignment, the reusable resolution-query recommendation. Defer — per-employee optional/restricted holiday elections, sub-branch calendar overrides, historical "what calendar applied on this past date" tracking (if a Branch's calendar assignment ever changes, past Attendance/Leave records should arguably freeze their original resolution — a snapshot concern for those future domains, not this one).
- **Trade-off accepted:** Branch-level granularity is coarser than per-employee granularity; accepted because no verified requirement demands finer granularity today, and the additive path (per-employee override) does not require restructuring this domain.

## 7. Challenge the Design

**Self-critique — is Branch-level calendar assignment too coarse for the "optional/restricted holiday" pattern common in some regions (e.g., an employee picks 2 of 5 optional holidays)?** This is a real, common HR pattern (particularly in Indian HRIS systems) that this design does not fully solve — the `isOptional` flag on `Holiday` marks which entries are elective, but *which employees elected which optional holidays* is not modeled here; that would require an Employee-level selection record, which belongs more naturally to the future Leave domain (an elected optional holiday behaves like a specific, pre-approved leave day) than to Holiday Calendar itself. Recommendation: Holiday Calendar's job ends at marking a date as "optional" vs. "mandatory"; per-employee election tracking is explicitly deferred to Leave's design.

**Alternative considered and rejected — a new HolidayCalendar row per year.** Rejected in §3: forces annual re-assignment of every Branch's reference for no benefit, when accumulating dated entries in one long-lived calendar achieves the same result with less operational churn.

**Alternative considered and rejected — holidays as a field on Branch itself (embedded JSON array of dates).** Rejected: violates Branch's own settled decision to remain a thin aggregate (Branch sign-off §2), and would prevent the many-Branches-share-one-calendar reuse this design provides — embedding would force duplicate holiday data across every branch in the same region.

**Recommendation stands:** HolidayCalendar/Holiday as a small aggregate, Branch-level optional assignment, with the multi-hop read-chain resolution explicitly flagged for whoever designs Attendance/Leave next.

## 8. Open Questions

1. Per-employee optional/restricted holiday election — explicitly deferred to Leave's design (§7), not resolved here.
2. **Resolved (2026-09-13):** Permission scoping — `ADMIN`-only mutations (calendar CRUD and holiday-entry CRUD, since entries are aggregate-internal), `holidayCalendar:read` granted to every role. Same resolution as Branch/Department/Designation.

## 9. Deferred Decisions

| Decision | Reason for Deferral |
|---|---|
| Per-employee optional holiday election tracking | Belongs more naturally to the future Leave domain; not required for Holiday Calendar's own core purpose. |
| Sub-branch (department/designation-level) calendar overrides | No verified requirement; additive if it emerges. |
| Historical snapshot of "which calendar applied on a past date" if Branch's assignment changes | Only matters once Attendance/Leave exist and need retroactive consistency; those domains' concern, not this one's. |
| Weekly off-days (e.g., Saturday/Sunday as non-working) | Explicitly out of scope for Holiday Calendar — this is a recurring-schedule concept that belongs to the future Shift domain, not a dated-holiday concept. |

## 10. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Multi-hop read chain (Employee→Branch→HolidayCalendar→Holiday) duplicated independently by Attendance and Leave | Medium | Medium | Explicit recommendation (§5) for a single shared resolution query; flag for whoever designs Attendance next. |
| Optional/restricted holiday election left unmodeled | Low | Medium | Explicitly deferred to Leave (§7); not a Holiday Calendar gap so much as a boundary decision. |
| Branch without an assigned calendar silently has zero holidays, which could be mistaken for a bug rather than the intended default | Low | Low | Positive-allowlist default documented explicitly here and should be documented again in Attendance/Leave's own sign-offs. |

## 11. Assumptions

- Assumed (industry practice) that holiday sets are primarily location-driven (public/national holidays), which is why Branch is the assignment anchor rather than Department, Designation, or Employment Type.
- Assumed that calendar/holiday data entry is a low-frequency, small-volume administrative task (updated ~annually), justifying the low scalability concern in §4.

## 12. Impact on Future Domains

Any future domain must never violate:
1. HolidayCalendar/Holiday remain a small, Branch-referenced aggregate — not embedded into Branch, not duplicated per-branch.
2. Branch's `holidayCalendarId` is optional; absence means "no holidays applied," never an error.
3. The Employee→Branch→HolidayCalendar resolution should be exposed as one reusable query, not re-implemented independently by each consumer.
4. Per-employee optional-holiday election, if built, belongs to Leave, not to this domain.

This most directly constrains the future **Attendance** and **Leave** domains, both of which must consume this domain's holiday-resolution query rather than inventing their own.

## Architecture Decision Records

**ADR-HC01 — HolidayCalendar/Holiday as a Dedicated Domain**
Status: Accepted
Summary: Holidays are governed centrally, not duplicated inside Attendance/Leave.

**ADR-HC02 — Calendar is Year-Agnostic, Accumulates Dated Entries**
Status: Accepted
Summary: One long-lived named calendar per region, not a new object per year.

**ADR-HC03 — Branch-Level Optional Assignment**
Status: Accepted
Summary: `Branch.holidayCalendarId` is nullable; many branches may share one calendar.
Consequences: This is an additive field on the already-finalized Branch aggregate. It does not contradict any accepted Branch ADR (B01–B08) — it fulfills the item explicitly named in Branch's own Deferred Decisions table. No superseding ADR is required; this is documented as an extension, not a redesign.

**ADR-HC04 — Reusable Holiday-Resolution Query**
Status: Accepted (recommendation); Implemented (2026-09-13) — `holidayCalendarService.isDateHolidayInCalendar(holidayCalendarId, date)` is the calendar-level primitive this domain owns. The fuller Employee→Branch→HolidayCalendar chain remains deliberately unbuilt — no Attendance/Leave consumer exists yet to call it, and building it speculatively would be exactly the kind of unused orchestration code this domain's own §5 warns against. Still flagged as a job for whichever of Attendance/Leave is implemented next.

**ADR-HC05 — Per-Employee Optional Holiday Election Deferred to Leave**
Status: Deferred
Summary: This domain marks holidays as optional/mandatory; tracking individual elections is Leave's responsibility.

**ADR-HC06 — Permission Scoping**
Status: Accepted; Implemented (2026-09-13)
Summary: `ADMIN`-only mutations (calendar CRUD and holiday-entry CRUD), `holidayCalendar:read` granted to every role — same resolution as Branch (ADR-B07), Department (ADR-D08), and Designation (ADR-DS06).

## Final Sign-off

**Implementation readiness:** Implemented (2026-09-13). Permission scoping resolved; the optional-holiday-election boundary remains correctly deferred to Leave's future design, not a blocker here.

**Confidence score: 89%** (was 84% pre-implementation; the parent-child aggregate, the reversed FK direction on Branch, and the calendar-level resolution query all proved out cleanly against real data with no surprises — the remaining uncertainty is genuinely Leave's to resolve, not this domain's).

**Remaining blockers:** None. Confirm the optional-holiday-election boundary when Leave is designed; build the full Employee→Branch→HolidayCalendar resolution chain when Attendance or Leave needs it.

**Recommended next domain:** Shift — it defines recurring working-day patterns and weekly off-days, which is the concept explicitly excluded from Holiday Calendar (§9) and is a prerequisite for Attendance.
