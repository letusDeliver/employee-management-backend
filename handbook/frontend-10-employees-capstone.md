# Frontend Chapter 10 — Fixing Employees Against the Real Contract (the master-data capstone)

## Theory

Feature 6 (Employees) shipped **before** Department, Designation, Employment Type
and Branch existed as governed master data. The backend then migrated
`Employee.department` / `jobTitle` (free text) to mandatory foreign keys
(`departmentId`, `designationId`), added a mandatory `employmentType` enum, and
added optional `branchId` / `shiftId`. Nobody touched the frontend, so it kept
modelling the old shape. Earlier chapters recorded this as "Employee create/edit is
broken". Measuring it showed the problem was much larger.

**What was really broken — observed live against the real API, not inferred:**

| A user… | What happened |
|---|---|
| Opened the Employees list | The Department and Job Title columns were **blank**; row buttons were labelled "View undefined". |
| Opened an employee | The page heading was empty; the delete confirmation would have read "Delete the undefined record in undefined". |
| Clicked the "Job Title" header | `sortBy=jobTitle` → **400** (the backend's whitelist has no such key). |
| Typed in the Department / Job title filters | The request succeeded and **the filters were silently ignored** — everyone came back. |
| Created an employee | `POST {department, jobTitle, …}` → **400**, shown as a raw validation dump. |

The cause is one fact: the API now returns **bare foreign keys** — `departmentId`,
`designationId`, `employmentType`, `branchId`, `shiftId` — and no nested objects (the
repository's `include` exists only for Payroll's own read). The frontend read
`dto.department` and `dto.jobTitle`, which are `undefined`.

**Two backend behaviours the design had to honour** (both confirmed live):

1. `PATCH /employees/:id` re-validates assignability of **any** foreign key that is
   *present* in the body, even if unchanged. With a real deactivated department,
   `{salary}` → 200, but `{departmentId: <same>, salary}` → **400** "this department
   is not active and cannot be assigned".
2. The master-data list endpoints cap `limit` at 100 (101 → 400), and the dev data
   already held 69 departments and 74 active designations. A lookup that fetches "one
   page" would silently truncate.

## Architecture

Two commits: a tiny independent one first, then the capstone.

**Commit A — the breadcrumb.** The Employees list showed "Employees › Employees". The
route table deliberately gives the empty-path list child no breadcrumb, but Angular's
default `paramsInheritanceStrategy: 'emptyOnly'` makes an empty-path child *inherit its
parent's `data`*, and `BreadcrumbsComponent` read the inherited `snapshot.data`. The fix
reads the route's own `routeConfig.data` instead. It was proven **test-first**: the spec
was written and run against the unfixed code, where exactly one test failed
(`['Employees', 'Employees']`), then the one-line fix turned it green. Every route in the
app declares its own breadcrumb, so none relied on inheritance.

**Commit B — the capstone.**

```
core/master-data-directory/
├── master-data-directory.ts          generic lookup base (pages through EVERY page)
├── department-directory.service.ts   config: '/departments', 'departments'
├── designation-directory.service.ts  config: '/designations', 'designations'
└── branch-directory.service.ts       config: '/branches', 'branches'

features/employees/data-access/
├── employment-type.ts                the closed enum + labels (no endpoint, no screen)
├── employee.dto.ts / model / mapper  rebuilt on the real contract
├── employee-update.ts                buildEmployeeCreate / buildEmployeeUpdate (pure)
└── employee.store.ts                 list half rebuilt; documents half unchanged
```

plus the list page, toolbar, table, detail page and form rewritten.

**Decisions, and what was rejected**

1. **A `core/` lookup directory, generic, one small provider per domain.** Features may
   not import each other (blueprint §1), so Employees cannot reach into
   `features/departments`; the lookup must live in `core/`, repeating each endpoint's
   path and response key once. It exposes two views of the same data: `entries()`
   (every record — display names and filters, because an employee keeps a department
   after it is deactivated) and `active()` (only assignable records — a positive
   allowlist, `status === 'ACTIVE'`). It **pages through every page** and holds **no
   long-lived cache**: master data changes, and the Department screens should not have
   to know who caches them, so each consuming page just calls `refresh()` on entry (a
   handful of small GETs; concurrent calls share one). Four hand-written copies were
   rejected; so was a cache invalidated by the Department store.
2. **Whether a failed load is fatal is the consumer's decision.** On the list, names are
   display-only enrichment: a failure degrades to "—" and empty filter lists and never
   stops the list working. On the form the values are mandatory, so a failed Department
   or Designation load **blocks** the form with a Retry. Branch is optional, so a
   branch-only failure disables just that select and leaves the form usable — an
   unchanged branch is never sent, so nothing is lost.
3. **Shift is deferred.** There are zero shifts and no way to create one in the UI. The
   model still round-trips `shiftId`, and no request ever sends it.
4. **The edit form sends only what changed** (`buildEmployeeUpdate`) — the crux, see
   below. A form with no changes sends *no request*: a no-op PATCH still writes an audit
   row and bumps `updatedAt`.
5. **`EmployeeStore` moves onto `createListQueryState`** with request cancellation.
   Create and update deliberately touch **no list state** — both navigate to the detail
   page and the list reloads on entry, so a patched row could only ever be wrong. Delete
   is the one mutation that happens *on* the list, so it refetches (stepping back a page
   if it removed the only row on a later one) — but only when the deleted row is in the
   list currently held, so a delete from the detail page costs no needless request.
6. **A real DTO/Model/Mapper** stays (salary is a string on the wire), and gains the new
   fields. Employment type is a feature-local labelled constant; promote it the moment
   Leave or Payroll needs the same labels.

**The crux: change only what changed.** `buildEmployeeUpdate(original, form)` returns a
PATCH body with only the fields that differ. An unchanged `departmentId` /
`designationId` / `branchId` is *never resent*, so a since-deactivated department cannot
fail an edit that never touched it. Optional links use three states: a new id, `null`
("clear it"), or absent ("leave it"). The select still **shows** the employee's current
inactive department — first in the list, labelled "(inactive)" — so it never goes blank;
another employee's form cannot offer it.

## Folder Structure

See the trees above. `EmployeeDocumentsDialogComponent` and the document DTOs are
untouched.

## Angular Concepts Used

- **A second, narrow abstract-ish base class** — `MasterDataDirectory` takes its config
  through the constructor and is subclassed only to supply it (`providedIn: 'root'`).
  Same rules as `MasterDataStore` (chapter 9): a base class only when the behaviour is
  identical and stateful.
- **`ReplaySubject` as a deliberately-shared in-flight request.** `refresh()` starts
  immediately, returns a shared observable, and clears the in-flight marker in
  `finalize()`; state lives in signals, so an ignored result is safe.
- **`computed()` chains for form readiness** — `formReady`, `canSubmit`,
  `branchUnavailable`, and per-select option lists that depend on the *original* record
  so the current inactive value is included.
- **`effect()` with guards.** One effect patches the edit form once both the employee
  *and* the lookups are ready (the select's options must already contain the value). It
  checks `employee.id === this.employeeId`, because `EmployeeStore.selected` is a
  singleton that may still hold *another* employee until this one's load lands.
  Another effect disables the branch control when its lookup failed.
- **`FormControl.disable()` still appears in `getRawValue()`** — which is why a disabled
  branch cannot silently clear it: the diff sees the original id and omits the field.
- **`subscriptSizing` and `items-start`** — see "Real Bugs".

## Routing

Unchanged, except the breadcrumb fix above. `employee:read:any` still gates the list
(an `EMPLOYEE` has only `:own`, so no Employees link and a direct visit to `/employees`
lands on the dashboard — verified live).

## State Management

`EmployeeStore`'s list state is now `createListQueryState`; `loadList()` cancels a
superseded request (unsubscribing *before* setting `loading`, because `finalize()` runs
on unsubscribe). The lookups are signals on the directories. Nothing is optimistic.

## Best Practices

- **Names are enrichment, never a dependency — except where they are mandatory.** The
  same lookup is display-only on a list and blocking on a form. The rule is decided per
  consumer, not per service.
- **Never show a raw id or "undefined".** An unresolvable name is a plain "—"; every
  icon-only button's `aria-label` falls back to "employee". Tested, and the live run
  asserts no "undefined" appears in the table markup.
- **A date-only value is a calendar date, not an instant** (next section).
- **Send only what changed** when the server re-validates what you send.

## Testing

**175 tests, all passing** (51 before this chapter; **124 new**). New: directory 16,
mapper 16, update-builder 14, store 17, toolbar 5, table 7, detail page 7, list page 13,
form 23, breadcrumbs 6.

The form spec runs the **real** directory services against a fake HTTP backend, so the
option lists, the blocking behaviour and the changed-only rule are tested end to end. The
mapper spec includes a **timezone-parameterised** test (`America/New_York`,
`America/Los_Angeles`, `Pacific/Auckland`, `Asia/Kolkata`, `UTC`) that first proves the
runtime honoured the zone change — and skips honestly if it did not, rather than passing
a test that could not have failed.

**Mutation checks.** Because everything passed first time, eight behaviours were
deliberately broken at once: resending every FK on edit, fetching only the first
directory page, dropping the step-back condition, dropping the current-inactive option,
reading `snapshot.data` for breadcrumbs, omitting instead of `null` for a cleared branch,
`new Date(dto.dateOfJoining)` in the mapper, and letting the form submit after a failed
lookup. **Seven were caught** by their intended specs (23 failures in all). **The eighth
survived** — and that was the most useful result: no test covered *a lookup that fails
after the directories were already loaded earlier in the session*. The existing blocking
tests only covered a first-time failure, where nothing is loaded anyway. The directories
are root singletons, so the stale-cache case is the realistic one; a test was added,
confirmed to pass on the correct code and to fail under that mutation.

## Performance Notes

Each page that shows names adds a few small GETs (one per lookup, `limit=100`): 2 on the
list (department + designation — confirmed in the live run's request log) and 3 on the
form and detail (adding branch — by construction, and asserted in the specs, not
separately timed live). The lists are still server-paginated.
There is deliberately no cache, so there is nothing to invalidate.

## Accessibility Notes

Every select has a visible label; "(inactive)" is text, not colour; errors use the inline
banner; the blocked form's Retry is a real button; icon-only row buttons carry
`aria-label`s built from names. The form grid collapses to one column on narrow screens
(verified at 390 px).

## Security Notes

Client-side permission checks are UX only; the backend re-enforces
`employee:create/update/delete`. Verified live: an `EMPLOYEE` account has no Employees
link and cannot open the list.

## Real Bugs Found During This Work

**A latent defect nobody had reported: the date of joining drifts a day in some
timezones.** Found while rewriting the mapper. The API returns a date-only value as an
ISO instant at UTC midnight (`2024-01-01T00:00:00.000Z`); `new Date(thatString)` in a
timezone *behind* UTC is the previous evening locally. Measured:

| Zone | Local date shown for 2024-01-01 |
|---|---|
| Asia/Kolkata, UTC | 2024-01-01 (correct) |
| America/New_York, America/Los_Angeles | **2023-12-31** |

So the UI showed the day before — and because an edit re-sent the *displayed* date, each
save drifted it a further day earlier. It had gone unnoticed because the developer's zone
is ahead of UTC. Fixed by parsing only the `YYYY-MM-DD` part as a **local** calendar
date, with a per-timezone test; the edit form also no longer resends an unchanged date.

**Two visual defects, found only by looking** (no unit test can — jsdom does no layout):

1. The **Branch select rendered taller than its neighbours**: with
   `subscriptSizing="dynamic"` it stretched to fill its grid row. Fixed with `items-start`
   on the grid.
2. With a seventh column, the row's **View / Edit / Delete icons stacked vertically**,
   making every row three icons tall. Fixed by wrapping the actions in a
   `whitespace-nowrap` flex row (row height 44 px, all three buttons on one line —
   measured).

**Things that looked like bugs and were not** (each checked before deciding):

- The first live run failed 3 of 54 checks. All three were the script: two read a dialog's
  text mid fade-in (the same mistake as before), and one asserted "every row is Contract"
  over **zero rows**, which passes vacuously — it now uses Full-time and requires at
  least one row, and a later check confirms the Contract filter finds the employee just
  created.
- Playwright reported the Employment type select's own floating label as "intercepting
  pointer events". It looked like a usability bug, so it was tested with a **real mouse
  click at the exact point**: every select opened. The label really has
  `pointer-events: all`, but the click still reaches the field. A Playwright
  actionability quirk, not a user problem; the script now clicks with `force`.
- After choosing an option, the *next* forced click landed on the overlay backdrop because
  the previous panel was still animating closed. The helper now waits for the panel to
  detach.
- "Salary" and "Date of Joining" showed red labels in a screenshot with valid values.
  Re-checked after a second: no field is marked invalid, Create is enabled — a screenshot
  race, not a bug.

## Observations Outside This Work's Scope (not changed)

- **Pre-existing form pattern:** the submit button is disabled while `form.invalid &&
  form.touched`, so once a field has been touched (even just by opening and closing a
  select) it stays disabled until the form is valid. Only the *first* click on the
  untouched form shows every required error. Shared with the Branch dialog; a design
  discussion, not a defect fixed here.
- At 1280 px the toolbar's third select wraps to a second line (search + three selects).
- `managerId` / `userId` are still pasted UUIDs, not searchable pickers; Shift has no
  select; the global error toast still duplicates inline errors; the shell's overlay
  drawer stays open after a nav tap at narrow widths.
- Employees have no "restore" for a soft-deleted record (the dev DB holds 13 historical
  soft-deleted rows).

## Interview Questions

1. **The API changed a field from a string to a foreign key. What breaks, and how do you
   find all of it?** Everything that read the old field: columns, labels, sorts, filters,
   forms, confirmation copy. Measure against the running API, not the code — reading the
   frontend alone finds the create form; exercising every screen finds the rest.
2. **Why is the same lookup blocking on a form but degradable on a list?** Because the
   consequence differs. A mandatory FK's options are a functional dependency; a name in a
   column is enrichment. The rule belongs to the consumer.
3. **Why does the edit form send only changed fields?** The server re-validates every FK
   present in a PATCH. Resending an unchanged, since-deactivated value fails an edit that
   never touched it. Omitting a key means "leave it"; `null` means "clear it".
4. **Why no cache in the directory?** Master data changes, and the screens that change it
   should not need to know who caches it. Refetching on entry costs a few small requests
   and removes an invalidation problem entirely.
5. **How do you avoid truncating a lookup?** Page through every page up to the API's
   maximum `limit` — never assume the first page is everything.
6. **What does a mutation check that survives tell you?** A missing test. Here, a failed
   refresh after a successful earlier load — the realistic case for a singleton cache.
7. **Why can a date-only field drift, and why did nobody notice?** An ISO instant at UTC
   midnight is the previous evening in a zone behind UTC, and an edit form re-sends what it
   shows. It is invisible in zones ahead of UTC.

## Key Takeaways

- Verify the damage before designing the fix: the "broken create form" was really five
  broken things, plus a latent timezone defect.
- Never render a raw id or "undefined": resolve a name, or say "—".
- Decide fatality per consumer, not per service.
- Send only what changed when the server re-validates what you send.
- A surviving mutation is a gift: it names the test you forgot.
- Look at the page. Two real layout defects were invisible to 175 passing tests.
- Distinguish "the app is wrong" from "my script is wrong" *before* changing anything — and
  when a click seems blocked, test what a real mouse does.
