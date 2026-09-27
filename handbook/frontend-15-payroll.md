# Frontend Chapter 15 — Payroll (the first financial record)

## Theory

**Payroll** turns what the other domains record — a salary, attendance, approved leave — into money,
once a month, and keeps the result **forever**. Every screen before it holds records that can be
corrected (master data, a ledger, a workflow). A payslip cannot: a closed pay period is like closed
books — you never edit it, you post a correction in a later run (ADR-PR01). The backend enforces that by
having **no payslip edit endpoint at all**.

Two aggregates:

| Aggregate | Shape | Screens |
|---|---|---|
| **Payroll run** (one calendar month) | a lifecycle `DRAFT → PROCESSING → FINALIZED → PAID`, one transition per status | `/payroll`, `/payroll/:runId` |
| **Payslip** (one per active employee per run) | a **snapshot** taken when the run is processed, with line items | `/payroll/:runId/payslips/:id`, `/my-payslips`, `/my-payslips/:id` |

**The verified contract** (read from `backend/src/modules/payroll/*`, the Prisma models and the seed, then
probed live before any design):

| Fact | Consequence for the UI |
|---|---|
| Runs are **ADMIN-only** (`payrollRun:*`); every role has `payslip:read:own`; only ADMIN has `payslip:read:any` — **a MANAGER cannot see a report's pay** (ADR-PR06) | Two areas: `/payroll` (ADMIN) and `/my-payslips` (everyone). A manager's deep link to a report's payslip is a 403 state. |
| `PATCH /:id/process` generates **every** active employee's payslip in **one synchronous request** (1.3 s for 23 employees on the dev DB) | A blocking in-flight state ("Generating payslips…"), no double submit, cancelled on leaving the page. |
| After processing, a run can be **neither deleted nor processed again** — DELETE is DRAFT-only | **Processing is the one-way door, not finalizing.** The Process confirm carries the "can't be undone" wording. |
| A working day with **no attendance record is ABSENT → unpaid** — including days that **have not happened yet**, and every weekend of an employee **with no shift** | The confirm always says the first; when the month has not ended by the **server's** day it adds a warning banner. The backend allows it, so the UI warns and does not block. |
| A payslip **snapshots** the employee name, department, designation, branch, employment type and every amount (ADR-PR02); `employeeName` is `null` for an employee with no user account | Payslips are shown **from the snapshot only** — no live directory lookup — and a missing name reads "No name on record". |
| Amounts and day counts are **Decimal strings** (`"1000"`, `"17.5"`) | A DTO → model **mapper**. |
| `GET /payslips` has **no line items and no run status**; only `GET /payslips/:id` has `lineItems` | The list shows totals; the payslip page shows the lines. The run's status is never guessed on an employee's screen. |
| Every list sorts by **one key**, `id` breaking ties — `sortBy=periodYear` returns a year's months **in id order** | The run list always filters to ONE year and sorts by `periodMonth`; **`/payslips` has no year filter at all**, so "My payslips" loads everything (one a month) and orders it on the client. |
| An employee listing with someone else's `employeeId` is **silently re-scoped** to themselves; someone else's payslip by id is **403**; an unknown id **404** | Three distinct "can't show it" states on the payslip page. |
| `payslipCount` exists only on `GET /payroll-runs/:id` | `null` elsewhere — never shown as 0. |

## Architecture

```
core/config/app-currency.ts                         APP_CURRENCY = 'USD' (placeholder; Employee + Payroll)
shared/models/employment-type.ts                    promoted from features/employees (2nd consumer)
shared/components/confirm-dialog                    + optional `warning` (a banner under the message)
shared/components/data-table                        + ColumnDef.align = 'end' (right-aligned amounts)

features/payroll/
├── data-access/
│   ├── payroll.dto.ts / payroll.models.ts / payroll.mapper.ts    Decimal strings -> numbers; null stays null
│   ├── payroll-rules.ts                                          nextAction, canDelete, isPeriodOver, defaultNewRunPeriod,
│   │                                                             periodLabel, formatDays, byPeriodDesc (pure, tested)
│   ├── payroll-run.service.ts / payslip.service.ts               one method per endpoint, all inline-error
│   ├── payroll-run-list.store.ts                                 createPagedList: one year, by month, 12 a page
│   ├── payroll-run-detail.store.ts                               the run + its payslips; refetch after every transition
│   └── my-payslips.store.ts                                      ALL own payslips, ordered here, year filter from the data
├── payroll-run-list/          page + table + new-run dialog
├── payroll-run-detail/        page (steps, one next action, Delete while DRAFT) + payslip table
├── payslip-detail/            ONE page for both routes
├── my-payslips/               page + table
└── payroll.routes.ts          PAYROLL_ROUTES and MY_PAYSLIPS_ROUTES
```

**Decisions, and what was rejected**

1. **A behaviour-neutral step 0, its own commit.** `employment-type.ts` said in its own comment "promote to
   `shared/` the moment Leave or Payroll needs the same labels"; a payslip snapshots the employment type, so it
   moved. `APP_CURRENCY` replaced Employees' two hard-coded `'USD'` placeholders so every amount reads one
   constant. Proof: the 768 existing specs were unchanged and still passed with only commit A applied.
2. **One next action, never four buttons.** `nextAction(run)` returns the only transition the server accepts
   from the run's status; the page shows exactly that button (if the caller holds its permission — fail closed),
   plus Delete while DRAFT. Rejected: a toolbar of all transitions with disabled states — it teaches the user
   a lifecycle they cannot use.
3. **Each confirm says what that step does.** Process: "creates a payslip for every active employee… a working
   day with no attendance record counts as unpaid… can't be deleted or processed again" (+ the warning banner).
   Finalize: "marks the payslips as final; corrections are adjustments in a later run". Mark as paid: "records
   that the payslips were paid. It does not move any money." Rejected: one generic "Are you sure?".
4. **The lifecycle lives on the run page, not the list.** The list opens a run or deletes a DRAFT one; the
   transitions sit next to the payslips they affect. (The Phase 3 plan had row actions on the list too — dropped
   during implementation and reported, because finalizing from a list row hides the payslips being finalized.)
5. **Server words, one explanation.** The status is the server's own term; under the steps one line says what
   it means — "Processing" is "Payslips generated. Review them, then finalize.", not "still running". Rejected:
   inventing a label ("In review") that the audit log and API errors never use.
6. **Order what the server cannot.** The run list filters to one year (default: the server's) and sorts by
   month — exact, and a year fits on one page. "My payslips" has no server-side year filter to lean on, so it
   pages through **all** of a person's payslips (100 a page) and sorts year → month itself; the year select
   lists only years that have payslips. Rejected: `sortBy=createdAt` — wrong as soon as a month is back-filled.
   (The Phase 2 design assumed a year filter on `/payslips`; the DTO work found there is none — reported.)
7. **Snapshot, not directory.** The run's payslip table and the payslip page read the snapshotted name, role,
   branch and employment type. The shared `employee-cell` (a live lookup) is deliberately NOT used: a January
   payslip must not show February's department. The employee picker (live) is used only to *filter*.
8. **"My payslips" resolves who "my" is.** ADMIN holds `payslip:read:any`, so an unfiltered list is the whole
   organisation's pay: the page resolves the ADMIN's own employee from the directory and sends that id; with no
   record it shows "not linked" and fetches nothing; a failed lookup blocks with Retry. MANAGER and EMPLOYEE are
   scoped by the server and send nothing.
9. **No client-side totals.** A run total would mean paging every payslip and adding money in the browser; the
   page shows the server's `payslipCount` and a run-totals endpoint is a recorded backend gap.
10. **Widen shared helpers with optional fields.** `ConfirmDialogData.warning` (absent = unchanged) and
    `ColumnDef.align: 'end'` (absent = unchanged); Leave's 135-check live run passed on top of both.

## Folder Structure

See the tree above. Two route arrays live in one file (`payroll.routes.ts`) because both areas share the
payslip page; `app.routes.ts` has two wrapper entries (`payroll`, `my-payslips`) that own the parent crumbs.

## Angular Concepts Used

- **Signals + `computed()`** for derived UI (`action`, `deletable`, `title`, `busyAction`, the My-payslips year
  list and visible rows). No `computed()` over reactive-form state (a lesson from Shift).
- **`createPagedList`** (the shared page/sort/filter/refetch helper) for the run list and a run's payslips.
- **RxJS `expand` + `reduce`** to page through every page of the caller's payslips in one observable.
- **`createConfirmDelete`** reused as a generic confirm → request → report-failure flow for the three
  transitions (the "id" is the action) and for Delete, with `takeUntilDestroyed` cancelling on navigation.
- **Route data read from `routeConfig`**, and **`pathFromRoot`** to find `:runId` from a non-empty child route
  (a non-empty child does not inherit its parent's params).
- **`CurrencyPipe`** with one app-wide code; `font-variant-numeric: tabular-nums` for aligned digits.
- **`ControlValueAccessor`** reuse: the shared employee picker bound to a standalone `FormControl`.

## Routing

```
/payroll                               PayrollRunListPage        payrollRun:read
/payroll/:runId                        PayrollRunDetailPage      payrollRun:read     (crumb: Payroll run)
/payroll/:runId/payslips/:payslipId    PayslipDetailPage         payslip:read:any    data.origin = 'payroll'
/my-payslips                           MyPayslipsPage            payslip:read:own
/my-payslips/:payslipId                PayslipDetailPage         payslip:read:own    data.origin = 'mine'
```

`:runId` is a wrapper with the "Payroll run" crumb and two children, so a payslip opened from a run reads
**Payroll › Payroll run › Payslip** and its Back link returns to the run. The same component opened from My
payslips reads **My payslips › Payslip** and goes back there. Rejected: one `/payslips/:id` whose "back" has to
guess where the user came from.

## State Management

Every store is provided by its page (fresh per visit, nothing cached across users). The run detail store holds
the run (with `notFound` distinct from `error`) and a paged payslip list; **every successful transition refetches
both** (processing creates the payslips; a transition's response has no count), and **a 409 refetches the run**
so the page shows the status someone else moved it to. `MyPayslipsStore` holds every own payslip, a `loaded` flag
(empty-before-load is not "no payslips"), and a year choice that falls back to the newest year with data.

## Best Practices

- Say what a step does, in the confirm, in the user's terms — especially for the irreversible one.
- Warn, do not block, when the backend allows something risky; name the date you judged by (the server's).
- Show a financial record from its own snapshot, never from today's master data.
- "May this caller do this?" stays a pure, tested function that fails closed (`nextAction` + the permission).
- A broad `:read:any` never widens a "my …" screen (the Leave lesson, applied again).
- When the server can only sort by one key, filter to where one key is exact, or load the small set and sort it.
- Every Payroll request opts out of the global toast; every failure is inline.

## Testing

- **862 tests (was 768; 94 new).** Mapper, rules (every status, both edges of "period over", the January rollover),
  both services (paths, params, the inline-error context), all three stores (the ADMIN-own-id crux, every-page
  loading, refetch after each transition, 409 refetch, 404 vs error), every page and table, the confirm dialog's
  new `warning` (the component had no spec before), the right-aligned columns.
- **17 mutation checks, all killed** — the 12 planned plus five more (paging stops after page 1, a 409 not
  refetched, Delete regardless of status, an action shown without its permission, alignment dropped). One
  planned mutant was changed and said so: "the local day instead of the server's" cannot be told apart in a
  unit test (the runner's local and UTC dates are the same day), so it became "the current month counts as over".
- **Live, against the real backend** (`verify-payroll.mjs`, temporary ADMIN without and with an employee record,
  MANAGER, EMPLOYEE; realistic August attendance — present days, a half day, an absence, a paid and an unpaid
  leave day, a holiday): **63/63, three consecutive clean runs** (62 before a net-pay-first check was added).
  The fixture payslip came out exactly as predicted: 20 working days, 17.5 paid, 2.5 unpaid, 1000 → −125 → 875.
  Leave's own verifier re-run on top of the shared changes: 135/135.

## Performance Notes

Processing is one request doing ~31 attendance reads per employee (measured 57 ms per employee on the dev DB);
fine at this size, recorded as a backend scaling concern. "My payslips" loads one row per month employed, 100 per
request. No client-side money arithmetic.

## Accessibility Notes

Status is a word and an icon, never colour alone; the lifecycle is an `<ol>` with `aria-current="step"` and a
visually hidden "(done)"; the in-flight state is `role="status"`. Every icon-only link has an `aria-label` ("View
payslip of Asha Rao", "Delete August 2026 payroll run") and a tooltip. Amounts are right-aligned with tabular
digits, and the payslip page uses `<dl>` label/value pairs and headed sections.

## Security Notes

Pay is the most sensitive data in the app. Nothing pay-related is cached beyond a page; "My payslips" never
falls back to an unfiltered list for an ADMIN; the UI hides actions the caller lacks, but the server stays the
authority (403/409 shown inline). A MANAGER's attempt to open a report's payslip was verified as refused.

## Real Bugs Found During This Work

1. **Right-aligned headers were not right-aligned** (found reading the first My-payslips screenshot, then
   measured: header right edges 88–119 px left of their values). Cause: `arrowPosition="before"` makes Material lay
   the sort header out as `flex-direction: row-reverse`, where `justify-content: flex-end` is the LEFT edge. Fixed
   with `flex-start`; the verifier now asserts header right = value right (±1 px) for all four amount columns.
2. **Net pay scrolled out of view at 360 px on My payslips** — the one number a person wants. Found in the 360 px
   screenshot; Net pay now follows the period, and the verifier measures it on screen.
3. **The plan assumed a year filter on `/payslips` that does not exist** — found writing the DTOs; My payslips
   loads all and sorts on the client instead (reported as a deviation).

**Not app bugs** (told apart before touching code): a locator matched both a hint and an empty-state heading; the
fixture's payslip was on page 2 because net pay sorts lowest first; `textContent` runs a `<dt>` and `<dd>` together
("Working days20") in both specs and the verifier; `mat-select` options exist only once opened; a Month select
click during the dialog's open animation did not open it (the identical step passed on the run before; fixed by
waiting for the panel); two screenshots were taken mid-fade. And one of mine: Python's `read_text()` defaults to
cp1252 on Windows, so two spec edits containing `·`/`—` silently matched nothing — redone with explicit UTF-8,
files checked for encoding damage (none).

## Observations Outside This Work's Scope (not changed)

Backend: processing a month that has not ended is allowed (and counts the remaining days as unpaid); an employee
with no shift has every weekend counted as unpaid (the dev DB has no shifts, so almost every dev payslip nets 0);
lists sort by one key only; `/payslips` has no year filter and no sort by name; there is no run-totals endpoint; a
payslip carries no run status; processing cost grows with employees × days. Frontend: five one-line copies of the
inline-error `HttpContext` now exist (worth one shared constant); printing / PDF export of a payslip is not built.

## Interview Questions

1. Why is "Process" the dangerous button here and not "Finalize"? How does the UI make that visible?
2. A payslip shows department "Finance" but the employee moved to "Sales" last week. Which one is right, and why
   must the page not use the employee directory?
3. The backend sorts by a single key with `id` as the tie-break. How do you show one person's payslips in
   calendar order without a year filter on the endpoint? When is loading everything acceptable?
4. An ADMIN opens "My payslips". What goes wrong with an unfiltered `GET /payslips`, and what are the three
   states the page must handle?
5. Why does a 409 on "Finalize" trigger a refetch of the run?
6. `justify-content: flex-end` did not right-align a header. Why, and how would you have caught it without a
   screenshot?
7. Why warn — and not block — when the month has not ended?

## Key Takeaways

- A financial record is a snapshot: display it from itself, never from today's master data.
- Find the irreversible step from the backend's rules, not from the status names.
- One next action per state, with a confirm that says what that action does.
- When the server can only sort one way, design the query (or the data size) so one way is enough.
- Measure alignment and visibility; a screenshot shows a defect, a bounding box proves the fix.
