---
Document: ADR Index
Status: FINAL
Date: 2026-07-28
Covers: All 15 signed-off domains
---

# Architecture Decision Record Index

Every ADR produced across every domain sign-off, in dependency order. Full reasoning lives in each domain's own document — this index is for at-a-glance lookup, not a replacement for reading the source.

## Identity & Employee Lifecycle
Full ADR set lives in [[domain-identity-employee-lifecycle]]; the two most load-bearing for later domains:
- **ADR-006** — Offboarding Revokes Access by Default. **Accepted; Implemented (2026-09-13)**, scoped to session/token revocation — `softDeleteEmployee` now stamps `User.tokensValidAfter` and revokes all of the linked user's refresh tokens, transactionally. Does not prevent a fresh re-login (see ADR-007). Relied upon by Exit Management's ADR-EM02, whose dependency is now satisfied.
- **ADR-007** — Deferred: User Account Status. No `isActive`/status field exists on `User`; `login()` has no status check. Still deferred — no verified requirement forces this yet; ADR-006's implementation deliberately did not resurrect it.

## Branch — [[domain-branch]]
| ADR | Summary | Status |
|---|---|---|
| B01 | Branch as a first-class domain | Accepted; Implemented (2026-09-13) |
| B02 | Branch/Department orthogonal, not hierarchical | Accepted |
| B03 | Single current `branchId`, no history | Accepted; Implemented (2026-09-13) |
| B04 | Status field, not `deletedAt` | Accepted; Implemented (2026-09-13) |
| B05 | Positive allowlist assignability | Accepted; Implemented (2026-09-13) |
| B06 | Synchronous cross-domain reads | Accepted; Implemented (2026-09-13) |
| B07 | Permission scoping | Accepted; Implemented (2026-09-13) — `ADMIN`-only mutations, read for all roles |
| B08 | Audit logging extension | Accepted; Implemented (2026-09-13) |

## Department — [[domain-department]]
| ADR | Summary | Status |
|---|---|---|
| D01 | Department as a first-class domain | Accepted; Implemented (2026-09-13) |
| D02 | Department/Branch orthogonality (inherited from B02) | Accepted |
| D03 | Single current `departmentId`, no history | Accepted; Implemented (2026-09-13) |
| D04 | Status field, not `deletedAt` | Accepted; Implemented (2026-09-13) |
| D05 | Positive allowlist assignability | Accepted; Implemented (2026-09-13) |
| D06 | Synchronous cross-domain reads | Accepted; Implemented (2026-09-13) |
| D07 | `departmentId` mandatory, not nullable (diverges from Branch) | Accepted; Implemented (2026-09-13) via a real expand-migrate-contract migration against live dev data (30 Employee rows, 12 distinct free-text values backfilled) |
| D08 | Permission scoping | Accepted; Implemented (2026-09-13) — `ADMIN`-only mutations, read for all roles |
| D09 | Audit logging extension | Accepted; Implemented (2026-09-13) |

## Designation — [[domain-designation]]
| ADR | Summary | Status |
|---|---|---|
| DS01 | Designation as a first-class domain | Accepted; Implemented (2026-09-13) |
| DS02 | Designation orthogonal to Department and Branch | Accepted |
| DS03 | Single current `designationId`, no history | Accepted; Implemented (2026-09-13) |
| DS04 | Status field, not `deletedAt` | Accepted; Implemented (2026-09-13) |
| DS05 | Positive allowlist assignability | Accepted; Implemented (2026-09-13) |
| DS06 | Permission scoping | Accepted; Implemented (2026-09-13) — `ADMIN`-only mutations, read for all roles |
| DS07 | `designationId` mandatory, not nullable | Accepted; Implemented (2026-09-13) via a real expand-migrate-contract migration against live dev data (30 Employee rows, 17 distinct free-text `jobTitle` values backfilled) |

## Employment Type — [[domain-employment-type]]
| ADR | Summary | Status |
|---|---|---|
| ET01 | Closed enum, not a managed aggregate (diverges from Branch/Department/Designation) | Accepted; Implemented (2026-09-13) |
| ET02 | `employmentType` mandatory, single current value | Accepted; Implemented (2026-09-13) — 30 pre-existing Employee rows assigned `FULL_TIME` by a one-time migration default (no free-text precursor existed to derive a real value from, unlike Branch/Department/Designation), immediately dropped so every future write requires it explicitly |
| ET03 | Eligibility/calculation rules live in consuming domains (Leave, Payroll), not here | Accepted |

## Holiday Calendar — [[domain-holiday-calendar]]
| ADR | Summary | Status |
|---|---|---|
| HC01 | HolidayCalendar/Holiday as a dedicated domain | Accepted; Implemented (2026-09-13) |
| HC02 | Calendar is year-agnostic, accumulates dated entries | Accepted; Implemented (2026-09-13) |
| HC03 | Branch-level optional assignment (`Branch.holidayCalendarId`, additive to Branch, not a redesign) | Accepted; Implemented (2026-09-13) |
| HC04 | Reusable holiday-resolution query (consumed by Attendance and Leave) | Accepted (recommendation); Implemented (2026-09-13) — the calendar-level primitive (`isDateHolidayInCalendar`) only; the full multi-hop chain is left for Attendance/Leave to build when needed |
| HC05 | Per-employee optional/restricted holiday election deferred to Leave | Deferred |
| HC06 | Permission scoping | Accepted; Implemented (2026-09-13) — `ADMIN`-only mutations, read for all roles |

## Shift — [[domain-shift]]
| ADR | Summary | Status |
|---|---|---|
| SH01 | Shift as an independent, Employee-level aggregate (not Branch/Department-scoped) | Accepted |
| SH02 | Nullable `shiftId`, single current value | Accepted |
| SH03 | Overnight (midnight-crossing) shift semantics decided now, not deferred | Accepted |
| SH04 | Rotation/rostering explicitly deferred | Deferred |

## Attendance — [[domain-attendance]]
| ADR | Summary | Status |
|---|---|---|
| AT01 | Attendance as a raw-fact ledger, not master data | Accepted |
| AT02 | One record per (employee, date) | Accepted |
| AT03 | Effective status computed on read, never written by Leave (no cross-domain writes) | Accepted |
| AT04 | Corrections tracked via generic `AuditLog` | Accepted |
| AT05 | Single check-in/check-out; multi-punch explicitly deferred | Deferred (base accepted) |

## Leave — [[domain-leave]]
| ADR | Summary | Status |
|---|---|---|
| LV01 | Three aggregates: LeaveType, LeaveRequest, LeaveBalance | Accepted |
| LV02 | Manager-approval workflow with admin fallback (reuses `managerId`) | Accepted |
| LV03 | LeaveBalance stored, not computed-on-read (intra-domain, distinct from AT03) | Accepted |
| LV04 | Holiday-aware duration via HC04's shared resolution query | Accepted |
| LV05 | Strict no-negative-balance default | Accepted (default policy) |
| LV06 | Carry-forward / encashment | **Deferred — Open**, blocks Payroll/Exit Management final-settlement completeness |

## Payroll — [[domain-payroll]]
| ADR | Summary | Status |
|---|---|---|
| PR01 | PayrollRun/Payslip immutable once finalized | Accepted |
| PR02 | Full input snapshotting at generation time (salary, attendance, leave, org-context names) | Accepted |
| PR03 | Generalized `PayslipLineItem`, not fixed deduction columns | Accepted |
| PR04 | Tax/statutory calculation explicitly out of scope | Deferred |
| PR05 | Salary period unit (assumed monthly) unverified | **Deferred — Open** |

## Performance — [[domain-performance]]
| ADR | Summary | Status |
|---|---|---|
| PF01 | ReviewCycle/PerformanceReview as distinct aggregates | Accepted |
| PF02 | Reuses `Employee.managerId` as reviewer | Accepted |
| PF03 | Org-context snapshot at submission — recommended, not mandatory (lighter than PR02) | Accepted (recommendation) |
| PF04 | Goal/OKR, 360 feedback, competency frameworks deferred | Deferred |

## Recruitment — [[domain-recruitment]]
| ADR | Summary | Status |
|---|---|---|
| RC01 | Requisition-anchored pipeline | Accepted |
| RC02 | Candidate is not a `User` | Accepted |
| RC03 | Single Hire Orchestration Service boundary into unmodified Identity onboarding | Accepted |
| RC04 | Candidate PII retention policy | **Deferred — Open (compliance/legal)** |

## Training — [[domain-training]]
| ADR | Summary | Status |
|---|---|---|
| TR01 | TrainingProgram/Enrollment as distinct aggregates; enrollment is repeatable, not single-current-value | Accepted |
| TR02 | Compliance status computed on read (same principle as AT03) | Accepted |
| TR03 | No auto-targeting by Designation/Department, no enforcement coupling to Payroll/Performance | Accepted |

## Asset Management — [[domain-asset-management]]
| ADR | Summary | Status |
|---|---|---|
| AM01 | AssetAssignment as an append-only custody ledger (history built now, unlike Branch/Department/Designation) | Accepted |
| AM02 | At most one active assignment per asset | Accepted |
| AM03 | Positive allowlist assignability | Accepted |
| AM04 | No financial/depreciation tracking | Deferred |

## Exit Management — [[domain-exit-management]]
| ADR | Summary | Status |
|---|---|---|
| EM01 | Exit Management as the structural mirror of Recruitment | Accepted |
| EM02 | Separation trigger (Identity's offboarding primitive) decoupled from clearance completion — time-based, not administrative | Accepted |
| EM03 | Post-separation reversal uses Identity's existing rehire flow; no second undo mechanism | Accepted |
| EM04 | `eligibleForRehire` flag built now | Accepted |
| EM05 | Final settlement blocked on Leave's LV06 | **Deferred — Open** |

## All Open / Deferred ADRs Requiring Resolution Before Full Implementation

| ADR | Domain | Nature of Gap |
|---|---|---|
| HC05 | Holiday Calendar | Optional/restricted holiday election — boundary deferred to Leave. |
| LV06 | Leave | Carry-forward / encashment policy — blocks Payroll (PR05-adjacent) and Exit Management (EM05) final-settlement completeness. |
| PR05 | Payroll | Salary period unit unverified — requires stakeholder confirmation. |
| RC04 | Recruitment | Candidate PII retention — requires legal/compliance input. |
| EM05 | Exit Management | Depends directly on LV06. |

See [[deferred-decisions-register]] for the full deferred-decisions catalogue (a superset of the ADR-level items above, including recommendations that never reached ADR status) and [[future-roadmap]] for suggested resolution sequencing.
