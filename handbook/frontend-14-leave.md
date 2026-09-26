# Frontend Chapter 14 — Leave (the first approval workflow)

## Theory

**Leave** is how an employee asks for planned time off and how the organisation decides and tracks
it. It is three aggregates with three different shapes, not one:

| Aggregate | Shape | Screens |
|---|---|---|
| **Leave type** ("Annual", "Sick") | master data, no `code` — like Shift | `/leave-types` |
| **Leave request** | a **workflow**: `PENDING → APPROVED \| REJECTED`, and `PENDING`/future-`APPROVED → CANCELLED` | `/my-leave`, `/leave-requests` |
| **Leave balance** | a **stored ledger** per employee, type and year | `/my-leave` (own), `/leave-balances` |

It is the first domain with **someone other than the actor deciding**, so the interesting UI question
stops being "what can this screen show" and becomes **"may *this* caller do *this* to *this* row?"**

**The verified contract** (read from `backend/src/modules/leave*` and `docs/domain-leave.md`, then
exercised live):

| Fact | Consequence for the UI |
|---|---|
| A request: `startDate`, `endDate` (calendar dates), `reason?`, `status`, `durationDays` (Decimal string, **`null` until approved**) | A DTO → model **mapper** for the first time since Employees; the duration is a dash until approval. |
| The duration **excludes holidays and week-offs** (branch calendar + shift), worked out **only at approval** | The applicant is **never shown an estimate** — it would duplicate a server rule. |
| A balance row is created **lazily, at the first approval** (`getOrCreateLeaveBalance`) | A new employee has **no balance rows**: "none yet" is normal, not zero, not an error. |
| `GET /leave-requests` is **auto-scoped to the caller** without `read:any`; ADMIN and MANAGER **have** `read:any` | **"My leave" for ADMIN/MANAGER would list everyone's leave** unless the page sends their own employee id. |
| ADMIN may decide **any** pending request (`decide:any`); a MANAGER only their **direct reports'** (`decide:reports`, via `Employee.managerId`) | The request carries no "can I decide?" flag — the UI derives it from the manager link. The server stays the authority (403). |
| Approving fails with **409 "Insufficient leave balance: N day(s) requested, M remaining"** | Shown inline; the request stays pending. |
| An overlap with another pending/approved request is a **409**; an inactive type, or an account with **no employee record**, is a **400** | Shown inline in the apply dialog. |
| Cancel: a `PENDING` request always; an `APPROVED` one only while `startDate > today` — **the server's UTC day** (`start <= today` is a 400) | The button follows the **server day** (`shared/utils/server-day.util`), never the local date. |
| **A rejection reason is not stored on the request** — only in the audit log | The applicant can never see it; the dialog says so. |
| Leave-type names are unique **ignoring case**; delete is a **409** while any request or balance references the type | Same shape as Shift; the confirm points at "deactivate". |
| Balance adjust (`PATCH /leave-balances/:id`) is ADMIN-only, any number ≥ 0, always audit-logged; it may leave `consumed > entitlement` | The dialog only **warns** about an overdrawn balance. |
| Attendance reads an approved leave as `ON_LEAVE` (ADR-LV08) | Verified live: nothing to build, the two domains meet through a read. |

## Architecture

```
shared/components/{employee-picker, status-pill, employee-cell}   promoted from Attendance (2nd consumer)
shared/utils/{server-day.util, paged-list.util}                    promoted / new (2nd and 3rd consumer)
core/employee-directory/   + managerId, ownEmployeeId, managerIdOf
core/master-data-directory/leave-type-directory.service.ts         silentErrors

features/leave/
├── data-access/
│   ├── leave.dto.ts / leave.models.ts / leave.mapper.ts        Decimal strings -> numbers
│   ├── leave-{type,request,balance}.service.ts                 one method per endpoint (all opt out of the toast)
│   ├── leave-type.store.ts                                     MasterDataStore subclass (root)
│   ├── {my-leave,leave-request,leave-balance}.store.ts         page-provided, on createPagedList
│   ├── leave-rules.ts                                          canCancel, canDecide, remainingDays, formatDateRange (pure)
│   └── leave-form.ts                                           builders (only what changed), decimal / whole-day parsing (pure)
├── leave-type-list/ + leave-type-form/                         own table and dialog (no code)
├── my-leave/                                                   balances + my requests + apply dialog
├── leave-request-list/                                         toolbar + table + reject dialog + page
└── leave-balance-list/                                         toolbar + table + adjust dialog + page
```

**Decisions, and what was rejected**

1. **A behaviour-neutral refactor first, as its own commit.** Leave was the second consumer of the
   employee picker, the status badge, the employee label cell and `serverToday`, so they moved to
   `shared/`. Its proof is that **Attendance's specs did not change** (only import paths) and its live
   checks still pass 105/105 + 44/44.
2. **`canDecide` is one tested pure function.** ADMIN: any pending; MANAGER: only where the requester's
   `managerId` is *their own employee id*; unknown → **no**. The buttons stay hidden rather than being
   offered and refused; a MANAGER's other pending rows say **"Not your report"** instead of vanishing.
   *Rejected:* a "waiting on me" inbox — the list filters by **one** employee, so a client filter would
   break pagination.
3. **"My leave" resolves the caller's own employee first when they hold `read:any`.** ADMIN/MANAGER get
   their employee id from the directory and it is sent on both lists; with none they see a "not linked"
   state and **nothing is fetched**. A directory failure is a blocking error with a Retry, *never* a
   silent fall-back to the organisation's leave.
4. **The ledger starts on PENDING** — what an approver came for — and the toolbar follows the store.
5. **A mapper here, none in Attendance**: the wire's Decimal strings genuinely differ from what
   components compare and format.
6. **`createPagedList`** (shared): the page/sort/filter/refetch/step-back state that four stores repeat.
   It was extracted at Leave's third consumer; `AttendanceStore` predates it and is **not yet** on it.
7. **The confirm helper is reused for approve and cancel** (`confirmLabel`, `cancelLabel`, `tone`),
   rather than a bespoke dialog per action.
8. **No duration estimate, no invented policy.** The apply dialog says the days are worked out at approval.
9. **Every request opts out of the global toast**, as in Attendance; `MasterDataDirectory` gained an
   optional `silentErrors`, set for leave types only (the older directories keep their toast).

## Folder Structure

See the tree above. Outside the feature: three promoted components, two utilities, the directory
additions, `ColumnDef` (already flagged in Chapter 13), `ConfirmDialogData.tone`, the routes, the nav
config and the icon list.

## Angular Concepts Used

- **Signals + `computed()`** for who-may-decide (`actor`, `decidableIds`) — they re-evaluate when the
  employee directory loads, with no imperative wiring.
- **`createPagedList`**, a factory called in a field initialiser (it holds signals and a subscription).
- **Page-provided stores** (`providers: [Store]` on the component) and stores passed into dialogs, because
  a dialog is created from the root injector and cannot see a component-scoped provider.
- **A validator that parses the raw string** (`decimalDaysValidator`, `wholeDaysValidator`) with
  `type="text" inputmode="decimal"`, never `type="number"`.
- **`toSignal` over form values** for the overdrawn warning.
- **`HttpContext`** to skip the toast, per request and per directory.

## Routing

Four flat lazy routes, each behind `permissionGuard`: `/leave-types` (`leaveType:read`, every role),
`/my-leave` (`leaveRequest:create:own`, every role), `/leave-requests` (`leaveRequest:read:any`),
`/leave-balances` (`leaveBalance:read:any`). An EMPLOYEE is redirected away from the two ledgers (verified
live) and a direct `PATCH approve` by a MANAGER on a non-report answers 403.

## State Management

- **`LeaveRequestStore`** — starts on PENDING; approve, reject and cancel each refetch (approving a request
  under a PENDING filter removes its row) and step back a page when the last row goes.
- **`MyLeaveStore`** — requests and balances, the year, a `notLinked` flag, and `start(employeeId?)`. A new
  request makes a status filter that would hide it clear itself; cancelling refetches the **balances** too
  (an approved leave gives its days back).
- **`LeaveBalanceStore`**, **`LeaveTypeStore`** (root, on `MasterDataStore`).

## Best Practices

- **Ask "may this caller do this to this row?"** as a pure function, tested for every role and edge, and
  fail *closed* when something is unknown.
- **Never let a broad read permission widen a "my …" screen.**
- **Mirror the server's rule and its clock** (`canCancel` against the server's UTC day).
- **Only say what the server says**: no estimated days, no promise that a rejected employee sees the reason.
- **Show what "empty" means**: no balance yet is *normal*, and the page says why.
- **Every inline failure needs its toast switched off**, or it shows twice.

## Testing

**768 tests** (was 530; 238 new): the mapper, `canCancel` (including the start-day boundary and a caller
that passes the wrong day), `canDecide` for every role and unknown, the builders (only-what-changed, `null`
kept, `"10.0"` equals 10), the four services (every request opts out of the toast), the four stores, the
directory additions, `createPagedList`, and every component.

**Mutation checks — fourteen, all killed by the intended spec**, among them: `canCancel` allowing the start
day; the table judging Cancel against a fixed day; a MANAGER deciding anyone's request; the page treating
every caller as ADMIN; an unchanged balance field sent; the mapper leaving strings; the apply dialog not
blocking on a failed type load; the ledger not starting on PENDING; **"My leave" ignoring the caller's own
employee id**; a cancel not refetching balances; a blank rejection reason sent as `""`; Adjust offered to
everyone; a hidden created request not clearing the filter; `ownEmployeeId` returning the first employee.

**Live, against the real backend, with temporary ADMIN / MANAGER / EMPLOYEE accounts: 135/135.** Covered:
leave-type create / duplicate 409 / edit (only what changed) / delete unreferenced and the 409 for a
referenced one; **My leave** as an EMPLOYEE, as a MANAGER (0 rows although their report has requests) and as
an ADMIN with no employee record (nothing fetched); apply, an overlap 409, cancel (keep / confirm) and
re-apply; the **ledger as a MANAGER** (Approve on the 4 reports' requests only, "Not your report" on the
other, the server's 403 agreeing); **approve** (duration 4 = five weekdays minus the calendar holiday; the
balance row created lazily at 10 / 4), the **insufficient-balance 409**, **reject** with and without a reason
(the reason is in the audit log and **not** on the request); the ADMIN deciding a non-report, cancelling a
future approved leave (days given back) and being unable to cancel one that started; **Attendance reading
`ON_LEAVE`** and `HOLIDAY`; balances (adjust: only the changed field, an overdrawn warning, no-op sends
nothing, audit rows, a half-typed year sends no request); a MANAGER read-only (403 direct); an EMPLOYEE's
own balance card; outages (leave types, balances, employees); 360 px; `Etc/GMT+12`; and deep links. Data
removed and verified. **Attendance's own live checks were re-run twice** (after the refactor and at the
end): 105/105 and 44/44.

## Performance Notes

- The ledger and balances are server-paginated; the requests page loads every employee once (the directory
  cap from Chapter 13) to derive who may decide.
- `decidableIds` is a `computed` over the current page only.

## Accessibility Notes

- Status is a **word and a glyph** (the shared pill); "(overdrawn)" and "Not your report" are words, not colour.
- Every icon button has a tooltip and an `aria-label` that names the row (employee, type, dates).
- The dialogs use `role="status"` for warnings; the not-linked and empty states are text, not just an icon.

## Security Notes

- The UI hides what the caller may not do; **the API refuses it** — verified: a MANAGER approving a
  non-report (403), adjusting a balance (403), an EMPLOYEE creating a leave type (403).
- "My leave" never depends on the caller being trusted to send the right id: an EMPLOYEE sends none (the
  server scopes them), and ADMIN/MANAGER send their own.

## Real Bugs Found During This Work

1. **"My leave" would have listed everyone's leave for an ADMIN or MANAGER.** Found while *writing a comment*
   for `MyLeaveStore` (the comment could not be made true), before any test — `read:any` makes an
   unfiltered list org-wide. Fixed by resolving the caller's own employee first; the store spec and mutant L9
   pin it.
2. **The shared employee cell lost the space between the label and the "Joined …" line** (visually fine,
   read as "Engineer, SalesJoined …"), found by the moved spec.
3. **A leave-types outage showed twice** — the dialog's blocking banner *and* the global toast (the shared
   directory has no opt-out) — found by reading the outage screenshot. → `silentErrors`.
4. **A hint claimed "weekends and holidays are not counted"** — false for an employee with no shift or
   branch (the server counts every calendar day then). Replaced with what is always true.

**Things that looked like bugs and were not** (each checked before changing anything):

- **Two fixture requests came back 409** — my "big request" overlapped the two reject fixtures (the
  overlap rule doing its job). Fixed the fixture.
- **The apply dialog's error messages were missing from a screenshot** — mid-fade; measured `opacity: 1`
  after a wait and re-shot. The verifier now asserts it.
- **Reading a confirm dialog's text or a response status "too early"** failed three checks; each now waits.
- **A spec looked for select options that a `mat-select` does not render until opened.**
- **`Observable<LeaveRequest>` is not `Observable<void>`** — the confirm helper only ever needed
  `Observable<unknown>`.
- **The login page did not render** (Vite `EPERM` after `ng build`/`ng test` beside `ng serve`, again):
  stop, delete the cache, restart, confirm the login form renders.

## Observations Outside This Work's Scope (not changed)

- **Backend:** a rejection reason is kept only in the audit log, so an applicant never learns why.
- **Backend:** no estimate of the days a request will cost before approval, and no "requests awaiting *me*"
  filter (the list takes one employee).
- **Backend:** balances exist only after a first approval, so a new hire's entitlement is not visible.
- **Backend:** the cancel rule and the `year` of a balance are UTC-day based.
- `AttendanceStore` is not on `createPagedList` yet; other features' dialogs still toast on top of inline errors.
- Prettier is configured but not enforced; Branch is still not on the shared screen.

## Interview Questions

1. **Why can't a "My …" screen just call the list endpoint?** A broad read permission (`read:any`) makes the
   list org-wide; the page must pass the caller's own id, or refuse to guess.
2. **Why derive "may I decide?" on the client when the server enforces it?** To offer only actions that can
   succeed — and to fail *closed* when the inputs (the manager link, my own employee) are unknown.
3. **Why no day count on the apply form?** It depends on the branch calendar and the shift and is fixed only
   at approval; an estimate would duplicate a server rule.
4. **Why refetch after an approval instead of updating the row?** Under a PENDING filter the row should
   *leave* the page, and the server owns ordering and totals.
5. **What is a mutation check for?** To prove a spec would notice: break a behaviour, expect a failure.
6. **Why promote a component only at its second consumer?** Before that you are guessing the abstraction.

## Key Takeaways

- A workflow adds one question to every screen: *may this caller do this to this row?* — a pure function.
- A broad permission is a hazard for any "my …" view.
- Fail closed on unknowns; say what you do not know rather than claim it.
- Do not invent a rule the server owns (a day count, a visible reason).
- "Empty" has meanings; say which one.
- Read every state's screenshot; read the comment you cannot make true.
