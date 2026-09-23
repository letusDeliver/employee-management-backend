# Frontend Chapter 8 — Department

> **Update — the screen described below was later extracted.** As planned in
> Architecture decision 1, once Designation proved a second identical
> instance, Department's list page, table, toolbar and form dialog moved into
> `shared/master-data/`, its store became a ~10-line subclass of
> `MasterDataStore`, and the per-feature components in the folder tree below
> no longer exist (Department keeps its models, its explicit HTTP service, its
> store subclass and a thin page component). Behaviour is unchanged. The
> decisions, tests and reasoning here still hold - they now live in one shared
> place. See Chapter 9 and blueprint v13. This chapter is kept as written
> because it records how the screen was designed *before* extraction.

## Theory

Department is master data: the functional classification of an Employee —
"what part of the business does this person work in" (Engineering, Sales,
Finance) — as distinct from Branch, which answers "where do they sit"
(`docs/domain-department.md`). The two are deliberately orthogonal axes.
Before the backend promoted it to a domain, `Employee.department` was free
text, so `"Engineering"`, `"Eng"` and `"Enginering"` could all coexist as
unrelated values. The dev database held exactly that (12 distinct strings
across 30 employees, including test noise). Department is now a governed
list: one canonical name, a status, and a rule that it can never be
deleted while any employee references it.

For the frontend this is two things at once: a small admin CRUD screen,
and the **source of the dropdown options** the Employee form needs. This
chapter builds only the first; the second is deliberately deferred (see
Architecture, decision 2).

**What differs from Branch, and why it matters to the UI.**

- **Delete is rarely possible.** `Employee.departmentId` is *mandatory*
  (ADR-D07, unlike Branch's nullable `branchId`), and the backend's delete
  guard counts soft-deleted employees too. So any department that has ever
  had an employee can never be deleted — **deactivating is the real
  lifecycle action**, and the delete `409` is a normal outcome, not an
  exceptional one. The UI keeps Delete (it is a legitimate admin
  capability, mainly for a department created by mistake) but says so in
  the confirmation copy and surfaces the backend's own "deactivate it
  instead" message on a 409.
- **No `holidayCalendarId`.** Department is `id, name, code?, status,
  createdAt, updatedAt` — simpler than Branch.
- **Name uniqueness is case-insensitive in the service but the database
  constraint is case-sensitive**, so two concurrent creates of "Sales" and
  "sales" could both succeed. The UI can only surface the resulting 409; it
  cannot prevent the race. Recorded as a backend note, not a frontend
  concern.
- **The 409 message does not say whether the name or the code collided**
  (`"A department with this name or code already exists"`), and validation
  errors arrive as one joined string (blueprint §0), so the dialog shows
  it in an inline banner rather than binding it to a field.

**Two findings that shape the Employee capstone** (recorded here because
they constrain how Department's data must be exposed later):

1. Employee API responses carry only a bare `departmentId` — never a
   nested department. The list and detail views will show a UUID unless
   the frontend resolves the name (the same class of problem
   `UserDirectoryService` solved for `userId`).
2. The backend re-validates assignability on **any** `PATCH /employees/:id`
   that includes `departmentId`, even when unchanged
   (`employee.service.js`). An edit form that always resends the current
   `departmentId` for an employee whose department has since been
   deactivated gets a 400 on an unrelated edit. The capstone form must send
   only *changed* FK fields, and its select must still display the
   employee's current inactive department.

## Architecture

`features/departments/` mirrors Branch file-for-file:

```
features/departments/
├── data-access/
│   ├── department.models.ts   (wire + domain shape in one file)
│   ├── department.service.ts  (HttpClient wrapper, one method per endpoint)
│   └── department.store.ts    (signals + createListQueryState)
├── department-list/
│   ├── department-list-page.component.ts   (smart, routed at /departments)
│   ├── department-toolbar.component.ts     (debounced search + status filter)
│   └── department-table.component.ts       (DataTableComponent wrapper)
└── department-form/
    └── department-form-dialog.component.ts (MatDialog create/edit)
```

Plus three one-line wirings: a `departments` route (`app.routes.ts`), a
`NAV_CONFIG` entry, and one icon (`apartment`). All four decisions below
were made explicit before implementation.

**1. Mirror Branch now; extract a shared master-data pattern after
Designation.** Department, Designation and later Shift look nearly
identical, so extraction is tempting. But `createListQueryState()` was a
small, framework-agnostic utility with a *stable* contract, whereas Branch's
screen shape is *not* stable — it gains a Holiday Calendar select when that
domain ships, and Shift has time fields. Extracting from Branch plus
Department would be generalising from a pair where one member is known to
diverge. After Designation there will be two genuinely identical instances
differing only in names, and extraction becomes a mechanical diff. The cost
of this choice is a near-copy of ~13 files, kept faithful so the later
extraction is easy. A generic `MasterDataStore<T>` or base page component
was rejected: heavily typed, hides real differences, built against one
stable consumer.

**2. No `core/` name-lookup service yet.** The Employee form will need
ACTIVE departments for a select *and* names for INACTIVE ones (employees
keep them), which are two different queries. Nothing consumes that today —
the Department page needs a paged, filtered list, not a directory — and
blueprint §9 forbids building shared code ahead of a real consumer. It will
be added during the Employee capstone as a `core/` service (features may
not import each other), where four lookups (Department, Designation,
Branch, Shift) arrive at once and the "one generic directory vs four small
ones" question can be decided against real code. One difference from
`UserDirectoryService` to design for then: `department:read` is granted to
all roles, so there is no permission short-circuit — and because
`departmentId` is mandatory the options are a *functional* dependency, so a
failed load must show a real error and block the form, unlike user-name
enrichment which degrades silently.

**3. Refetch after every mutation instead of patching the local array.**
`BranchStore` patches its `branches` signal after create/update/delete.
With server-side paging that has three latent problems (identified by
reading it; not reproduced in a browser): a create prepends to the current
page regardless of sort or page, a delete leaves `pagination.total` stale,
and editing a row's status while a status filter is active leaves the row
showing. `DepartmentStore` instead calls `loadList()` after each successful
mutation. This still trusts only the server's response — blueprint §6's
"no optimistic UI" rule is about *not guessing*, and a refetch is the
opposite of guessing — at the cost of one extra GET on a list of tens of
rows. Branch was deliberately left untouched.

**4. Keep Delete, deactivate through the edit dialog.** A one-click
"deactivate" toggle would reflect that deactivation is the real lifecycle
action, but it is a new UI pattern no requirement asks for; Branch already
works this way. Noted as a future improvement.

**Reused, not rebuilt**: `DataTableComponent` + `DataTableCellDirective`,
`ConfirmDialogComponent`, `PageHeaderComponent`, `InlineBannerComponent`,
`EmptyStateComponent`, `notBlankValidator`, `MatChipsModule`,
`NotificationService`, `extractErrorMessage`, `toHttpParams`, and
`createListQueryState()` (its fourth consumer). Not needed:
`UserDirectoryService`, `uuidValidator`, any Mapper.

## Folder Structure

See the tree above. No detail page and no `departments.routes.ts`, for the
same reasons as Branch.

## Angular Concepts Used

- **Signals + `computed()`** — the Store's `departments`/`pagination`/
  `loading`/`error`, and `hasActiveFilters` on the list page.
- **Cancelling a superseded request** — `loadList()` keeps its
  `Subscription` and unsubscribes the previous one before starting the next,
  so a slow earlier response (an older search term) can never overwrite a
  newer one. Order matters: unsubscribe *first*, then `loading.set(true)`,
  because unsubscribing runs the old request's `finalize()` and would
  otherwise flip `loading` back to `false` after the new request set it.
- **`MatDialog` with a typed `MatDialogRef<T, R>` and `MAT_DIALOG_DATA`** —
  one component for create and edit; `data.department === null` means create.
- **`takeUntilDestroyed(destroyRef)`** on every submit/delete subscription.
- **Reactive Forms, `nonNullable.group()`** — `name`/`code`/`status`.
- **Structural content projection** — `DataTableCellDirective` supplies the
  code fallback (`—`), status chip and date.
- **`subscriptSizing="dynamic"` on `<mat-form-field>`** — see "Real Bugs".

## Routing

A single flat route, same as Branch:

```ts
{
  path: 'departments',
  loadComponent: () => import('./features/departments/department-list/department-list-page.component')
    .then((m) => m.DepartmentListPageComponent),
  canActivate: [permissionGuard],
  data: { breadcrumb: 'Departments', permissions: ['department:read'] },
}
```

Verified live (re-verified properly after the shared-screen extraction): a
full page load of `/departments` restores the session via the silent refresh
and renders the list, exactly as `/branches` and `/employees` do. **Caveat
found while checking this, not caused by Department:** reloading within about
one second of logging in bounces to `/login`, because the backend's refresh
tokens are JWTs with no unique id (only a one-second `iat`), so two issued
for one user in the same second are identical and hit the unique constraint
(`POST /auth/refresh` → 500). A real user rarely reloads that fast; a
scripted test does. (**Fixed 2026-09-24** in the backend - see chapter 9.) An earlier version of this paragraph claimed the deep link
worked after checking only that the URL stayed put - that proved nothing about
rendering, which is why it is stated this carefully now.

## State Management

`DepartmentStore` (`providedIn: 'root'`) owns `departments`/`pagination`/
`loading`/`error` and delegates `query`/`setPage`/`setSort`/`setFilters` to
`createListQueryState()`. Every mutation fires the request, then on success
toasts and refetches. One extra rule: deleting the **only row on a page
beyond the first** steps back one page rather than refetching the same,
now-out-of-range page (which would render an empty table for a list that
still has rows).

## Best Practices

- **Two-layer permission gating.** The route checks `department:read`
  (granted to all roles); `department:create` gates the header button and
  `department:update`/`:delete` gate each row's icons, checked in
  `DepartmentTableComponent`.
- **Omit vs. `null` in a PATCH.** Create omits an empty `code`; edit sends
  `null` so clearing a previously-set code actually clears it. This is
  covered by a spec that fails if it regresses (see Testing).
- **Trim in the component, not just the validator.** `notBlankValidator`
  rejects whitespace-only names; the value sent is also trimmed.
- **Status is editable only in edit mode.** A new department is always
  created ACTIVE server-side; offering a status choice on create would be a
  control that does nothing.

## Testing

This chapter adds the frontend's first real unit specs (before this the
whole app had a single scaffold spec, and Branch shipped without any, so
"`ng test` clean" told us almost nothing). Vitest via `ng test`:

- **`DepartmentStore` (10 tests)** — with `HttpTestingController`: default
  query params, error surfacing, superseded-request cancellation, filter
  and sort changes resetting to page 1, create/update/delete each toasting
  *and* refetching, the step-back-a-page rule, and a failed mutation
  neither toasting nor refetching.
- **`DepartmentFormDialogComponent` (7)** — Status field absent on create,
  empty code omitted and name trimmed, blank name blocked with no request,
  server message shown in the banner with the dialog left open, edit
  prefill, and `null`-not-omitted on clearing the code.
- **`DepartmentTableComponent` (5)** — cell rendering, no action buttons
  without permission, only permitted actions rendered, per-row aria-labels
  and emitted rows, spinner replacing Delete while deleting.

**Mutation check.** Because all 24 tests (22 new plus the 2 existing app specs) passed on the first run, two
behaviours were deliberately broken to prove the specs can fail: removing
the step-back-a-page condition failed the step-back test, and sending
`undefined` instead of `null` for a cleared code failed the edit-mode test.
Both were reverted. A green run only means something if a red run is
possible.

## Performance Notes

`DataTableComponent` stays server-side only, so the list never loads more
than one page. Refetch-after-mutation adds one small GET per mutation — the
deliberate cost of never showing a stale total or a misplaced row. The
feature is lazy-loaded.

## Accessibility Notes

Icon-only Edit/Delete carry `matTooltip` and a row-specific `aria-label`
(`"Edit Finance"`). Status is real text in a chip, not colour alone. The
dialog restores focus to its trigger on close (Material default). Errors
appear in an inline banner rather than only a transient toast.

## Security Notes

Client-side permission checks are UX only; every mutation is re-enforced by
`requirePermission('department:create' | ':update' | ':delete')`. Verified
live with a real `EMPLOYEE` account: the sidebar link and read-only list
appear, but no New button and no Edit/Delete icons exist in the DOM.

## Real Bugs Found During This Feature

**One real defect in shipped-then-fixed code, found visually, not by any
spec:** the edit dialog's Status hint ("Inactive departments can't be
assigned to employees; existing assignments are kept.") wrapped to two
lines inside a `<mat-form-field>` whose subscript area is fixed at one line
by default. The second line was clipped behind the dialog's Cancel/Save
buttons. It was confirmed by measurement, not just by eye — the hint's
bounding box (y=543.5, height 36) ran past the actions' top edge (y=563.5).
Fixed two ways: a shorter one-line hint, and `subscriptSizing="dynamic"` so
a longer hint grows the field instead of overflowing it. Re-measured
afterward: height 20, no overlap. No unit test can catch this — jsdom does
no layout — which is exactly why this project requires looking at the real
browser after each step.

Three apparent bugs were traced to the **verification scripts**, not the
app:

1. A "did the list request fire" check found nothing, although the list
   visibly loaded (1–10 of 69). Re-checking with a `waitForResponse`
   registered *before* navigation showed `GET /departments?page=1&limit=10&
   sortBy=createdAt&order=desc → 200`. The original event-log read was
   racing; not fully root-caused beyond that.
2. A delete-confirmation copy assertion failed because it read the dialog's
   `innerText` mid fade-in (empty). A screenshot showed the text rendering
   correctly; waiting for the text itself passed.
3. Narrow-viewport navigation failed because the sidebar is collapsed below
   the desktop breakpoint; the script had to open it first.

## Observations Outside This Feature's Scope (not changed)

- **The shell's overlay drawer stays open after tapping a nav link at
  narrow widths** (390px), covering the page until toggled closed.
  App-shell behaviour affecting every route.
- **Errors show twice**: the global `errorInterceptor` toasts every failure
  *and* the dialog/page shows the same message inline (duplicate-name 409,
  delete-in-use 409). App-wide convention; Branch behaves the same.
- **At 390px the table scrolls horizontally**, so Edit/Delete are off-screen
  until scrolled. Inherited from the shared `DataTableComponent`. The
  explicit responsive decision for this screen: desktop-first, usable on
  narrow screens via horizontal scroll; a card layout is a future
  improvement, not a requirement.
- **The dev database holds ~68 leftover "Attendance Test Department …"
  rows** from earlier backend testing. Untouched.
- **Backend:** name uniqueness is case-insensitive in the service but the
  DB constraint is case-sensitive (concurrent-create race).

## Interview Questions

1. **Why does `DepartmentStore` refetch after a mutation when
   `BranchStore` patches the array?** With server-side paging, a locally
   patched row can land on the wrong page or sort position, leave the total
   stale, or survive an edit that no longer matches the active filter. A
   refetch still trusts only the server, at the cost of one extra GET on a
   small list.
2. **Why isn't a department-lookup service built in this feature?** No
   consumer exists yet, and shared code built ahead of a real consumer is
   generalising from a guess. It arrives with the Employee capstone, where
   four master-data lookups are needed at once and the shape can be decided
   against real code.
3. **Why keep a Delete button if a used department can never be deleted?**
   Because an admin creating a department by mistake has no other way to
   remove it. The confirmation copy and the 409 message both point at
   deactivation instead.
4. **Why mirror Branch instead of extracting a shared master-data
   component now?** Extraction is safe when the contract is stable; Branch's
   is not (it gains a calendar select, and Shift differs more). After
   Designation there are two genuinely identical instances to diff.
5. **How do you cancel a superseded request, and what's the trap?**
   Keep the `Subscription` and unsubscribe before starting the next. The
   trap is ordering: `finalize()` runs on unsubscribe, so set `loading` to
   `true` *after* unsubscribing or the old request flips it back off.
6. **Why did the clipped hint pass every test?** Unit tests run in jsdom,
   which does no layout. Only measuring or viewing a real render exposes an
   overflow.

## Key Takeaways

- Read the *real* contract's consequences, not just its shape: a mandatory
  foreign key means a used department can never be deleted, which changes
  what the UI's primary lifecycle action should be.
- A pattern copied from the last feature inherits that feature's defects.
  Check what it does under server-side paging before mirroring it.
- Defer shared abstractions until the contract is stable — and say so
  explicitly, with the reason, so the deferral is a decision, not an
  omission.
- A green test run only counts if a red one is possible: break the code on
  purpose and confirm the spec notices.
- Tests and browser checks find different bugs. The clipped hint was
  invisible to 24 passing specs and obvious in one screenshot.
