---
Document: ADR Index
Status: FINAL
Date: 2026-07-28
Covers: All 15 signed-off domains
---

# Architecture Decision Record Index

Every ADR produced across every domain sign-off, in dependency order. Full reasoning lives in each domain's own document — this index is for at-a-glance lookup, not a replacement for reading the source.

## Identity & Employee Lifecycle
Full ADR set lives in [[domain-identity-employee-lifecycle]]; the most load-bearing for later domains:
- **ADR-004** — Employee Lifecycle Service. Accepted; **onboarding half Implemented (2026-09-16)**, built during Recruitment's domain pass as `employeeOnboarding.service.js` since Recruitment's Hire Orchestration Service needed a real target. Scoped to onboarding only — the §5 "one service or two" question (onboarding+offboarding together, or separate) remains open; offboarding stays exactly where ADR-006 already put it.
- **ADR-006** — Offboarding Revokes Access by Default. **Accepted; Implemented (2026-09-13)**, scoped to session/token revocation — `softDeleteEmployee` now stamps `User.tokensValidAfter` and revokes all of the linked user's refresh tokens, transactionally. Does not prevent a fresh re-login (see ADR-007). Relied upon by Exit Management's ADR-EM02, whose dependency is now satisfied. (The code had only ever lived on the unmerged branch `security/offboarding-access-revocation`; it reached `main` on 2026-09-22, cherry-picked with Exit Management.)
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
| SH01 | Shift as an independent, Employee-level aggregate (not Branch/Department-scoped) | Accepted; Implemented (2026-09-15) |
| SH02 | Nullable `shiftId`, single current value | Accepted; Implemented (2026-09-15) |
| SH03 | Overnight (midnight-crossing) shift semantics decided now, not deferred | Accepted; Implemented (2026-09-15) — `shiftService.isOvernightShift()`, the single reusable primitive, comparing zero-padded "HH:mm" strings |
| SH04 | Rotation/rostering explicitly deferred | Deferred |
| SH05 | Permission scoping | Accepted; Implemented (2026-09-15) — `ADMIN`-only mutations, read for all roles |

## Attendance — [[domain-attendance]]
| ADR | Summary | Status |
|---|---|---|
| AT01 | Attendance as a raw-fact ledger, not master data | Accepted; Implemented (2026-09-15) |
| AT02 | One record per (employee, date) | Accepted; Implemented (2026-09-15) |
| AT03 | Effective status computed on read, never written by Leave (no cross-domain writes) | Accepted; Fully Implemented (2026-09-15) — Holiday Calendar + Shift + AttendanceRecord legs, plus the Leave leg (ADR-LV08 added `ON_LEAVE`) |
| AT04 | Corrections tracked via generic `AuditLog` | Accepted; Implemented (2026-09-15) — every mutation logged, not just corrections |
| AT05 | Single check-in/check-out; multi-punch explicitly deferred | Deferred (base accepted); base case Implemented (2026-09-15) |
| AT06 | Permission scoping mirrors Employee's own/any split, not the master-data ADMIN-only pattern | Accepted; Implemented (2026-09-15) |

## Leave — [[domain-leave]]
| ADR | Summary | Status |
|---|---|---|
| LV01 | Three aggregates: LeaveType, LeaveRequest, LeaveBalance | Accepted; Implemented (2026-09-15) |
| LV02 | Manager-approval workflow with admin fallback (reuses `managerId`) | Accepted; Implemented (2026-09-15) — refined to two permission keys, `decide:any` (ADMIN, unconditional) and `decide:reports` (MANAGER, own reports only) |
| LV03 | LeaveBalance stored, not computed-on-read (intra-domain, distinct from AT03) | Accepted; Implemented (2026-09-15) — computed lazily on first need, via a concrete hire-year proration formula |
| LV04 | Holiday-aware duration via HC04's shared resolution query | Accepted; Implemented (2026-09-15) |
| LV05 | Strict no-negative-balance default | Accepted (default policy); Implemented (2026-09-15) — `PATCH /leave-balances/:id` is the ADMIN-only, audit-logged escape hatch |
| LV06 | Carry-forward / encashment | **Deferred — Open**, blocks Payroll/Exit Management final-settlement completeness |
| LV07 | Permission scoping | Accepted; Implemented (2026-09-15) — `LeaveType` follows the `ADMIN`-only pattern; `LeaveRequest`/`LeaveBalance` mirror Employee's own/any split |
| LV08 | Closes Attendance's ADR-AT03 Leave leg via `hasApprovedLeaveOnDate` | Accepted; Implemented (2026-09-15) |
| LV09 | `LeaveType.isPaid` - resolves Payroll's named consumption gap | Accepted; Implemented (2026-09-15, during Payroll's build) |

## Payroll — [[domain-payroll]]
| ADR | Summary | Status |
|---|---|---|
| PR01 | PayrollRun/Payslip immutable once finalized | Accepted; Implemented (2026-09-15) — no edit endpoint exists for a Payslip at any status |
| PR02 | Full input snapshotting at generation time (salary, attendance, leave, org-context names) | Accepted; Implemented (2026-09-15) — no overtime line item (no verified overtime concept exists anywhere in this project) |
| PR03 | Generalized `PayslipLineItem`, not fixed deduction columns | Accepted; Implemented (2026-09-15) |
| PR04 | Tax/statutory calculation explicitly out of scope | Deferred |
| PR05 | Salary period unit | Accepted; Implemented (2026-09-15) — confirmed with the user (stakeholder): monthly |
| PR06 | Permission scoping | Accepted; Implemented (2026-09-15) — `PayrollRun` `ADMIN`-only; `Payslip` own/any, but `MANAGER` gets only `:own` (no reports-visibility, unlike Leave) |

## Performance — [[domain-performance]]
| ADR | Summary | Status |
|---|---|---|
| PF01 | ReviewCycle/PerformanceReview as distinct aggregates | Accepted; Implemented (2026-09-15) — PATCH restricted to DRAFT only, a deliberately stricter checkpoint than the doc's own looser wording |
| PF02 | Reuses `Employee.managerId` as reviewer | Accepted; Implemented (2026-09-15) — `reviewerId` resolved and stored at creation time; ADMIN must supply it explicitly for a manager-less employee |
| PF03 | Org-context snapshot at submission — recommended, not mandatory (lighter than PR02) | Accepted (recommendation); Implemented (2026-09-15) |
| PF04 | Goal/OKR, 360 feedback, competency frameworks deferred | Deferred |
| PF05 | Permission scoping | Accepted; Implemented (2026-09-15) — `ReviewCycle` `ADMIN`-only; `PerformanceReview` splits `create:reports`/`:any`, `manage:reports`/`:any`, `read:own`/`:any`, `acknowledge:own`, `selfAssess:own` |
| PF06 | Addenda ungated by a dedicated permission | Accepted; Implemented (2026-09-15) — gated by whichever read/manage permission already grants access to that review |

## Recruitment — [[domain-recruitment]]
| ADR | Summary | Status |
|---|---|---|
| RC01 | Requisition-anchored pipeline | Accepted; Implemented (2026-09-16) — guarded `JobRequisition`/`Application` state machines, atomic openings decrement/auto-close, partial-unique-index-enforced one-Pending-Offer-per-Application |
| RC02 | Candidate is not a `User` | Accepted; Implemented (2026-09-16) — no email uniqueness constraint, real hard-delete gated on zero Application references |
| RC03 | Single Hire Orchestration Service boundary into unmodified Identity onboarding | Accepted; Implemented (2026-09-16) — built `employeeOnboarding.service.js` as the real target (Identity's own ADR-004 onboarding half), since it didn't exist yet; see [[domain-identity-employee-lifecycle]] ADR-004 |
| RC04 | Candidate PII retention policy | **Deferred — Open (compliance/legal)**, still unresolved as of implementation |
| RC05 | Permission scoping | Accepted; Implemented (2026-09-16) — `ADMIN`-only across every aggregate, no dedicated Recruiter role introduced |

## Training — [[domain-training]]
| ADR | Summary | Status |
|---|---|---|
| TR01 | TrainingProgram/Enrollment as distinct aggregates; enrollment is repeatable, not single-current-value | Accepted; Implemented (2026-09-16) — guarded ENROLLED→IN_PROGRESS→COMPLETED\|FAILED state machine, WITHDRAWN from either non-terminal stage |
| TR02 | Compliance status computed on read (same principle as AT03) | Accepted; Implemented (2026-09-16) — single-program and bulk-report shapes, `GET /training-compliance` |
| TR03 | No auto-targeting by Designation/Department, no enforcement coupling to Payroll/Performance | Accepted; Implemented (2026-09-16) by omission |
| TR04 | Permission scoping | Accepted; Implemented (2026-09-16) — `TrainingProgram` `ADMIN`-only; `Enrollment` splits `create:own`/`:any`, `read:own`/`:any`, `manage:any`, `withdraw:own`; no `MANAGER` reports-visibility |

## Asset Management — [[domain-asset-management]]
| ADR | Summary | Status |
|---|---|---|
| AM01 | AssetAssignment as an append-only custody ledger (history built now, unlike Branch/Department/Designation) | Accepted; Implemented (2026-09-22) — never deleted, only closed via a guarded `returnedAt` update |
| AM02 | At most one active assignment per asset | Accepted; Implemented (2026-09-22) — service check + compare-and-set on `Asset.status` + hand-added partial unique index `WHERE "returnedAt" IS NULL` |
| AM03 | Positive allowlist assignability | Accepted; Implemented (2026-09-22) — `assertAssetAssignable`, only `AVAILABLE` |
| AM04 | No financial/depreciation tracking | Deferred |
| AM05 | Permission scoping | Accepted; Implemented (2026-09-22) — flat `ADMIN`-only for `Asset` and assign/return; `assetAssignment:read:own`/`:any` split for custody reads; no `MANAGER` reports-visibility |
| AM06 | Return condition (`GOOD`/`DAMAGED`) and direct status transitions | Accepted; Implemented (2026-09-22) — `GOOD`→`AVAILABLE`, `DAMAGED`→`UNDER_REPAIR`; `ASSIGNED` only via assign/return, `RETIRED` terminal |

## Exit Management — [[domain-exit-management]]
| ADR | Summary | Status |
|---|---|---|
| EM01 | Exit Management as the structural mirror of Recruitment | Accepted; Implemented (2026-09-22) — `ExitCase`/`ClearanceItem`, one orchestration service, Identity's primitive unmodified apart from an optional trailing `outerTx` |
| EM02 | Separation trigger (Identity's offboarding primitive) decoupled from clearance completion — time-based, not administrative | Accepted; Implemented (2026-09-22) — `separate` refuses before `lastWorkingDay` and ignores clearance state; ADR-006 (never merged before) cherry-picked as a prerequisite |
| EM03 | Post-separation reversal uses Identity's existing rehire flow; no second undo mechanism | Accepted; Implemented (2026-09-22) — `WITHDRAWN` only from `INITIATED` |
| EM04 | `eligibleForRehire` flag built now | Accepted; Implemented (2026-09-22) — stored as data, no enforcement yet |
| EM05 | Final settlement blocked on Leave's LV06 | **Deferred — Open** (manual `FINAL_SETTLEMENT` clearance item only; Payroll gap for separated employees noted) |
| EM06 | Permission scoping | Accepted; Implemented (2026-09-22) — `ADMIN`-only for termination/manage; `create:own`/`read:own`/`withdraw:own` for employees; no `MANAGER` reports-visibility |
| EM07 | Separation mechanics: explicit `separate` + `process-due` sweep (no scheduler), atomic transaction, already-offboarded handling | Accepted; Implemented (2026-09-22) |
| EM08 | Clearance checklist mechanics (asset check against Asset Management, waive with reason, auto-complete) | Accepted; Implemented (2026-09-22) |

## All Open / Deferred ADRs Requiring Resolution Before Full Implementation

| ADR | Domain | Nature of Gap |
|---|---|---|
| HC05 | Holiday Calendar | Optional/restricted holiday election — boundary deferred to Leave; still open, Leave's own implementation (2026-09-15) did not add per-employee holiday election. |
| LV06 | Leave | Carry-forward / encashment policy — blocks a fully accurate Payroll final-period settlement and Exit Management (EM05) final-settlement completeness. |
| RC04 | Recruitment | Candidate PII retention — requires legal/compliance input. |
| EM05 | Exit Management | Depends directly on LV06. |

See [[deferred-decisions-register]] for the full deferred-decisions catalogue (a superset of the ADR-level items above, including recommendations that never reached ADR status) and [[future-roadmap]] for suggested resolution sequencing.
