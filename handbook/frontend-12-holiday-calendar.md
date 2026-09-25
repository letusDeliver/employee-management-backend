# Frontend Chapter 12 — Holiday Calendar (the first parent → child domain)

## Theory

A **holiday calendar** is a named, *year-agnostic* container of dated **holidays** ("India Public
Holidays" holds 15 Aug 2026, 2 Oct 2026, 15 Aug 2027 …). A **branch** may follow at most one
calendar, and many branches may share it. Attendance and Leave (later domains) will ask "is this
date a holiday for this employee's branch?" from this one source (ADR-HC01/HC04).

It is the first domain that is a **hierarchy** — `HolidayCalendar → Holiday` — and the first whose
child rows are managed on a **detail page** of their own, not in a dialog over a list.

**The verified contract** (read from `backend/src/modules/holidayCalendars/*` and
`docs/domain-holiday-calendar.md`, then exercised live):

| Fact | Consequence for the UI |
|---|---|
| Calendar: `id, name, status, createdAt, updatedAt` — **no `code`** | Same as Shift: `MasterDataStore` fits (types already widened), the shared table/dialog do not. |
| Calendar sorts `name / status / createdAt`; list has `search` + `status` | The shared toolbar is reused as-is. |
| Holiday: `id, holidayCalendarId, date, name, isOptional, createdAt, updatedAt` | A second, un-paginated resource under the calendar. |
| `date` is a **calendar date** returned as an ISO instant at UTC midnight (`2026-08-15T00:00:00.000Z`) | `new Date(holiday.date)` is the previous evening west of UTC. Chapter 10's bug, now with a second consumer. |
| A date is unique **within a calendar** (DB unique + service check → **409**) | The holiday dialog shows it inline. |
| Holiday list is un-paginated (a handful of entries a year) | Load whole; filter by year in the browser. |
| `holidayCalendar:read` for **every role**; every mutation ADMIN-only | Two-layer gating. Note the backend gates **holiday** add/edit/delete on `:update`, and only deleting the **calendar** on `:delete`. |
| Deleting a calendar is a **409** while any branch uses it; its holidays cascade with it | The confirm copy says both, and points at "deactivate instead". |
| Only an **ACTIVE** calendar is assignable to a branch; the backend re-validates a `holidayCalendarId` that is **present** in a Branch create/update; `null` clears, absent leaves alone | The crux of the Branch step (Chapter 10's rule, a third time). |
| Calendar-name uniqueness is **exact-case** (`findFirst({ where: { name } })`), unlike Shift's case-insensitive check | "India" and "india" can coexist. Found by a failing test of mine; **not** changed (backend, out of scope). |
| `DELETE` (calendar and holiday) answers **200** + `{ message }`, not 204 | The service maps it to `void`; nothing else depends on it. |

## Architecture

Three steps, one initiative:

```
shared/master-data/confirm-delete.ts            createConfirmDelete()   (extracted, 3 consumers)
shared/utils/date-only.util.ts                  parseDateOnly / formatDateOnly  (extracted, 3 consumers)

features/holiday-calendars/
├── data-access/
│   ├── holiday-calendar.models.ts   HolidayCalendar, Holiday, requests, responses
│   ├── holiday-calendar.service.ts  /holiday-calendars   (`holidayCalendars` -> items)
│   ├── holiday.service.ts           /holiday-calendars/:id/holidays[/:hid]
│   ├── holiday-calendar.store.ts    ~10-line MasterDataStore subclass (root)
│   ├── holiday-list.store.ts        ONE calendar + its holidays (provided by the page)
│   ├── holiday-date.ts              year of / label of / default year / filter  (pure, tested)
│   └── holiday-update.ts            buildHolidayCreate / buildHolidayUpdate     (pure, tested)
├── holiday-calendar-list/           page (smart) + table (presentational)
├── holiday-calendar-form/           create+edit dialog for the calendar
├── holiday-calendar-detail/         page + holiday table
└── holiday-form/                    add+edit dialog for a holiday

core/master-data-directory/holiday-calendar-directory.service.ts   '/holiday-calendars', 'holidayCalendars'
features/branches/data-access/branch-calendar.ts                    the send-only-what-changed rule
```

**Decisions, and what was rejected**

1. **Extract the two things that reached their third copy.** Chapter 11 left the ~40-line
   confirm → delete → report-failure flow duplicated (Shift) and said to decide here. Holiday
   Calendar made three identical consumers, so `createConfirmDelete()` is now a helper the shared
   list page, Shift and both Holiday Calendar pages call from a field initialiser. Likewise the
   date-only parse/format that lived privately in the Employee mapper became
   `shared/utils/date-only.util.ts`. The mapper keeps its `toDateOnlyString` export as an alias
   (`= formatDateOnly`) so Employees' specs and update diff are untouched. *Rejected:* extracting
   at the second copy (guessing the shape) or a fourth copy (drift).
2. **The calendar list reuses the store and the toolbar, not the table/dialog/page.** No `code`,
   own columns, and a row that *navigates* (a link to the detail page) instead of only editing.
   Like Shift it keeps its own table, dialog and page.
3. **A detail route, not a dialog, for holidays.** A calendar owns many dated rows; they need
   their own page with a year filter and their own add/edit dialog. The list edits only the
   calendar's own name and status, in one place.
4. **A store per detail page.** `HolidayListStore` is *provided by the page component*, not
   `providedIn: 'root'`: every visit starts empty, nothing leaks from the previously opened
   calendar, and the state is gone when the page is left. It loads the calendar and its holidays
   with one `forkJoin`, and (like `MasterDataStore`) **refetches** after every add/edit/delete —
   the server owns the date order, a locally patched row could land in the wrong place.
5. **Load whole, filter by year in the browser.** The list is un-paginated by the backend. The
   year select defaults to the current year when it has entries, otherwise the newest year that
   does (an admin preparing next year's dates must still see something), otherwise "All years".
   After adding or editing a holiday the select **jumps to that holiday's year** — otherwise the
   row just saved would be invisible.
6. **The date is a calendar date, everywhere.** Read only via `parseDateOnly` (local
   year/month/day from the `YYYY-MM-DD` prefix); written via `formatDateOnly` from **local**
   parts, never `toISOString()`. The edit diff compares `YYYY-MM-DD` *strings* — the original is
   an ISO instant, so comparing `Date` objects would report a change that is not one. The label
   includes the weekday ("Sat, 15 Aug 2026"): a mistyped date is easier to spot as "Tue".
7. **Two route entries, one breadcrumb.** `''` (list) and `':id'` (detail) are flat siblings
   under a `holiday-calendars` wrapper that carries the parent crumb; the list carries none of its
   own (or the list would read "Holiday calendars › Holiday calendars" — Chapter 10's finding).
8. **Branch integration in the same initiative** (step C), because without it a calendar could
   be created but never assigned from the UI. A `HolidayCalendarDirectoryService` and an optional
   "Holiday calendar" select in the Branch dialog, following the Employee form's Branch/Shift
   pattern exactly (below).

**The crux, a third time — change only what changed.** `calendarChangeForUpdate(original,
selected)` returns `{}` when the calendar is unchanged, `{ holidayCalendarId: null }` for "No
calendar", or the new id. An unchanged calendar is **never resent**, so a calendar deactivated
after it was assigned cannot fail an unrelated Branch edit. Proven live, not assumed: the run edits
a branch whose calendar is *inactive*, saves a code change, and the PATCH body has no
`holidayCalendarId` and returns 200. Create omits the key for "No calendar" (nothing to clear yet).
The Branch dialog otherwise keeps its existing behaviour (name, code and status are still sent).

## Folder Structure

See the tree above. `MasterDataFormDialogComponent`, `MasterDataTableComponent` and
`MasterDataListPageComponent` are unchanged in behaviour (the last now calls the shared delete
helper) and still serve Department and Designation.

## Angular Concepts Used

- **A helper that injects** (`createConfirmDelete`, called in a field initialiser) — the same
  shape as `createListQueryState`. `deleteById` is read lazily, so it may close over something not
  available yet.
- **A component-scoped provider** (`providers: [HolidayListStore]`) for per-visit state.
- **`forkJoin`** for the calendar + its holidays; **`computed`** for years / selected year / visible
  rows; a `null` "the user has not chosen" signal so the default can change with the data.
- **`MatDatepicker` with `provideNativeDateAdapter`**, its `Date` (local midnight) turned into
  `YYYY-MM-DD` at the edge.
- **Pure modules** (`holiday-date`, `holiday-update`, `branch-calendar`, `date-only.util`) so each
  rule is unit-tested without a component.
- **`effect()` in a constructor** to disable one optional select when its lookup fails (as the
  Employee form does).

## Routing

`/holiday-calendars` (wrapper, `data: { breadcrumb: 'Holiday calendars' }`) → `''` list and
`':id'` detail (`data: { breadcrumb: 'Holidays' }`), both under `permissionGuard` with
`holidayCalendar:read`. Add/edit/delete are gated in the page: `holidayCalendar:create` /
`:update` / `:delete` for the calendar, `:update` for a holiday. One `NAV_CONFIG` entry (icon
`event`, visible to every role because read is universal).

## State Management

`HolidayCalendarStore` (root) inherits everything from `MasterDataStore`. `HolidayListStore` (page
scope) holds `calendar`, `holidays`, `loading`, `error`, `notFound`, the year choice, and exposes
add/update/remove that toast and refetch. A **404 is its own state** ("Holiday calendar not found"
with a way back), distinct from a load error (banner with Retry). The calendar directory follows
Chapter 10's rules: every page, no long-lived cache, `refresh()` on entry, and the **consumer**
decides fatality — the Branch dialog treats it as *optional* (a failure disables just that select
with a hint and never blocks the branch).

## Best Practices

- **A calendar date is not an instant.** Parse and format from local parts; compare as strings.
- **Be exactly as strict as the backend**, and send only what changed when the server re-validates
  what you send.
- **Extract at the third copy**, and keep the old export as an alias so nothing else moves.
- **One state per page visit** for a hierarchy's child list (component-scoped provider).
- **After a mutation, move the view to where the result is** (the year jump), or the user cannot
  see what they did.
- **Measure layout as well as reading it**: the live script asserts icons share a line, the date
  is one line, dialogs fit at 360 px, and banners/hints are ≥ 12 px clear of the next field.

## Testing

**366 tests, all passing** (252 before this chapter, 350 before the Branch step; the runner's
total, which is higher than a count of `it(` lines because some specs generate tests in loops).
By counted `it(` calls: calendar store 5, holiday store 13, holiday-date 7, holiday-update 6,
list page 14, detail page 18, calendar dialog 7, holiday dialog 9, `confirm-delete` 4,
`date-only.util` 4; Branch step: `branch-calendar` 6, Branch dialog 9, plus one more row in the
directory `it.each`.

Deliberate coverage: the year default and the jump to a saved holiday's year; a date compared as
strings (an untouched edit sends nothing); a duplicate date and a duplicate name shown inline; a
404 vs a load error; the ADMIN vs read-only view; the confirm flow (cancel does nothing, a 409 keeps
the row and shows the message); and for the Branch dialog: an unchanged inactive calendar is not
resent, another id is sent, `null` clears, create omits "No calendar", and a failed lookup disables
only the select while the branch still saves.

**Live verification (real backend, temporary ADMIN + EMPLOYEE accounts, fixtures via Prisma,
all `ZZV`-prefixed): Holiday Calendar screens 60/60 (stable over three consecutive runs);
Branch integration 25/25.** Covered: list, create (trimmed name, POST body exactly right),
duplicate name → inline 409, blank validation, edit sends only `{status}` and an untouched edit
sends nothing, the detail page (empty, inactive banner, breadcrumb "Holiday calendars › Holidays"),
add a holiday (`{date:"2026-03-14",…}` and "Sat, 14 Mar 2026"), an optional holiday in another
year (the select jumps to 2027), duplicate date → inline 409, the year filter and date order,
edit a holiday (only `{name}`), delete a holiday, an unknown id → "not found", a reload on the
detail URL, delete a calendar in use → 409 with the backend's message, delete an unused one
(holidays cascade), **the browser in `America/Los_Angeles` and `Pacific/Auckland`** (2026-08-15
renders as Sat 15 Aug, an untouched edit sends nothing), a 360 px table and dialog, and a plain
EMPLOYEE seeing the pages with no New/Add/Edit/Delete. Branch: an inactive current calendar shown
"(inactive)" and saved **without** resending it, assign, change, clear (`null`, and the DB is null),
create with and without a calendar, a simulated `/holiday-calendars` outage, and 360 px.
**Test data removed and verified: 0 calendars, 0 holidays, 1 branch, 30 employees (the dev baseline).**

## Performance Notes

The detail page makes two small GETs (calendar, holidays) and no pagination is needed. The Branch
dialog adds one small `GET /holiday-calendars` (`limit=100`) per open, like the other lookups. No
cache, nothing to invalidate.

## Accessibility Notes

Each holiday row's icon buttons carry the holiday's name ("Edit Independence Day"); the calendar
link is labelled "View holidays of <name>". Optional vs mandatory is **text** in the Type column
(and "Optional" under the name on a phone, where that column is hidden), never colour alone;
"(inactive)" is text. The date label carries the weekday. Verified at 1280 px and at 360 px.

## Security Notes

Client-side checks are UX only; the backend re-enforces `holidayCalendar:create/update/delete`
(ADMIN). Verified live: an EMPLOYEE account sees the list and the holidays but no New Calendar,
Add Holiday, Edit or Delete.

## Real Bugs Found During This Work

Fewer real app defects than Chapter 11, and **the two visible ones were invisible to every passing
test** — found by reading the screenshots, then measuring:

1. **The inactive-calendar warning touched the Year field** on the detail page (the banner has no
   bottom margin of its own). Fixed with a bottom margin on `app-inline-banner` in that page; a
   measured "≥ 12 px clear" check now guards it (16 px).
2. **The Branch dialog's new select sat flush against the Status field** — its label overlapped
   the select box. The field uses `subscriptSizing="dynamic"` (so the two-line "could not be
   loaded" hint has room), which removes the fixed 24 px subscript area its siblings keep. My first
   measured check only ran in the *outage* state, where the hint supplies the gap, so it passed; the
   screenshot of the *normal* state showed the defect. Fixed with a fixed `mb-5`; the check now
   runs in the normal, outage and 360 px states (20 px each). Lesson: a measurement is only as good
   as the states it is taken in.
3. **The "not found" page's Back link was left-aligned under a centred message.** Centred.

**Things that looked like bugs and were not** (each checked before changing anything):

- **The login page did not render** (twice): a Vite `EPERM ... rename ...\.angular\cache\...\vite\deps_temp`
  error after I ran `ng build`/`ng test` alongside `ng serve` (Windows file lock) left every dependency at
  504 "Outdated Optimize Dep". Environment, not app: stop `ng serve`, delete
  `frontend/.angular/cache/<version>/frontend/vite`, restart. The overlay check did **not** show it —
  confirm the login form renders before running a verifier.
- **"Duplicate name (different case)" did not 409.** My assumption; the backend's calendar check is
  exact-case (unlike Shift's). The test now uses the identical name and the difference is recorded above.
- **`DELETE -> 204` failed.** The backend answers 200 with a message. My assumption again.
- **Every step after one failure failed too.** A step clicked "Create" after the field was touched and
  invalid (the button is *correctly* disabled), timed out and left the dialog open, which blocked the
  rest. The verifier now screenshots on failure, and the blank-field checks use a fresh dialog — the
  same script mistake Chapter 11 recorded.
- **Flaky text checks** (a confirm dialog's text, a half-rendered table) failed intermittently and then
  passed. Cause: reading before the content rendered. They now wait for their content; three
  consecutive clean runs.
- **A calendar fixture left by an earlier run** (`ZZV Calendar In Use …`, 4 holidays, plus its branch and
  two test users) was already in the dev DB; the cleanup now matches `zzv` case-insensitively and removes
  every `zzv-` user, so a crashed run cannot leave accounts behind.

## Observations Outside This Work's Scope (not changed)

- **Backend:** calendar-name uniqueness is exact-case while Shift's is case-insensitive; worth
  aligning if it matters to the business.
- Every dialog (shared, Shift, calendar, holiday) leaves a stale server-error banner showing until the
  next submit (e.g. "already exists" stays while the name is edited). A shared behaviour; a fix would
  touch all of them.
- A failed lookup, and a 404 on the detail page, still raise the global error toast on top of the
  inline state (existing interceptor behaviour).
- The Branch **list** does not show a calendar column, and Attendance/Leave's "is this date a
  holiday for this employee" resolution chain (ADR-HC04) is not a UI concern yet.
- Prettier is configured but not enforced (every pre-existing file fails `prettier --check`).
- Branch is still not on the shared screen and still patches its list locally.

## Interview Questions

1. **When do you extract a shared helper?** At the third identical consumer, once the shape is known;
   keep the old export as an alias so the extraction is invisible to the code that did not change.
2. **Why is a holiday's date not a `Date`?** It is a calendar date with no time of day. Round-tripping
   through an instant moves it a day in any zone behind UTC; parse and format from local parts.
3. **Why provide the detail store on the component?** Per-visit state: no leakage between two calendars
   and nothing to reset.
4. **Why refetch after an add instead of pushing the row into the array?** The server owns the ordering.
5. **Why does the year select jump after saving?** The saved row must be visible, or the user cannot tell
   whether it worked.
6. **Why send `null` for "No calendar" but omit the key when unchanged?** `null` clears, absent leaves
   alone; resending a since-deactivated calendar is a 400.
7. **Why can a unit-tested, measured-in-one-state layout still be wrong?** jsdom does no layout, and a
   measurement covers only the state it ran in; read the screenshot of each state.

## Key Takeaways

- Extract at the third copy and keep the old name as an alias.
- A calendar date is a string of `YYYY-MM-DD`, not a `Date`, until the very edge of the UI.
- Change only what changed whenever the server re-validates what you send — a third foreign key now.
- Per-page state for a parent's child list; refetch, and move the view to the result.
- Read the screenshot **and** measure it **in every state** — two spacing defects hid from 350 tests.
- Separate "the app is wrong" from "my script is wrong" before touching code, and record what the
  backend *actually* does even when it is not what you assumed.
