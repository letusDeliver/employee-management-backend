# Frontend Chapter 11 — Shift (the first master-data domain that is *not* `id / name / code`)

## Theory

A **shift** is a named weekly working pattern: a start time, an end time and the weekdays
it applies to ("Day Shift — 09:00–18:00, Mon–Fri"). Employees are assigned at most one.
It matters because Attendance (a later domain) will judge lateness and hours against it.

**The verified contract** (read from `backend/src/modules/shifts/*`, then exercised live):

| Fact | Consequence for the UI |
|---|---|
| Fields: `id, name, startTime, endTime, workingDays[], status, createdAt, updatedAt` — **no `code`** | The shared master-data table and dialog do not fit. First domain to break the mould. |
| Times are 24-hour `"HH:mm"` strings, no timezone (stored as strings, not instants) | A native `<input type="time">` already yields the wire format. No `Date` round-trip. |
| `endTime < startTime` = **overnight**, attributed to the day it *starts* on (ADR-SH03) | The UI needs the same one-line comparison purely for display. |
| The backend **accepts** `startTime === endTime` (a zero-length shift) | Hint the user, never block. The UI must not be stricter than the contract. |
| `workingDays` is a non-empty subset of `MONDAY…SUNDAY` | Multi-select of seven days, at least one required. |
| List sorts: `name / startTime / endTime / status / createdAt` — no `code` | The shared query type (`sortBy: name|code|status|createdAt`) is wrong for Shift. |
| Name unique, checked case-insensitively in the service | A different-case duplicate is a **409** the dialog must show inline. |
| `shift:read` for every role; create/update/delete **ADMIN only** | Two-layer gating, same as the other master data. |
| Delete is blocked (409) while *any* employee, including soft-deleted, references it | The confirmation copy points at "deactivate instead". |
| Only ACTIVE shifts are assignable; the backend re-validates a `shiftId` **present** in an Employee PATCH | Same crux as Chapter 10, now for a second foreign key. |

## Architecture

Two steps, one initiative: the Shift screens, then the Employee integration (without it a
shift could be created but never assigned from the UI).

```
shared/master-data/
├── master-data.models.ts      + MasterDataBase (id/name/status), MasterDataQueryBase
└── master-data.store.ts       + a 4th type parameter Q (the domain's own list query)

features/shifts/
├── data-access/
│   ├── shift.models.ts        Shift, Weekday, WEEKDAYS, ShiftListQuery, requests, responses
│   ├── shift.service.ts       explicit HttpClient wrapper on /shifts (`shifts` -> items)
│   ├── shift.store.ts         ~10-line MasterDataStore subclass
│   ├── shift-schedule.ts      isOvernight(), formatWorkingDays()  (pure, tested)
│   └── shift-update.ts        buildShiftCreate / buildShiftUpdate  (pure, tested)
├── shift-list/                page (smart) + table (presentational)
└── shift-form/                create+edit dialog

core/master-data-directory/shift-directory.service.ts     '/shifts', 'shifts'
```

**Decisions, and what was rejected**

1. **Generalise the store's *types*, keep Shift's own table, dialog and page.**
   `MasterDataStore` already held the hard-won behaviour (cancel a superseded request,
   refetch after a mutation, step back a page after deleting the last row). Only two type
   constraints blocked Shift: `T extends MasterDataRecord` (needs `code`) and the `sortBy`
   union. So `T` loosened to `MasterDataBase`, and a `Q extends MasterDataQueryBase`
   parameter (defaulting to the old query) was added. Department, Designation and Branch
   compile untouched and their specs pass unedited — that is the proof nothing regressed.
   *Rejected:* a separate `ShiftStore` copy (it would duplicate exactly the logic where the
   subtle bugs were fixed) and bending the shared table/dialog around one domain.
   *Accepted cost:* the ~40-line delete-confirm flow is duplicated in `ShiftListPage`.
   Revisit at Holiday Calendar, when the next different shape shows what is truly shared.
2. **Native `<input type="time">`.** Its value is already `"HH:mm"`. The Material timepicker
   hands back a `Date` that would be converted back to a string, adding a timezone bug
   surface for a value that has no timezone.
3. **A weekday toggle group** (Mon→Sun, short visible label, **full name** as `aria-label`),
   a compact "Mon–Fri" display, and a "(next day)" flag. Runs of three or more consecutive
   days collapse; one or two are listed ("Sat, Sun"); the week never wraps.
4. **Employee integration in the same initiative.** A `ShiftDirectoryService`, a Shift select
   on the Employee form, `shiftId` in create/update, and the shift name on the detail page.
   Employee-list filter/sort by shift stays out of scope.

**The crux again — change only what changed.** `buildEmployeeUpdate` treats `shiftId` like
`branchId`: a new id, `null` ("No shift") or absent. An unchanged shift is never resent, so
a shift deactivated after it was assigned cannot fail an unrelated edit. This was
**proven, not assumed**: the live run also sends `{shiftId: <deactivated>}` straight to the
API and gets a 400, then shows the form's `{salary}` edit succeeds.

## Folder Structure

See the tree above. `MasterDataFormDialogComponent`, `MasterDataTableComponent` and
`MasterDataListPageComponent` are unchanged and still serve Department and Designation.

## Angular Concepts Used

- **Generics with defaults on an abstract class** — `MasterDataStore<T, C, U, Q = MasterDataListQuery>`.
  Defaults keep every existing subclass source-compatible; only Shift names a fourth argument.
- **`toSignal` + `computed`** — the overnight/zero-length hint is derived from the form's
  `valueChanges`. **But see "Real Bugs": a `computed` over form-control *state* is a trap.**
- **`MatButtonToggleGroup` with `multiple`** bound to a reactive control; the value is an
  array, sorted into calendar order before it is sent (click order must never matter).
- **`hideMultipleSelectionIndicator`** — see "Real Bugs".
- **Two pure modules** (`shift-schedule`, `shift-update`) so the rules are unit-tested
  without a component.
- **A helper that registers an `effect()` from the constructor** — the Employee form now has
  two optional links (Branch, Shift) that each disable their select when their lookup fails.

## Routing

Flat `/shifts`, `permissionGuard`, `data: { breadcrumb: 'Shifts', permissions: ['shift:read'] }`.
Create/edit is a dialog, not a routed page. One `NAV_CONFIG` entry (icon `schedule`) feeds
the sidebar and the dashboard cards.

## State Management

`ShiftStore` is `providedIn: 'root'`, inherits everything from `MasterDataStore`, and adds
only its wording. Nothing is optimistic; every mutation refetches. The Shift directory
follows Chapter 10's rules: pages through every page, no long-lived cache, `refresh()` on
entry, and the *consumer* decides fatality — the Employee form treats it as **optional**
(a failure disables just that select, with a hint, and never blocks the form); the detail
page treats it as display-only ("—").

## Best Practices

- **Be exactly as strict as the backend.** Overnight and zero-length shifts are valid, so
  the UI explains them and lets them through.
- **Order-independent comparison for sets.** Working days are compared and sent as a
  calendar-ordered set; the same days in another click order are not a change.
- **An edit that changes nothing sends nothing** (no request, dialog just closes).
- **Do not rely on colour alone** for the selected weekday: fill *and* a bolder label, and
  `aria-pressed` for assistive tech.
- **Measure layout, do not eyeball it** — the live script now asserts labels fit, icons are
  side by side and dates are on one line (see next sections).

## Testing

**252 tests, all passing** (175 before this chapter; **77 new**). Step A, 60: schedule 11,
update-builder 10, store wiring 6, table 6, dialog 14, page 13. Step B, 17 net: update-builder
6, mapper 2, detail 2, form 7, directory 1 (one more `it.each` row) — 18 added, minus the one
old "never sends `shiftId`" test, which now asserts the opposite and was replaced.

Deliberate coverage: overnight and zero-length are *informed, not blocked*; a blank name, no
working day and an empty time each block with a labelled error and send nothing; an
untouched edit sends no request; the store sorts by `startTime`; a duplicate-name 409 shows
inline; the form spec covers a failed shifts lookup, an inactive *current* shift kept as
the first real option, and clearing with `null`.

**Live verification (real backend, temporary ADMIN + EMPLOYEE accounts, fixtures via the
API/Prisma, all `ZZV`-prefixed): Shift screens 60/60; Employee integration 28/28.** A
first attempt at the Employee run scored 26/27 — the one miss was *my expectation* ("the
inactive current shift is first"); the option list correctly shows "No shift" first, as
Branch does. The expectation was fixed and a spacing measurement added, then re-run clean.
Covered: list, defaults, create (POST body exactly right), overnight row ("22:00 – 06:00
(next day)"), zero-length accepted, different-case duplicate → inline 409, every client-side
validation, edit sends only `{endTime, status}`, an untouched edit sends nothing, filters,
refetch-after-edit under a filter, sort by Hours really orders by start time, delete
unused, delete in use → 409, a plain EMPLOYEE gets no New/Edit/Delete, a deep-link
reload, a 360 px dialog, and the whole Employee flow above. **Test data removed and verified:
0 shifts, 30 employees (the dev baseline).**

## Performance Notes

The Employee form and detail page add one more small `GET /shifts` (`limit=100`) per visit,
like the other lookups. The Shift list is server-paginated. No cache, nothing to invalidate.

## Accessibility Notes

Each weekday toggle has a **full-name** `aria-label`; the group is labelled by its visible
"Working days" caption; "(inactive)" and "(next day)" are text, not colour; the "at least one
day" error is `role="alert"`, the schedule hint `role="status"`; every icon button carries the
shift's name. Verified at 1280 px and at 360 px.

## Security Notes

Client-side permission checks are UX only; the backend re-enforces `shift:create/update/delete`
(ADMIN only). Verified live: an EMPLOYEE account sees the list but no New/Edit/Delete.

## Real Bugs Found During This Work

Four defects. One was caught by a component spec while writing it; **the other three were
invisible to every passing test** and were found by looking at the pages and then measuring
them:

1. **A `computed()` over form state never updates.** The "Select at least one working day"
   error was a `computed(() => control.invalid && control.touched)`. `invalid` and `touched`
   are plain properties, not signals, so the computed cached its first value (`false`)
   forever and the message would never have appeared. A *component spec* caught it (the
   expected text was absent). Fixed by making it a method. Rule: **signals for signals,
   methods for reactive-forms state.**
2. **The weekday labels were clipped.** Material's selected-state checkmark needs ~26 px;
   each of seven toggles has 61 px in the dialog and **41 px on a 360 px phone**, so "Mon"
   rendered as "Mo" and neighbours overlapped. Found by reading the screenshots. Fixed with
   `hideMultipleSelectionIndicator`, a bolder label for the selected days, and — because the
   labels *still* clipped on the phone — a scoped rule cutting Material's 12 px-per-side
   label padding (there is **no token** for it, so this is the one justified `::ng-deep`,
   scoped under the toggle group). A **measured** check now fails if any label leaves its
   toggle, at both widths; it caught the residual phone clipping the first fix left.
3. **The table stacked its action icons and wrapped the date** — the same failure Chapter 10
   already recorded, in a fresh table: with six columns the auto layout squeezes the actions
   cell. Fixed with `nowrap` on the short cells; measured (icons share a top, date is one
   line).
4. **A two-line hint ran into the next row's label** when the shifts lookup failed. Branch's
   hint had the identical weakness (the grid gap is 4 px). Both optional selects now add
   bottom margin while their hint shows; measured at 16 px clear.

**Things that looked like bugs and were not** (each checked before changing anything):

- **Two early runs lost their first sidebar click** (an ADMIN session, then an EMPLOYEE one).
  In a *third* run a `vite-error-overlay` intercepted the Sign-in click; minutes later it was
  gone with no change from me. `ng serve` was recompiling while I edited files. Sixteen
  immediate post-login clicks afterwards (Designations and Shifts, eight each) lost none. The
  likely cause is the dev server mid-rebuild; **that is an inference — the overlay was seen
  in one of the three runs, not in the two that lost the click, so it is not proven.**
- Clicks timing out on "Create Shift" were **my script** clicking a button the form had
  correctly disabled (`invalid && touched`, the shared dialogs' existing rule). The check now
  asserts the error text is visible and the button is disabled.
- A Salary/Date label that appeared to overlap its value in one screenshot was Material's
  floating-label animation caught mid-flight; re-shot after 800 ms and measured — no overlap.
- One run failed only because earlier runs' fixtures had pushed the "In Use" row off page 1
  of the default sort — a harness artefact; a clean fixture run passed.

## Observations Outside This Work's Scope (not changed)

- The delete-confirm flow is now duplicated between `ShiftListPage` and
  `MasterDataListPage` (deliberate — see decision 1).
- Employee **list** filter/sort by shift, and a Shift column, are not built; the backend
  already supports `shiftId` filtering and a `shift` sort.
- A failed optional lookup still raises the global "Something went wrong" toast (an
  existing interceptor behaviour) on top of the inline hint.
- Prettier is configured but not enforced: every pre-existing file also fails
  `prettier --check`, so the new files follow the surrounding style rather than being
  reformatted.
- Branch is still not on the shared screen and still patches its list locally.

## Interview Questions

1. **How do you reuse a base class for a domain that almost fits?** Loosen its *types*, not
   its behaviour: find the two or three constraints that block the newcomer, widen them with
   defaults so existing subclasses are untouched, and keep the divergent UI separate.
2. **Why is a zero-length shift a hint and not an error?** The backend accepts it. A UI
   stricter than its contract rejects data other clients can create, and users cannot fix it.
3. **Why does a `computed()` over `control.touched` never update?** Reactive-forms state is not
   signal-based, so there is no dependency to track; the computed memoises its first result.
4. **Why compare working days as a set?** Click order is not meaning. Sorting into calendar
   order makes both the comparison and the request body deterministic.
5. **Why native time inputs over a timepicker?** The value is already the wire format and the
   field has no timezone; a `Date`-valued widget adds a conversion that can only introduce bugs.
6. **What is the value of a measured layout check?** jsdom does no layout, so unit tests pass
   over clipped labels. Measuring bounding boxes turns "looks wrong" into a failing assertion.
7. **Why send `null` for "No shift" but omit the key when unchanged?** Absent means "leave it",
   `null` means "clear it"; resending an unchanged, since-deactivated value is a 400.

## Key Takeaways

- The store's *behaviour* was reusable; only its *types* were too narrow. Widen types with
  defaults instead of copying behaviour.
- Be exactly as strict as the backend — inform, don't block.
- Signals for signals, methods for reactive-forms state.
- Read the screenshot **and** measure it: three layout defects were invisible to 235 passing
  tests, and a measured check then found that the first fix had left phone-width clipping behind.
- Separate "the app is wrong" from "my script is wrong" before touching code — and say which
  parts of a diagnosis are proven and which are not.
