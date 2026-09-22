# Frontend Chapter 7 — Branch

## Theory

Branch is master data: a physical/legal work location an Employee can
optionally be based out of (`docs/domain-branch.md`). It's the first
domain in a new phase of frontend work — after Feature 6 (Employees),
all further backend HRMS domains (Branch through Exit Management, 14 in
total) shipped with no frontend at all. This chapter is the first of
that domain-by-domain rollout (see `.claude/skills/implement-frontend-domain/SKILL.md`).

**Why master data first, and why Branch specifically.** Recon for this
pass surfaced a real, verified contract drift: Feature 6's
`employee.dto.ts`/`employee.model.ts` still model `department`/`jobTitle`
as free text, but the backend has since migrated `Employee.departmentId`/
`designationId` to mandatory governed-master-data foreign keys, plus a
mandatory `employmentType` enum and optional `branchId`/`shiftId`.
**Employee create/edit is currently broken against the real backend.**
Fixing it needs real Department/Designation/Shift data to populate
selects from — so those domains, plus Branch (the first orthogonal
classification axis in the backend's own build order), come first.

**Common mistakes this domain specifically invites**: treating
`status: 'INACTIVE'` as a denylist instead of a positive `'ACTIVE'`
allowlist anywhere a branch is offered for assignment; forgetting that
`holidayCalendarId` exists on the real `Branch` model even though Holiday
Calendar (a later domain) has no frontend yet to select from — the field
stays on the wire-shape model, just absent from the form.

## Architecture

`features/branches/` — the smallest, flattest shape used yet:

```
features/branches/
├── data-access/
│   ├── branch.models.ts   (wire + domain shape in one file)
│   ├── branch.service.ts  (HttpClient wrapper)
│   └── branch.store.ts    (signals + createListQueryState)
├── branch-list/
│   ├── branch-list-page.component.ts   (smart, routed at /branches)
│   ├── branch-toolbar.component.ts     (search + status filter)
│   └── branch-table.component.ts       (DataTableComponent wrapper)
└── branch-form/
    └── branch-form-dialog.component.ts (MatDialog create/edit)
```

Two architecture decisions were made explicit before implementation,
each a deliberate departure from Employees' precedent:

**1. `MatDialog` instead of a routed page.** Employees' create/edit is a
full route (`/employees/new`, `/employees/:id/edit`) with its own
breadcrumb, because Employees has sub-resources (documents) and
detail-only fields worth a dedicated page. Branch has three fields and no
sub-resources — a routed page would add a breadcrumb, a Cancel-navigation
flow, and a whole file just to wrap the same form a dialog does inline.
The trade-off: a dialog can't be deep-linked or bookmarked mid-edit,
which is fine for master data admins manage in short sessions, not
appropriate for a page users might revisit via a saved link.

**2. No DTO/Model/Mapper split.** Employees needed one because `salary`
is a `Decimal` on the wire (JSON string) but a `number` in the domain
model — a real divergence. Branch has none: no `Decimal`, and
`createdAt`/`updatedAt` stay ISO strings all the way through (Angular's
`DatePipe` accepts them directly). Splitting into three files with
identical shapes would be ceremony with no payoff, so `branch.models.ts`
holds one `Branch` interface used as both wire and domain type — the same
call `auth.models.ts` made for Auth back in Feature 2.

**Reused, not rebuilt**: `DataTableComponent` (real server-side
pagination — Branch's `GET /branches` genuinely supports
`page`/`limit`/`sortBy`/`order`/`search`, matching the component's
designed contract exactly), `MatChipsModule` for the status column
(Users' precedent for a small enum-like value), `ConfirmDialogComponent`
for delete, `PageHeaderComponent`/`InlineBannerComponent`/
`EmptyStateComponent` from the design system, `notBlankValidator`, and —
important — `shared/utils/list-query-state.util.ts`'s
`createListQueryState()` for the Store's page/sort/filter state. This
last one matters: `EmployeeStore` (Feature 6) hand-wrote that logic
before the helper existed; `UsersStore` (Users Server-Side Pagination
pass) extracted it into a shared helper once it had a second real
consumer. `BranchStore` is the **third** consumer — using the shared
helper here, not copying `EmployeeStore`'s now-superseded pattern, is
what "always check the current codebase, not just the last chapter you
read" means in practice.

## Folder Structure

See the tree above. No `branch-detail/` — there's no detail page; the
list row *is* the record's only view, edited in place via the dialog.

## Angular Concepts Used

- **Signals + `computed()`** — `BranchStore`'s `branches`/`pagination`/
  `loading`/`error`, and `BranchListPageComponent`'s `hasActiveFilters`
  computed over the Store's `query()`.
- **`MatDialog` with a typed `MatDialogRef<T, R>`** —
  `BranchFormDialogComponent` closes with the created/updated `Branch` (or
  `undefined` on cancel); the list page never reads that return value,
  because the Store's own `tap()` already patches `branches` in place —
  a dialog result and a Store-driven signal update are two different
  ways to react to the same event, and only one is needed here.
- **`takeUntilDestroyed(destroyRef)`** on every submit/delete subscription
  — cancels the real in-flight HTTP request if the dialog is closed or the
  page is navigated away from mid-request.
- **Reactive Forms, `nonNullable.group()`** — `name`/`code`/`status`,
  `notBlankValidator` on `name` (mirrors the backend's
  `z.string().trim().min(1)`).
- **Content projection via a structural directive** —
  `DataTableCellDirective` (`appDataTableCell`) supplies the `code`
  fallback (`—`), the status chip, and the formatted date, exactly the
  mechanism `EmployeeTableComponent` established.

## Routing

A single flat route, unlike Employees' nested `EMPLOYEES_ROUTES`:

```ts
{
  path: 'branches',
  loadComponent: () => import('./features/branches/branch-list/branch-list-page.component')
    .then((m) => m.BranchListPageComponent),
  canActivate: [permissionGuard],
  data: { breadcrumb: 'Branches', permissions: ['branch:read'] },
}
```

No child routes exist to nest, so there's no `branches.routes.ts` file —
Employees needed one because `/employees/new`/`/employees/:id`/
`/employees/:id/edit` are flat siblings that still need one shared
"Employees" breadcrumb ancestor; Branch has only the one route.

## State Management

`BranchStore` (`providedIn: 'root'`) owns `branches`/`pagination`/
`loading`/`error` and delegates `query`/`setPage`/`setSort`/`setFilters`
to `createListQueryState()`. Mutations (`createBranch`/`updateBranch`/
`deleteBranch`) never update state optimistically — they patch `branches`
from the server's actual response inside each method's `tap()`, after the
request resolves, the same discipline `EmployeeStore` established.

## Best Practices

- **Two-layer permission gating.** The route only checks `branch:read`
  (granted to all three roles) — it does not hide the page from a
  non-admin. Inside the page, `branch:create` gates the header's "New
  Branch" button and `branch:update`/`branch:delete` gate each row's
  Edit/Delete icons, checked directly in `BranchTableComponent` via
  `SessionStore.hasAnyPermission()`. Two different questions ("can you
  see this page" vs. "can you act on this row") deserve two different
  checks, not one coarse guard covering both.
- **Omit vs. `null` in a PATCH request.** `code` follows the same rule
  `userId`/`managerId` already established on Employee: creating omits an
  empty code (nothing to store), editing sends `null` to actually clear a
  previously-set one — omitting on edit would mean "leave unchanged,"
  which is wrong when the user cleared the field on purpose.

## Common Mistakes

- **Copying a Store pattern from the wrong reference file.** The
  temptation is to copy `EmployeeStore` verbatim since it's the most
  familiar. `EmployeeStore` predates `createListQueryState()`, so copying
  it means reintroducing a pattern the codebase already moved past
  (`UsersStore` uses the helper; `EmployeeStore` itself is flagged as an
  explicit, still-open follow-up to migrate). Always check for the
  *newest* real precedent, not just the best-known one.
- **Unscoped Playwright/E2E locators around a dialog.** During live
  verification, a `mat-select[formcontrolname="status"]` locator matched
  both the toolbar's status filter and the dialog's status field
  simultaneously (both real, both on the page at once, since the dialog
  overlays rather than replaces the list). Scoping the locator to the
  dialog container (or the confirm-dialog component) fixed it. This was
  a test-script bug, not an app bug — worth naming because it looks
  exactly like a real bug in a screenshot until you isolate the step.

## Performance Notes

No change from Employees' baseline — `DataTableComponent` remains
server-side only, so Branch's list never loads more than one page's worth
of rows regardless of how many branches exist.

## Accessibility Notes

Icon-only Edit/Delete buttons carry `matTooltip` + `aria-label` (e.g.
`"Edit " + row.name`), matching the app-wide convention. The status
column uses a `mat-chip` with real text ("Active"/"Inactive"), not a
color-only indicator, so it doesn't rely on color perception alone.

## Security Notes

Client-side permission checks (`hasAnyPermission`) are UX only — every
mutation is enforced again server-side via `requirePermission('branch:create'
| 'branch:update' | 'branch:delete')`, verified live: a plain EMPLOYEE
account sees no New/Edit/Delete controls at all, and the underlying
`POST`/`PATCH`/`DELETE /branches` endpoints reject such a request
independently of what the UI shows.

## Real Bugs Found During This Feature

None in the shipped code. Two apparent bugs surfaced during live
verification and were both root-caused to the *verification script*,
not the app:

1. A duplicate-branch-name screenshot appeared to show a client-side
   "required" error on an empty field instead of the expected
   server-side 409. Isolating the step with explicit waits and a
   dialog-scoped locator showed the real behavior is correct: the
   backend's `409 {"message":"A branch with this name or code already
   exists"}` surfaces via `app-inline-banner`, the name field retains its
   value, and the dialog stays open. The original failure was a fill/
   click race in the unscoped test script.
2. A delete-confirmation click intermittently timed out. The selector
   `button:has-text("Delete")` matched three elements (the row's own
   icon-only Delete button included, via its tooltip/aria text), and
   Playwright kept retrying against the wrong (covered) one. Scoping to
   `app-confirm-dialog button:has-text("Delete")` fixed it immediately.

## Interview Questions

1. **Why does `BranchStore` use `createListQueryState()` instead of the
   hand-written signals `EmployeeStore` uses?** Because a second real
   consumer (`UsersStore`) already proved the pattern was genuinely
   reusable, and `EmployeeStore`'s own version is now explicitly flagged
   as an out-of-scope-but-pending migration — new code should build on
   the current shared abstraction, not the pattern it's meant to replace.
2. **Why is Branch's create/edit a dialog when Employees' is a routed
   page?** Because the two costs are different: a routed page buys
   deep-linking and a dedicated breadcrumb at the cost of a full route +
   navigation flow; a dialog is cheaper to build and keeps the user in
   list context, at the cost of not being bookmarkable mid-edit. Employees
   has sub-resources (documents) and enough fields to justify the page;
   Branch, at three fields with no sub-resources, doesn't.
3. **Why does `branch.models.ts` skip the DTO/Model/Mapper split
   Employees uses?** The split exists to isolate a genuine wire/domain
   divergence (Employee's `salary: Decimal` → `string` on the wire →
   `number` in the model). Branch has no such divergence, so the split
   would be three files describing one shape — the same reasoning
   `auth.models.ts` used for Auth.
4. **Why does the route only check `branch:read`, and where do the
   create/update/delete checks actually live?** Because `branch:read` is
   the *page-visibility* question (can you see the Branches screen at
   all — yes, for all three roles) while create/update/delete are
   *row-action* questions, answered independently inside the table
   component via `SessionStore.hasAnyPermission()`. Collapsing them into
   one route guard would either hide the page from read-only users (wrong)
   or show mutation buttons to everyone who can merely read (wrong the
   other way).

## Key Takeaways

- Master data doesn't need Employees' full routed-page ceremony — match
  the UI's cost to the aggregate's actual shape (3 fields, no
  sub-resources → dialog), not to "however the last feature did it."
- Before copying a Store/Service pattern from an existing feature, check
  whether a *newer* feature already extracted a shared version of it —
  `EmployeeStore` was the wrong reference to copy here, `UsersStore` was
  the right one.
- A screenshot that looks like an app bug during live verification can
  be a test-script bug instead — isolate the step with explicit,
  scoped locators before concluding the app is broken.
