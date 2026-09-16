---
Document: Deferred Decisions Register
Status: FINAL
Date: 2026-07-28
Covers: All 15 signed-off domains
---

# Deferred Decisions Register

Every decision explicitly deferred across every domain in this review, in one place, for future implementation planning. "Deferred" here always means: considered, deliberately not built, with a stated reason and (where applicable) a named additive migration path — never an oversight.

## Identity & Employee Lifecycle
| Deferred Item | Reason |
|---|---|
| User account status / `isActive` field (ADR-007) | No verified requirement at the time; `login()` has no status check today. Still deferred as of ADR-006's implementation (2026-09-13) — session/token revocation did not require it. |

## Branch
| Deferred Item | Reason |
|---|---|
| Historical branch-assignment tracking | No verified requirement; additive later. |
| Regional/hierarchical branch grouping | No verified requirement. |
| Timezone/statutory/holiday-calendar fields | **Partially resolved** — Holiday Calendar (ADR-HC03) picked up the holiday-calendar half; timezone remains deferred, now a named gap for Shift (§5 of [[domain-shift]]). |
| Branch-Department valid-combination mapping | No verified requirement; would contradict orthogonality's whole point. |
| Scheduled/future-dated deactivation | No verified requirement. |

## Department
| Deferred Item | Reason |
|---|---|
| Departmental hierarchy (`parentDepartmentId`) | No verified requirement; additive nullable self-FK later. |
| Department-transfer history/effective-dating | No verified requirement; Payroll's snapshot pattern (PR02) compensates for its absence. |
| Cost center/budget fields | Belongs to Payroll's future scope, not Department's identity. |
| Department-based permission scoping | No verified requirement; current RBAC is role-based, not department-scoped. |
| Head-of-department designation | Premature; overlaps unresolved Designation concepts. |

## Designation
| Deferred Item | Reason |
|---|---|
| Department-scoped Designations / valid-combination mapping | No verified requirement; would contradict orthogonality (ADR-DS02). |
| Grade/Band linkage | Grade/Band itself flagged in Phase 1 as possibly unnecessary; not designed in this review. |
| Seniority/ranking on Designation | No verified requirement. |
| Designation-driven approval routing | Belongs to a future workflow/approvals capability not built anywhere in this system. |

## Employment Type
| Deferred Item | Reason |
|---|---|
| Open, admin-manageable Employment Type catalog | Only justified by customer-specific categories with genuinely novel behavior — not true today. |
| Employment-type change history | No verified requirement. |
| Additional starting values (Consultant, Temporary, Seasonal) | No verified requirement; cheap to add later via code change. |

## Holiday Calendar
| Deferred Item | Reason |
|---|---|
| Per-employee optional/restricted holiday election | Belongs to Leave's design, not Holiday Calendar's (HC05). |
| Sub-branch (department/designation-level) calendar overrides | No verified requirement. |
| Historical snapshot of "which calendar applied on a past date" | Only matters once Attendance/Leave need retroactive consistency. |
| Weekly off-days | Explicitly out of scope here — belongs to Shift. |
| Permission scoping | Open, same pattern. |

## Shift
| Deferred Item | Reason |
|---|---|
| Shift rotation/rostering | No verified requirement; materially larger feature (SH04). |
| Timezone-aware shift interpretation | Depends on Branch's still-deferred `timezone` field. |
| Break-time deduction/lateness grace period | Belongs to Attendance's calculation rules. |
| Shift-change history | Consistent with every other axis; additive later. |
| Permission scoping | **Resolved (2026-09-15)** — `ADMIN`-only mutations, read for all roles (ADR-SH05). |

## Attendance
| Deferred Item | Reason |
|---|---|
| Multi-punch (break-tracking) event log | No verified requirement; single check-in/check-out serves the common case (AT05). |
| Biometric/geofenced device ingestion | No verified requirement, no existing hardware infrastructure. |
| Regularization approval workflow | No approval-workflow infrastructure exists anywhere in this system yet. |
| Effective-status caching/read-model | Only justified once a real, demonstrated performance problem exists. |
| ~~"On Leave" effective status~~ | **Resolved (2026-09-15)** — Leave's ADR-LV08 added the `ON_LEAVE` branch to `getEffectiveStatus()`. |
| Overnight-shift lateness computation | Comparing a real check-in timestamp against an overnight shift's startTime is ambiguous once the calendar day rolls over; implemented for non-overnight shifts only (2026-09-15). |

## Leave
| Deferred Item | Reason |
|---|---|
| Carry-forward / encashment (LV06) | No verified requirement; **blocks a fully accurate Payroll final-period settlement and Exit Management's final-settlement completeness.** |
| Monthly/periodic accrual instead of annual lump sum | No verified requirement; implemented as annual lump-sum, hire-year-prorated (2026-09-15). |
| Negative-balance / advance-leave policy | No verified requirement; strict no-negative-balance is the safer default - implemented (2026-09-15), `PATCH /leave-balances/:id` is the ADMIN escape hatch. |
| Multi-level approval workflow | No approval-workflow infrastructure exists project-wide yet. |
| Leave-type-specific sub-rules (medical certificates, etc.) | No verified requirement. |
| Employment-type-based entitlement adjustment | No verified formula exists; explicitly not hard-coded (2026-09-15) - only the hire-date proration leg of §4's recommendation was implemented. |
| Per-employee optional/restricted holiday election (HC05's boundary) | Still open even after Leave's implementation (2026-09-15) - no verified requirement surfaced during this pass. |
| Permission scoping | **Resolved (2026-09-15)** — `LeaveType` follows the `ADMIN`-only pattern; `LeaveRequest`/`LeaveBalance` mirror Employee's own/any split (ADR-LV07). |
| `LeaveType.isPaid` | **Resolved (2026-09-15, during Payroll's build)** — additive boolean, `@default(true)`; consumed by Payroll's pay calculation (ADR-LV09). |

## Payroll
| Deferred Item | Reason |
|---|---|
| Tax/statutory deduction calculation (PR04) | Jurisdiction-specific legal complexity; distinct future sub-domain effort. |
| Multi-currency support | No verified requirement. |
| Contractor/invoice-based payment flow | Materially different process; not verified as needed - `CONTRACT` employees flow through the same periodic Payslip mechanism as every other Employment Type in this implementation, an accepted trade-off pending a real requirement otherwise. |
| Automated/scheduled PayrollRun triggering | No verified requirement; manual admin initiation is today's scope - implemented (2026-09-15). |
| Payslip correction workflow beyond "adjustment in next run" | No verified requirement; there is no edit endpoint for a Payslip at any status. |
| Overtime pay calculation | No verified overtime field or rate concept exists anywhere in this project (`AttendanceRecord` has only `checkIn`/`checkOut`) - not invented despite §3's passing mention of "overtime" as an input. |
| Salary period unit confirmation (PR05) | **Resolved (2026-09-15)** — confirmed with the user (acting as stakeholder): monthly. |
| Permission scoping | **Resolved (2026-09-15)** — `PayrollRun` follows the `ADMIN`-only pattern (no dedicated Finance/Payroll role exists or was justified); `Payslip` reads split own/any, but `MANAGER` gets only `:own` (no reports-visibility into pay, unlike Leave's approval workflow). |

## Performance
| Deferred Item | Reason |
|---|---|
| Goal/OKR tracking | No verified requirement; materially larger feature. |
| 360-degree/peer feedback | No verified requirement. |
| Competency frameworks per Designation | No verified requirement; would over-couple Performance to Designation. |
| Performance-to-compensation linkage | No verified requirement; would be a future domain's dependency on Performance. |
| Permission scoping | **Resolved (2026-09-15)** — `ReviewCycle` follows the `ADMIN`-only pattern; `PerformanceReview` splits authoring (`create:reports`/`create:any`), lifecycle management (`manage:reports`/`manage:any`), and the reviewed employee's own actions (`read:own`, `acknowledge:own`, `selfAssess:own`) (ADR-PF05). |

## Recruitment
| Deferred Item | Reason |
|---|---|
| Candidate self-service portal | No verified requirement; would need its own Identity-relationship design. |
| Resume parsing/AI-assisted screening | No verified requirement. |
| Referral tracking | No verified requirement. |
| E-signature offer letters, background-check integration | No verified requirement; third-party integration out of scope. |
| Unsolicited/pipeline-building applications without a requisition | No verified requirement; workaround exists (generic open requisition). |
| Candidate PII retention/deletion policy (RC04) | **Open — legal/compliance question, not an architecture question.** Still open as of implementation (2026-09-16) — Candidate's hard-delete endpoint is a zero-reference convenience delete, not a retention-policy engine, and does not resolve this. |
| Permission scoping | **Resolved (2026-09-16)** — `ADMIN`-only across every aggregate (ADR-RC05), same reasoning as Branch/Department/ReviewCycle: no aggregate here has a natural "own" concept. |
| Identity's Employee Lifecycle Service (ADR-004, §5 of [[domain-identity-employee-lifecycle]]) | **Onboarding half resolved (2026-09-16, during this domain's build)** — built as `employeeOnboarding.service.js`, the real target this domain's own ADR-RC03 needed. The broader "one service or two" scope question (onboarding+offboarding together) remains open; offboarding was not folded in. |

## Training
| Deferred Item | Reason |
|---|---|
| Auto-targeting of training by Designation/Department | No verified requirement; additive on top of explicit enrollment. |
| Compliance-enforcement coupling to Payroll/Performance | No verified requirement; would introduce unjustified new cross-domain dependencies. |
| Renewal reminder notifications | No notification infrastructure exists anywhere in this project yet. |
| External LMS/provider integration, cost/budget tracking | No verified requirement. |

## Asset Management
| Deferred Item | Reason |
|---|---|
| Depreciation/financial valuation (AM04) | Finance-domain concern; no verified requirement. |
| Procurement/purchase-order linkage | No verified requirement. |
| Employee-initiated asset requests (approval workflow) | No verified requirement; additive, similar in shape to Leave's request pattern. |
| Barcode/QR scanning integration | No verified requirement; no hardware-integration infrastructure. |
| Detailed maintenance/repair history | `UNDER_REPAIR` status sufficient for today's scope. |

## Exit Management
| Deferred Item | Reason |
|---|---|
| Notice-period policy engine | No verified, uniform policy confirmed; manual per-case entry is the safe starting point. |
| Structured exit-interview data collection | No verified requirement beyond free-text notes. |
| Final-settlement calculation detail (unused-leave encashment, EM05) | **Blocked on Leave's LV06 — not resolved here.** |

## Project-Wide Recurring Gaps

These are not domain-specific deferrals but the same missing capability surfacing repeatedly across many domains — worth tracking as a unit rather than thirteen separate line items:

| Recurring Gap | Domains Affected |
|---|---|
| Permission scoping beyond `ADMIN`-only | Training, Asset Management, Exit Management. Branch (ADR-B07), Department (ADR-D08), Designation (ADR-DS06), Holiday Calendar (ADR-HC06), Shift (ADR-SH05), LeaveType (ADR-LV07), PayrollRun (ADR-PR06), ReviewCycle (ADR-PF05), and now all of Recruitment - `JobRequisition`/`Candidate`/`Application` (ADR-RC05) - have resolved this as `ADMIN`-only mutations / read-for-all (2026-09-13 through 2026-09-16) — the same resolution is the likely default for the rest unless a real requirement diverges. Attendance (ADR-AT06), LeaveRequest/LeaveBalance (ADR-LV07), Payslip (ADR-PR06), and PerformanceReview (ADR-PF05) instead resolved to an own/any (or own/reports/any) split, since all four are self-service-plus-admin-correction (or workflow-with-authoring-authority) domains, not pure master data - a second, equally-established pattern now exists depending on domain shape. Payslip's own/any split further diverges from Leave's by withholding `MANAGER`'s reports-visibility, since no verified requirement extends pay visibility to managers; PerformanceReview instead extends Leave's manager-plus-admin-fallback shape from a single `decide:*` action to two separate authority axes (`create:*` for authoring, `manage:*` for lifecycle transitions). Recruitment's resolution notably has *no* own/any axis at all (unlike every self-service-shaped domain) - no Recruitment aggregate has a natural "own" concept, since Candidate isn't even a `User`. |
| No approval-workflow infrastructure project-wide | Attendance (regularization), Leave (multi-level approval), Asset Management (asset requests) all independently deferred the same underlying capability. |
| No notification infrastructure project-wide | Training (renewal reminders) is the only domain to name this explicitly, but it would also affect Leave (approval notifications) and Exit Management (clearance reminders) once built. |
| AuditLog extension to new entity types | Branch (ADR-B08), Department (ADR-D09), Designation, Holiday Calendar (both entities, `HolidayCalendar` and `Holiday`), Shift, Attendance (ADR-AT04), Leave (all three entities - `LeaveType`, `LeaveRequest`, `LeaveBalance`), Payroll (both `PayrollRun` and `Payslip`), Performance (all three entities - `ReviewCycle`, `PerformanceReview`, `ReviewAddendum`), and now Recruitment (all six entities - `JobRequisition`, `Candidate`, `CandidateDocument`, `Application`, `Interview`, `Offer`) have all resolved this (2026-09-13 through 2026-09-16) — confirms the generic `AuditLog` model extends cleanly with no schema change, as predicted, across eleven independent domains now. |

See [[future-roadmap]] for how these recurring gaps should be sequenced relative to the domain-specific open items above.
