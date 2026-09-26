# Frontend Chapter 13 — Attendance (the first transactional domain)

## Theory

**Attendance** records the *fact* of an employee's presence on a calendar date — a check-in and a
check-out — and reconciles it against what Shift and Holiday Calendar say *should* have happened.
Every domain before it (Branch … Holiday Calendar) was **master data**: classification you set up
once. Attendance is the first domain that records something that **happened**, daily, per person —
a **ledger**, closer to the audit log than to a Department. That changes what a "screen" is:

- there is no `status` to toggle, no `code`, no "archive" — a record is *correct or corrected*;
- the busiest actor is **every employee** (a check-in button), not an administrator;
- the interesting value — **Present / Late / Half day / Absent / Holiday / Week off / On leave** —
  is **not stored**. It is *computed on read* from four domains (ADR-AT03), for one employee and
  one day.

**The verified contract** (read from `backend/src/modules/attendance/*` and
`docs/domain-attendance.md`, then exercised live):

| Endpoint | Permission | Who |
|---|---|---|
| `POST /attendance/check-in`, `PATCH /attendance/check-out` | `attendance:checkin` | every role, on their **own** linked employee |
| `GET /attendance` (`employeeId`, `dateFrom`, `dateTo`, sort `date/checkIn/checkOut/createdAt`) | `read:any` | ADMIN, MANAGER — **no "my own records" list exists** |
| `GET /attendance/effective-status?employeeId&date` | `read:any` or `read:own` | everyone; an employee sees only their own |
| `POST /attendance`, `PATCH /attendance/:id`, `DELETE /attendance/:id` | `create:any`, `update:any`, `delete:any` | ADMIN, MANAGER |

| Fact | Consequence for the UI |
|---|---|
| Record: `id, employeeId, date, checkIn?, checkOut?, isHalfDay, createdAt, updatedAt` — no name, no status | The list needs a name lookup; a row has no status of its own. |
| `date` is a **calendar date** (ISO instant at UTC midnight); `checkIn`/`checkOut` are real **instants** | Two conventions in one row: `date-only.util` for the day, local time for the punches. |
| One record per `(employee, date)` (409 on a second) | Shown inline in the dialog, not pre-checked. |
| **The server's "today" is the UTC date** (`toDateOnly(new Date())`) | The "today" card must ask about the *server's* day, or a successful check-in reads back as Absent. |
| Lateness compares the check-in's **UTC** `HH:mm` with `shift.startTime` | Wrong for a non-UTC shift. A backend matter, recorded, not changed. |
| On a **Holiday / Week off / On leave** day the effective-status response carries `record: null` **even when a record exists** | After a reload the card cannot know its own punches on such a day. |
| `date` on create is refused if after now → exactly "after the **UTC** date of now" | The form compares with the server's today, not the local one. |
| `checkOut < checkIn` is a 400 (equal is fine); a punch on another day than the record is allowed | The form blocks the first, only *notes* the second (night shifts). |
| **An employee has no name** — only `userId`; a name lives on the User and `GET /users` is ADMIN-only | A MANAGER manages attendance but sees no names anywhere. |
| An ADMIN account may have **no employee record** | `check-in` and own-status answer 400 "No employee record linked to this account". |
| Every mutation, self-service ones included, writes an `AuditLog` row | Verified live: CREATE, UPDATE, DELETE. |

## Architecture

```
core/employee-directory/employee-directory.service.ts    every employee, paged; labelOf / options

features/attendance/
├── data-access/
│   ├── attendance.models.ts        record, EffectiveStatus, requests, responses
│   ├── attendance.service.ts       7 endpoints, one method each (all opt out of the global toast)
│   ├── attendance-status.ts        STATUS_META, serverToday, workedDuration, punchLabel   (pure, tested)
│   ├── attendance-form.ts          build create/update, datetime-local helpers, form rules (pure, tested)
│   ├── attendance.store.ts         the ADMIN/MANAGER list (provided by the page)
│   └── my-attendance.store.ts      today's card + check in/out (provided by the page)
├── my-attendance/                  /my-attendance      (every role)
├── attendance-list/                /attendance         page + table + toolbar (ADMIN, MANAGER)
├── attendance-form/                create + correct dialog
├── status-lookup/                  "Check Status" dialog
├── attendance-status-badge/        word + glyph, never colour alone
└── employee-picker/                autocomplete ControlValueAccessor (promote to shared/ at Leave)
```

**Decisions, and what was rejected**

1. **One feature, two surfaces, two flat routes** — `/my-attendance` (`attendance:checkin`, every
   role) and `/attendance` (`attendance:read:any`). *Rejected:* one page serving both audiences
   (two permission models and two jobs in one component) and a nested route (the flat siblings avoid
   the breadcrumb-inheritance trap from Chapter 10).
2. **The card asks about the server's day.** `serverToday()` is the UTC date — the *one* place
   `toISOString().slice(0, 10)` is correct, because the point is to mirror the server, not the user.
   After an action the card follows the date of the *record the server returned*. When that is not
   the user's local date, a note says so. *Rejected:* the local date — it shows Absent right after a
   successful check-in for hours of every day in most time zones.
3. **`EmployeeDirectoryService` in `core/`** — pages through every employee (100 per page), no
   long-lived cache, `refresh()` on page entry; `labelOf` is the user's name → "Designation,
   Department" → "Unknown employee", **never an id**. *Rejected:* server-side employee search — the
   server can match a name but the client is the only place that can build the label a MANAGER needs.
   Named cap: a few thousand employees; server-side search is the follow-up beyond that.
4. **The list table shows a second line ("Joined 5 Jan 2024") only for an employee with no resolvable
   name.** A MANAGER's rows would otherwise all read "Engineer, Sales". *(Found by reading a
   screenshot, not by a test.)* The joining date is not unique either — three fixtures shared one.
5. **Punches are `datetime-local`, not a time input** — a night shift's check-out falls on the next
   day. The record date uses the date picker. Sent as `new Date(value).toISOString()`: right here,
   because a punch really *is* an instant (the opposite of a calendar date).
6. **A correction sends only what changed; nothing changed = no request.** A punch is compared at
   minute precision, because the stored instant carries seconds and re-sending a truncated value would
   silently rewrite it.
7. **After a create, filters follow a record they would hide** — otherwise a saved record vanishes
   behind the active filter and looks like a failure. Same idea as Holiday Calendar's year jump.
8. **No worked-hours rule, no half-day rule.** `isHalfDay` is a stored fact (the schema says so); the
   UI shows a checkbox and a plain duration and invents no thresholds.
9. **Every request opts out of the global error toast.** Every screen already shows its failure
   inline (card, dialog banner, table banner, delete banner), so the toast only repeated it.
10. **`DataTableComponent` gained two optional column flags**, `nowrap` and `stickyEnd`, used for the
    short headers and the actions column. Existing consumers are untouched.

## Folder Structure

See the tree above. `core/employee-directory/` is new; nothing else outside the feature changed
except two flags on the shared `ColumnDef`, the route file, the nav config and the icon list.

## Angular Concepts Used

- **`ControlValueAccessor` via `NgControl`** (`EmployeePickerComponent`): the picker injects
  `NgControl` and assigns itself as the accessor instead of providing `NG_VALUE_ACCESSOR`, so it can
  read the *control's* touched state. The control is only bound after the parent's bindings run, so
  it is read in `ngAfterViewInit`, through `control.events` (`TouchedChangeEvent`).
- **Signals and `computed()`** for the picker (`typed`, `selectedId`, `matching`, `visible`,
  `problem`) and for both stores; **`toSignal`** in the dialog so the "another day" note reacts as
  the user types.
- **Field-level validators that read a sibling** (`checkOutAfterCheckIn` reads `checkIn`), with the
  sibling's `valueChanges` re-validating it.
- **`HttpContext` + `SKIP_GLOBAL_ERROR_NOTIFICATION`** on every request.
- **`mat-autocomplete`, `mat-date-range-input`, native `datetime-local`.**
- **`switchMap` after an action** (check-in → read the computed status), a `ReplaySubject`-backed
  single-flight `refresh()`, and `takeUntilDestroyed` on every subscription.

## Routing

`/my-attendance` (`permissionGuard`, `attendance:checkin`) and `/attendance` (`attendance:read:any`),
both flat lazy routes with their own breadcrumb. Two `NAV_CONFIG` entries. An EMPLOYEE has no link to,
and is redirected away from, `/attendance` (verified live), and a direct `GET`/`DELETE /attendance`
answers 403.

## State Management

- **`AttendanceStore`** — page-provided, `createListQueryState` for page/limit/sort/filters, refetch
  after every mutation, cancels a superseded request, steps back a page when the last row of a later
  page is deleted, and moves the filters to a created record they would hide.
- **`MyAttendanceStore`** — page-provided. `load(date = serverToday())`; `checkIn()`/`checkOut()`
  read the *computed status* back for the date of the returned record. A 400 "No employee record"
  is its own state (`notLinked`), distinct from an error. On a non-working day it **remembers** the
  record an action just returned, because the status response hides it — and forgets it on a working
  day, where `record: null` really means none.
- **`EmployeeDirectoryService`** — `entries`, `loading`, `loaded`, `error`, `options`; a failure of the
  *employee* load is exposed (a picker with no employees is useless), a failure of the *name* lookups
  is swallowed (a label just degrades).

## Best Practices

- **Be exactly as strict as the backend**: block the future date (against the *server's* today), block
  check-out-before-check-in, only *note* a punch on another day.
- **Put a rule on the control that shows its error**: a `mat-error` renders only while its own control
  is invalid, so a group-level rule is never displayed.
- **A form's `markAllAsTouched()` never calls a custom control's `onTouched`** — read the control.
- **Never render an id**; degrade to a readable label.
- **Say why, not just no**: a disabled submit needs the message beside it.
- **Measure every state** (normal, error, outage, 360 px) and read each screenshot.

## Testing

**530 tests** (was 366; 164 new): the service (every request opts out of the toast), the pure modules
(`serverToday` at the UTC boundary and in `Pacific/Kiritimati` / `Etc/GMT+12`, both builders,
`workedDuration`, `punchLabel`), both stores (`HttpTestingController`), the directory, and each
component — picker, toolbar, table, list page, create/correct dialog, status lookup, badge, card.

**Mutation checks — eight, all killed by the right spec:**

| Mutation | Killed by |
|---|---|
| `serverToday` returns the local date | `attendance-status.spec` (UTC boundary, two zones) and `attendance-form.spec` |
| A correction sends an unchanged check-in | nine `attendance-form-dialog.spec` cases |
| Delete shown without `attendance:delete:any` | `attendance-list-page.spec` permissions |
| An unknown employee labelled with its raw id | `employee-directory.spec` |
| A remembered record survives on a working day | `my-attendance.store.spec` |
| A created record hidden by the filters does not move them | `attendance.store.spec` |
| The picker ignores the control's touched state | create dialog and lookup dialog specs |
| The toolbar emits duplicate filter sets | three `attendance-toolbar.spec` cases |

**Live, against the real backend, with temporary ADMIN / MANAGER / EMPLOYEE accounts:** records
screens **105/105**, My Attendance **44/44** (both from fresh fixtures). Covered: real names for an
ADMIN and joining-date lines for a MANAGER; sorting, paging, both filters (with exactly **one** request
per change); create / duplicate 409 / validation / night shift; correct (no-op sends nothing, a single
changed field, `null` to clear); delete with cancel; **the audit log** (1 CREATE + 3 UPDATE + DELETE);
all six computed statuses through the lookup (**Holiday** via a branch calendar, **Week off**,
**On leave** via an approved leave, **Absent**, **Half day**, **Present**); an employees-endpoint
outage and a list outage; a browser in `Etc/GMT+12` where the local date is *not* UTC's (the card shows
the server's date and a check-in does not read back as Absent); `America/Los_Angeles` and
`Pacific/Auckland` (a date range sent as the same calendar dates); 360 px; and an EMPLOYEE refused
(redirect + 403). Data removed and verified.

## Performance Notes

- The directory loads every employee once per page entry (≈ one request per 100). Fine at this scale;
  named cap above.
- The list is server-paginated, so the ledger's size never reaches the browser.
- The status is computed per employee per day, so it is *not* shown in the list — N status calls per
  page would defeat the paging (the design doc names this as an accepted read cost).

## Accessibility Notes

- Status is a **word and a glyph**, never colour alone; the glyph is `aria-hidden`.
- Every icon-only button has a tooltip and an `aria-label` that names the row (employee and date).
- The picker sets `aria-invalid`; its problem text is `role="alert"`, its loading note `role="status"`.
- A required employee shows the `*` like every other required field.

## Security Notes

- Every gate is enforced by the backend as well; the UI hides, the API refuses (verified: 403 on a
  direct `GET`/`DELETE` as an EMPLOYEE).
- The card acts only on the caller's own employee — there is no id in the URL to tamper with.
- No id or token is ever rendered; unresolvable people read "Unknown employee".

## Real Bugs Found During This Work

**Found by a component spec** (each is a spec that failed on the unfixed code):

1. **A failed submit left the employee field silent while the button went disabled.** A form's
   `markAllAsTouched()` never calls `onTouched` on a custom accessor. The picker now reads the
   control's own `TouchedChangeEvent`.
2. **"Check out cannot be before check in" was never displayed.** It was a group-level error, and a
   `mat-error` only renders while its own field's control is invalid. It is now the checkout control's
   own validator.
3. **The toolbar emitted the same filter set several times** for one user action (the group, the
   date-range inputs and `reset()` each report a change), each one a request. It now never emits the
   same set twice.

**Found only by reading screenshots** (no unit test can — jsdom does no layout):

4. **The employee field sat flush against the Date field, and its error text overlapped Date's
   floating label** (measured 0 px). The fields after it use `subscriptSizing="dynamic"`. Fixed with
   a wrapper margin, measured in the normal, error and outage states at 1280 and 360 px.
5. **Employee was not marked required** while Date was.
6. **"Check in" / "Half day" headers wrapped onto two lines.** → `ColumnDef.nowrap`.
7. **A MANAGER's rows were indistinguishable.** → the joining-date line (decision 4).
8. **A 409 on create showed twice** (inline and as a toast), and an employees outage raised a toast on
   top of its own banner. → every request opts out of the toast.
9. **Edit and Delete were off-screen at 360 px** behind a sideways scroll. → `ColumnDef.stickyEnd`.

**Things that looked like bugs and were not** (each checked before changing anything):

- **Pressing Escape closed the dialog instead of the autocomplete panel** — when the panel is not open
  the dialog takes the Escape. The script now clicks the dialog title.
- **`Tab` in a `datetime-local` never blurred it** (it moves between the day/month/hour segments), so
  a validation message did not appear. The script blurs explicitly.
- **Submit "timed out"** — the button was *correctly* disabled once the field was touched and invalid.
- **A "first row" check failed** because an earlier step had left the list sorted by check-in.
- **A "1 row" check failed** because the twin employee already had a seeded record.
- **Specs failed on `15 Sept`** — this runtime's default locale is not `en-US`. The specs now match
  the parts, not one spelling.
- **My mutation script printed "SURVIVED" for every mutant** — it was reading stdout and the failures
  go to stderr. The failure counts had already shown all eight killed; the script now reads both.
- **One verifier invocation crashed with an uncaught Playwright error** (output truncated) and the
  identical rerun on fresh fixtures passed 44/44. **Not root-caused** — recorded as unexplained.

## Observations Outside This Work's Scope (not changed)

- **Backend:** there is **no "list my own attendance"** endpoint, so an employee sees today only.
- **Backend:** Employee responses carry **no display name**, so a MANAGER sees "Designation, Department".
- **Backend:** "today" and lateness are **UTC-based**; a check-out after the UTC day rolls over fails
  with "Cannot check out before checking in today" for a user west of UTC in the evening. *(Reasoned from
  the code and confirmed only for the card's date; the check-out-after-midnight case was not reproduced.)*
- **Backend:** on a holiday / week off / leave day the status hides the record, so a reload cannot show
  a user's own punches, and the card offers Check in again (the server then answers 409).
- **Backend:** the joining date is not a unique key, so two same-role people who joined on one day are
  still indistinguishable to a MANAGER.
- Other features' dialogs still raise a toast on top of an inline error.
- Prettier is configured but not enforced. Branch is still not on the shared screen.
- Leave will need the employee picker: **promote it to `shared/`** then.

## Interview Questions

1. **Why can't the "today" card use the user's local date?** The server files a punch under its UTC
   date; asking about another day makes a successful check-in read back as Absent.
2. **Why is the status not shown on the list?** It is computed per employee per day from four domains;
   one call per row would defeat pagination.
3. **Why did the "required" message not appear after a failed submit?** `markAllAsTouched()` touches
   the control but never calls `onTouched` on a custom accessor; read the control's events.
4. **Why is a group-level validation error invisible in a `mat-form-field`?** `mat-error` renders only
   while its own control is invalid.
5. **Why compare punches at minute precision when editing?** The stored instant has seconds; re-sending
   a truncated value silently rewrites it.
6. **Why is `toISOString()` right for a punch and wrong for a holiday?** One is an instant, the other a
   calendar date.
7. **What is a mutation check, and what does a surviving mutant mean?** Break a behaviour on purpose; if
   no test fails, there is a missing test.
8. **Why show "Unknown employee" rather than an id?** An id helps nobody and can leak; degrade to
   something readable.

## Key Takeaways

- A ledger is not master data: no status, no code — and the value people care about is *computed*.
- Mirror the server's definition of a day, not the user's.
- A control that owns an error must own the rule that raises it.
- Read the control's state, not the accessor's callbacks, in a custom form control.
- Show what the user needs to tell rows apart, not just what the API happens to carry.
- Screenshots find what 530 tests cannot; mutation checks find what green tests hide; both need every
  state.
- Separate "the app is wrong" from "my script is wrong" before touching code — and write down the ones
  you could not explain.
