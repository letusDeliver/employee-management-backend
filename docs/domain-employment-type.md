---
Domain: Employment Type
Status: FINAL
Date: 2026-07-27
Depends on: docs/domain-identity-employee-lifecycle.md
---

# Domain Sign-off: Employment Type

## 1. Domain Overview

Employment Type classifies **the nature of an employee's engagement** — Full-Time, Part-Time, Contract, Intern. Unlike every domain so far (Branch, Department, Designation), this is not a promotion of an existing free-text column: **verified fact**, no `employmentType`-shaped field exists anywhere in `prisma/schema.prisma` today. This is new ground, not a governance upgrade of existing data.

**Business problem this domain solves:** downstream domains (Leave accrual eligibility, Payroll calculation basis, benefits eligibility — none designed yet) all need to answer "is this person salaried or hourly, full-time or part-time, an employee or a contractor" before they can apply their own rules. Without a canonical classification, each of those domains would invent its own ad hoc flag, leading to inconsistent, duplicated logic.

**Why no other domain can own it:** Employee needs to *carry* the classification but Leave/Payroll/Benefits should not each define their own competing notion of it — that would fragment a single business concept across three domains. Department/Designation/Branch cannot own it either — none of those axes determine engagement type (a Software Engineer Designation, an Engineering Department, and a Remote Branch all exist independently of whether the person is full-time or a contractor).

## 2. Business Lifecycle — and the Central Architectural Decision

This is the first domain in the review where the central Step-1-through-7 question is not "what fields does the aggregate need" but **whether this should be a runtime-managed aggregate at all, or a fixed, code-defined enumeration.** This deserves explicit treatment before the rest of the lifecycle discussion, because it changes what "creation/update/archive/deletion" even means here.

**Decision: Employment Type is a fixed, closed enumeration (`FULL_TIME | PART_TIME | CONTRACT | INTERN`), not an admin-manageable master-data table like Branch/Department/Designation.**

**Reasoning:** Branch, Department, and Designation are organization-specific labels — one company's department list is meaningless to another, and admins must be free to create/rename/retire them without a code change. Employment Type is different in kind: each value carries **behavioral significance** in downstream domains that don't exist yet but are already anticipated (Leave accrual rate depends on Full-Time vs. Part-Time; Payroll calculation basis depends on salaried vs. hourly vs. contractor; benefits eligibility depends on Intern vs. permanent staff). If Employment Type were a freely admin-creatable table, an admin could add a `"Freelancer"` row today, but no downstream domain would know how to compute its Leave accrual or Payroll basis — the row would exist with no behavior behind it, which is worse than not allowing its creation at all. Adding a genuinely new employment type is not a data-entry operation; it is a business/engineering decision that requires new eligibility and calculation rules to be written wherever it's consumed — so it should require a deliberate code change (and therefore a migration + release), not a silent admin action.

*Classification: this is a recommendation, argued from the specific downstream-behavior-coupling property of this domain, not an industry-universal rule — flagged explicitly as a deliberate divergence from the Branch/Department/Designation pattern, addressed head-on in §7.*

**Lifecycle, given this decision:**
- **"Creation"** of a new Employment Type value happens via schema/code change and deployment, not an admin UI action.
- **Assignment** of an Employment Type to an Employee is the only runtime lifecycle event: set at hire, updatable on conversion (e.g., Intern → Full-Time, a real and common transition).
- **No "archive"/"deactivate"** concept applies to the enum values themselves — there is no runtime concept of a "retired" employment type, since the set is code-governed, not data-governed.
- **Who performs the assignment:** whoever creates/updates the Employee record (same actor as Department/Designation assignment).
- **Who consumes:** future Leave domain (accrual eligibility/rate), future Payroll domain (calculation basis), future onboarding/benefits logic — none of which are designed yet; this domain deliberately does not pre-design their rules (see §5).

## 3. Relationships

- **Employee owns `employmentType`** as a required field (not nullable) — every employee's engagement type is known from the moment of hire; there is no legitimate "unknown" state.
- **No relationship to Branch, Department, or Designation** — fully independent, exactly like the other three axes are independent of each other.
- **Read by, not owned by, future domains.** Leave and Payroll will *read* `Employee.employmentType` to drive their own eligibility/calculation logic, but Employment Type itself does not encode Leave accrual rates or Payroll formulas — those rules belong entirely to Leave and Payroll respectively when those domains are designed. This is an explicit ownership-boundary decision to prevent Employment Type from becoming a "God enum" that every future domain reaches into to embed its own business logic.
- **Single current value, no history** — same pattern as Branch/Department/Designation: a Full-Time-to-Contract conversion overwrites the value; no employment-type-change history model exists today. Deferred for the same reason as the others (additive later if Payroll ever needs proration across a mid-period conversion).

## 4. Business Rules

**Mandatory invariants:**
- `employmentType` is required on every Employee — no null/unknown state.
- The set of valid values is closed and defined in code, not admin-editable data.
- Changing an Employee's `employmentType` (conversion) overwrites the current value; no automatic historical record is created by this domain (a future Payroll domain may choose to snapshot it at payroll-run time for its own audit needs, but that is Payroll's concern, not this domain's).

**Recommended practices:**
- Start with the minimal set that is actually verified as needed: `FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERN`. Resist adding `CONSULTANT`, `TEMPORARY`, `SEASONAL`, or other values speculatively — each addition is a code change with real downstream-behavior implications (§2), so the cost of under-provisioning is low (add later) while the cost of over-provisioning is real (unused enum values with undefined downstream behavior).
- Employment-type conversion should be a deliberate, auditable action (candidate for the same `AuditLog` extension pattern flagged as open for Branch/Department/Designation), since it can trigger real compensation/benefits consequences once Leave/Payroll exist.

## 5. Architecture

- **Representation:** a closed enum type at the schema level (business-architecture equivalent: a constrained value set, not a foreign-keyed aggregate). No repository, no CRUD service — there is nothing to create/rename/deactivate at runtime.
- **Ownership:** Employee owns the `employmentType` value directly (no separate table, no FK) — this is the one classification axis in the review so far that is a value, not a reference to another aggregate's identity.
- **Cross-domain interaction:** future Leave/Payroll services will read `Employee.employmentType` synchronously as part of their own eligibility/calculation logic — no new cross-domain pattern is introduced here beyond "read a field on the Employee record you already have," which requires no new architectural mechanism.
- **What belongs inside this domain:** the enum definition itself and the invariant that every Employee has exactly one current value.
- **What does NOT belong inside this domain:** Leave accrual rates, Payroll calculation formulas, benefits-eligibility rules, or any other downstream business rule keyed off the value — those live in the domains that consume it.

## 6. Future Proofing

- **What could break this design:** a verified future requirement for organization-specific, admin-defined employment categories (e.g., a customer wanting a custom `"Retainer"` category with its own rules) would invalidate the closed-enum decision and require converting this into a managed master-data table like Department. This is a real risk to name plainly, not hide.
- **Design now vs. defer:** design now — the closed enum and the four starting values. Defer — any move to an open, admin-manageable model; only justified if multiple customers with genuinely divergent, code-unforeseeable categories emerge.
- **Trade-off accepted:** less flexibility than Branch/Department/Designation's admin-manageable pattern, in exchange for the guarantee that every value in the system has real, implemented downstream behavior — no "orphaned" employment types that exist in data but do nothing in Leave/Payroll logic.

## 7. Challenge the Design

**Self-critique — is treating this domain differently from Branch/Department/Designation inconsistent, or even a rationalization to avoid building a fourth master-data table?** This is worth confronting directly rather than waving away. The honest test is: *would an admin ever legitimately need to add a new Employment Type without a corresponding code change actually being needed?* For Branch/Department/Designation, the answer is yes — a new office or a new job title requires zero new business logic to be useful, it's purely descriptive. For Employment Type, the answer is no — a genuinely new category (e.g., "Retainer Consultant") is meaningless until Payroll knows how to calculate pay for it and Leave knows whether it accrues time off. That asymmetry is real, not a rationalization, and it's the actual reason this domain is architected differently — not laziness, a distinction in what the data *means*.

**Alternative considered and rejected — managed master-data table, same shape as Department.** Rejected per the reasoning above: it would let admins create entries with no behavior behind them, which is a worse failure mode (silent no-op) than requiring a code change (visible, deliberate, testable).

**Alternative considered and rejected — boolean flags instead of an enum (`isFullTime`, `isContractor`, ...).** Rejected: booleans invite invalid combinations (both true, both false) that an enum's closed, mutually exclusive set prevents by construction — a straightforward correctness improvement with no real cost.

**Recommendation stands:** closed enum, four starting values, explicitly not a copy of the Branch/Department/Designation pattern, with the divergence justified rather than assumed.

## 8. Open Questions

None structural. One minor implementation note (not a design question): whether the AuditLog extension for tracking employment-type conversions is worth doing now or deferred alongside the same open AuditLog questions for Branch/Department/Designation — recommend bundling this decision with those, not resolving it in isolation.

## 9. Deferred Decisions

| Decision | Reason for Deferral |
|---|---|
| Open, admin-manageable Employment Type catalog | Only justified if a verified requirement for customer-specific categories with genuinely novel (code-unforeseeable) behavior emerges; not true today. |
| Employment-type change history / effective-dating | No verified requirement; Payroll may need it later — additive if so. |
| Additional starting values (Consultant, Temporary, Seasonal) | No verified requirement demands them yet; adding later is a small, contained change (enum extension + downstream rule additions). |

## 10. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| A future customer requirement demands admin-defined categories, invalidating the closed-enum decision | Medium | Low | Documented explicitly as the one condition that would overturn this decision (§6); migration path is converting the enum into a managed table, analogous to how Department was built — not a full redesign. |
| Leave/Payroll domains, once designed, discover the four starting values are insufficient to express a real accrual/calculation distinction | Medium | Medium | Enum is extensible via code change; this is an accepted, low-cost trade-off (§6), not a blocker to designing Leave/Payroll now. |
| No historical record of employment-type conversions | Low | Low | Deferred per §9; add if/when Payroll needs proration across a conversion event. |

## 11. Assumptions

- Assumed (industry practice) that Full-Time, Part-Time, Contract, and Intern cover the substantial majority of real-world engagement types for the organizations this system targets; this is a reasonable, common HRIS starting set, not a verified requirement from a specific customer.
- Assumed that no current customer requirement demands employment categories beyond these four; if that assumption is wrong, §6/§7 already name the exact design that would need to change and why.

## 12. Impact on Future Domains

Any future domain must never violate:
1. `Employee.employmentType` is a required, single-value, closed-enum field — not a nullable reference to a separately managed aggregate.
2. Eligibility/calculation rules keyed off Employment Type live in the consuming domain (Leave, Payroll), never inside this domain.
3. Adding a new Employment Type value is a deliberate code change, never a runtime admin action, unless and until ADR-ET01 is explicitly superseded.

This most directly constrains the future **Leave** domain (accrual eligibility/rate keyed off this field) and the future **Payroll** domain (calculation basis keyed off this field) — both must treat Employment Type as an upstream input they consume, not a concept they redefine independently.

## Architecture Decision Records

**ADR-ET01 — Employment Type as a Closed Enum, Not a Managed Aggregate**
Status: Accepted
Summary: Unlike Branch/Department/Designation, Employment Type is a fixed, code-defined enumeration, not an admin-manageable master-data table, because its values carry real downstream-behavior significance in domains not yet built.
Consequences: New values require a code change and release, not a runtime admin action. If a future verified requirement demands open, customer-defined categories, this ADR must be explicitly superseded (see §6).

**ADR-ET02 — employmentType Mandatory, Single Current Value**
Status: Accepted
Summary: Required field on Employee, no history/effective-dating today.

**ADR-ET03 — Eligibility/Calculation Rules Live in Consuming Domains**
Status: Accepted
Summary: This domain owns only the classification; Leave/Payroll own their own rules keyed off it.

## Final Sign-off

**Implementation readiness:** Ready. No open structural questions; the one deliberate divergence (closed enum vs. managed table) is fully argued and justified, not left ambiguous.

**Confidence score: 90%**

**Remaining blockers:** None structural. Bundle the AuditLog-extension-for-conversions question with the equivalent open items already carried by Branch/Department/Designation.

**Recommended next domain:** Holiday Calendar — a prerequisite for both Shift and Attendance, since both need to know which dates are non-working before their own rules can be fully specified.
