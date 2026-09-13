---
Document: Cross-Domain Relationship Matrix
Status: FINAL
Date: 2026-07-28
Covers: All 15 signed-off domains
---

# Cross-Domain Relationship Matrix

## The One Rule That Holds Across Every Domain

**No domain ever writes into another domain's aggregate.** Every cross-domain interaction in this entire review is either a **synchronous read** (existence/status checks, data consumption) or, in exactly two cases, a **single triggered invocation of another domain's own, unmodified process** (Recruitment → Identity onboarding; Exit Management → Identity offboarding). This is stated once here because it is the single most load-bearing architectural principle threading through all fifteen sign-offs, first established implicitly in Identity (`auth.service.js`'s `register()` orchestration), made explicit as a named decision in Attendance (ADR-AT03), and reaffirmed by every domain designed after it.

## Per-Domain Relationship Table

| Domain | Reads From | Read By | Triggers (not a data write) | Independent Of |
|---|---|---|---|---|
| **Identity & Employee Lifecycle** | — (foundational) | Every domain (all reference `Employee`/`User`) | — | — |
| **Branch** | Identity (Employee FK) | Holiday Calendar, Payroll, Performance, Recruitment | — | Department, Designation, Employment Type |
| **Department** | Identity | Payroll, Performance, Recruitment | — | Branch, Designation, Employment Type |
| **Designation** | Identity | Payroll, Performance, Recruitment | — | Branch, Department, Employment Type |
| **Employment Type** | Identity | Leave (entitlement), Payroll (calculation basis), Recruitment (requisition spec) | — | Branch, Department, Designation |
| **Holiday Calendar** | Branch (optional `holidayCalendarId`) | Attendance (resolution query), Leave (duration calculation) | — | Department, Designation, Employment Type |
| **Shift** | Identity (Employee, nullable `shiftId`) | Attendance (expected hours/lateness/overtime) | — | Branch, Department, Designation, Employment Type |
| **Attendance** | Shift, Holiday Calendar, Leave (approved-leave query) | Payroll (snapshotted effective status) | — | Department, Designation, Branch (indirectly, via Shift/Holiday Calendar only) |
| **Leave** | Employment Type (entitlement), Holiday Calendar (duration), Identity (`managerId` approval) | Attendance (read-only, never written to), Payroll (unpaid-leave deduction), Exit Management (encashment, blocked on LV06) | — | Branch, Department, Designation directly |
| **Payroll** | Employment Type, Attendance, Leave, Department, Designation, Branch, Identity (`salary`) | Exit Management (final-settlement trigger consumer) | — | Performance, Training, Recruitment |
| **Performance** | Identity (`managerId`), Department, Designation, Branch (org-context snapshot) | — (no downstream consumer designed yet) | — | Attendance, Leave, Payroll, Employment Type |
| **Recruitment** | Department, Designation, Branch, Employment Type (requisition spec); Identity (duplicate-hire check) | — | **Identity's onboarding primitive** (single Hire Orchestration Service call) | Attendance, Leave, Payroll, Performance, Training, Asset Management |
| **Training** | Identity (Employee existence) | — (no downstream consumer designed yet) | — | Department, Designation, Branch, Employment Type, Attendance, Leave, Payroll, Performance |
| **Asset Management** | Identity (Employee existence) | Exit Management (active-assignment query) | — | Department, Designation, Branch, all operational domains |
| **Exit Management** | Identity, Asset Management (active assignments), Leave (balance, pending LV06) | — (terminal domain) | **Identity's offboarding primitive** (single Exit Orchestration Service call); **Payroll** (final-settlement generation flag) | Performance, Training, Recruitment |

## Notable Patterns Across the Matrix

**The four orthogonal master-data axes (Branch, Department, Designation, Employment Type) never reference each other.** Each was independently tested against the alternative (hierarchy/scoping) and independently rejected it — this is a repeated pattern, not a single decision copied four times without re-examination (see each domain's own §7 for the domain-specific reasoning).

**Three distinct "computed, not stored" reconciliations share one principle:** Attendance's effective status (ADR-AT03), Training's compliance status (ADR-TR02), and (implicitly) Holiday Calendar's resolution query (ADR-HC04) are all cases where a derived fact is computed from source data at read time rather than duplicated into a stored field — the same reasoning applied independently in each domain, not inherited mechanically.

**Payroll and Exit Management are the two heaviest consumers**, each reading five-plus upstream domains — this is expected: they are the two domains where operational facts (attendance, leave, assets, org-context) finally convert into a financial or terminal business outcome.

**Recruitment and Exit Management are mirror-image terminal domains** — one only ever writes forward (triggers onboarding), the other only ever writes forward (triggers offboarding + settlement), and neither is read by any other domain in this graph, consistent with both sitting at the two ends of the employee lifecycle.

**No domain in this entire review holds a direct FK cycle.** Every relationship in the table above resolves to a strict dependency direction consistent with [[domain-dependency-graph]]; there is no pair of domains that both read from each other.

## Cross-References

- Dependency ordering and rationale: [[domain-dependency-graph]]
- Full ADR detail behind each relationship: [[adr-index]]
- Everything explicitly deferred, including relationships not built: [[deferred-decisions-register]]
