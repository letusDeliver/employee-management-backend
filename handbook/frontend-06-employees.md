# Frontend Chapter 6 — Employees

## Theory

Employees is full CRUD over the HR employee record — the largest
frontend feature, and the last one on the original roadmap. It exists
so an ADMIN/MANAGER can manage the organization's employee records:
create, view, edit, soft-delete, and attach documents (contracts,
IDs, resumes) to each record.

Before any design work, the real backend contract was re-verified with
live `curl` calls against the running server, not assumed from reading
code alone:

- `POST/GET/GET:id/PATCH/DELETE /employees` and
  `POST/GET/DELETE /employees/:id/documents` are the full endpoint set.
- The list response is `{ employees: [...], pagination: { page, limit,
  total, totalPages } }`; a single record is `{ employee: {...} }`.
- `salary` is a Prisma `Decimal`, which serializes as a JSON **string**
  (`"85000"`) on the way out but is validated as a **number** on the way
  in — the first real instance in this app of a field needing a genuine
  DTO ↔ domain mapping layer.
- `dateOfJoining`/`createdAt`/`updatedAt` are ISO strings on the wire,
  real `Date`s in the domain model.
- **`Employee` has no nested `user`/`manager` relation in any
  response** — `userId`/`managerId` are raw, unresolved foreign keys.
  `employee.repository.js`'s `findAll`/`findById` never `include` the
  relation. This is the single biggest finding of this feature's Theory
  phase and it shaped the whole Architecture phase (see below).
- `GET /employees` (list) is `employee:read:any`-**only** — confirmed
  live, not assumed. Only `GET /employees/:id` (and its
  `:id/documents` sibling) accepts **either** `employee:read:any` **or**
  `employee:read:own`. A plain `EMPLOYEE` therefore has `:own`
  permission in principle but no discoverable UI path to their own
  record today, since no self-lookup endpoint exists — a real, disclosed
  gap, not fixed in this feature.
- Document upload/delete require `employee:update:any` **only** — there
  is no `:own` variant for either. An employee can never manage their
  own documents, even if a self-lookup path existed.
- `MANAGER` has identical `employee:*` permissions to `ADMIN` — only
  `user:list` distinguishes the two roles (`prisma/seed.js`'s
  `ROLE_PERMISSIONS`).

## Architecture

**The enrichment problem.** Since `Employee` carries no resolved name,
a naive implementation would either fabricate a name client-side or
make the whole feature depend on the Users list being loaded first —
both wrong. Before Phase 2 was approved, the option actually chosen
("Option 2") was: resolve a name **only** when the current viewer
already has `user:list` permission, with an honest `"—"` fallback
otherwise. The frontend never invents data the backend hasn't
authorized it to see.

**Where that resolution capability lives** was the subject of six
follow-up questions before Phase 2 was approved. The two candidates the
user proposed — injecting `UsersStore` directly into `EmployeeStore`,
or passing a lookup map down through inputs — were both rejected in
favor of a third option the blueprint's own §1 rule already implied:
promote the capability to `core/`. `features/users/data-access/{user.models.ts,
user.service.ts}` moved to `core/users/{user.models.ts,
user-directory.service.ts}` (renamed `UserService` → `UserDirectoryService`),
and both `UsersStore` (already-shipped Feature 5 code) and the new
`EmployeeTableComponent`/`EmployeeDetailPageComponent` now depend
downward on it. Neither feature imports the other — the exact rule
§1 always stated, now exercised for real for the first time.

**The enrichment principle**, now recorded verbatim in the blueprint:
*business features must remain functional without optional enrichment
data — enrichment improves the user experience but must never become a
functional dependency.* Concretely: `EmployeeTableComponent`/
`EmployeeDetailPageComponent` fire-and-forget `userDirectory.ensureLoaded()`
with a silently-swallowed error; `resolveDisplayName(userId)` returns
`string | null`, never a raw id and never a thrown error. `UsersStore`
itself does **not** swallow its own load error the same way — that's a
deliberate difference, not an inconsistency: Users' own page genuinely
needs to surface a failed fetch, while Employees' enrichment is
optional by design and a failure there should be invisible.

**`DataTableComponent`**, deliberately deferred through Features 3 and
5, was finally built here — the first feature whose contract (real
server-side pagination/sort/filter) matches what it was designed
around. It stayed pure infrastructure: `columns: ColumnDef[]` +
`rows: T[]` + `loading`/`totalCount`/pagination inputs,
`(pageChange)`/`(sortChange)` outputs that only re-emit the raw
`PageEvent`/`Sort` — it never fetches or sorts anything itself, purely
reporting user intent back to the smart component, which is the only
place that talks to `EmployeeStore`. Per-column rich content (the
resolved-name column, the currency-formatted salary column) is supplied
by the consumer via a small `DataTableCellDirective`
(`ng-template[appDataTableCell]`), collected with `contentChildren()`
and rendered with `NgTemplateOutlet` — every other column falls back to
plain `row[key]` text.

**DTO → Model → Mapper** is a real pattern in this app for the first
time. `employee.dto.ts` is the exact wire shape (`salary: string`,
ISO date strings); `employee.model.ts` is the domain shape (`salary:
number`, real `Date`s); `employee.mapper.ts` is the one place the
conversion happens, mirroring the backend's own `normalizeForAudit()`
isolation of the identical Decimal/Date-to-JSON quirk.
`EmployeeDocument`'s domain model additionally **drops** `publicId`/
`resourceType` entirely — Cloudinary bookkeeping the frontend has no
use for, since deletion happens by `documentId`, never `publicId` —
the same trimming precedent `Employee`'s own model already set by
dropping `deletedAt`.

## Folder Structure

```
core/users/                             # promoted here this feature — see Architecture above
├── user.models.ts                      # UserListItem, UsersResponse (moved from features/users/)
└── user-directory.service.ts           # UserDirectoryService

shared/components/
├── data-table/
│   ├── data-table.component.{ts,html,scss}
│   ├── data-table-cell.directive.ts    # ng-template[appDataTableCell]
│   └── column-def.ts                   # ColumnDef { key, header, sortable? }
└── confirm-dialog/
    └── confirm-dialog.component.{ts,html,scss}

shared/models/paginated.model.ts        # Paginated — non-generic, see below
shared/utils/http-params.util.ts        # toHttpParams(filters: object): HttpParams
shared/validators/
├── not-future-date.validator.ts
├── positive-number.validator.ts
└── uuid.validator.ts                   # added after a real curl bug report, see below

features/employees/
├── employees.routes.ts                 # '', 'new', ':id', ':id/edit'
├── data-access/
│   ├── employee.dto.ts
│   ├── employee.model.ts
│   ├── employee.mapper.ts
│   ├── employee.service.ts
│   ├── employee.store.ts               # list/selected/pagination + documents state
│   ├── employee-document.dto.ts
│   ├── employee-document.model.ts
│   └── employee-document.mapper.ts
├── employee-list/
│   ├── employee-list-page.component.{ts,html,scss}   # smart
│   ├── employee-table.component.{ts,html,scss}       # configures DataTableComponent
│   └── employee-toolbar.component.{ts,html,scss}     # debounced search/filter form
├── employee-detail/
│   └── employee-detail-page.component.{ts,html,scss} # read-only + edit/delete/documents entry points
├── employee-form/
│   └── employee-form.component.{ts,html,scss}        # create + edit, one component
└── employee-documents/
    └── employee-documents-dialog.component.{ts,html,scss}
```

`Paginated` (`shared/models/paginated.model.ts`) is deliberately **not**
generic — `{ page, limit, total, totalPages }` with no `items: T[]`
field, since every paginated endpoint returns the array as a separate
sibling key (`{ employees, pagination }`), never nested inside the
pagination object itself.

## Angular Concepts Used

- **Generic component with template type inference** —
  `DataTableComponent<T>`'s `rows = input.required<T[]>()` lets
  `EmployeeTableComponent`'s configuration (`columns`, per-column
  templates) type-check against the real `Employee` shape, not `any`.
- **`contentChildren()` + a custom structural-ish directive** —
  `DataTableCellDirective` marks an `ng-template` as belonging to a
  specific column (`appDataTableCell="salary"`); the table collects all
  of them via `contentChildren(DataTableCellDirective)` and picks the
  matching one per column with `NgTemplateOutlet`, falling back to plain
  text when no template was supplied for a column.
- **Typed Reactive Forms with a self-referencing custom validator** —
  the employee form's `managerId` control carries a validator built as
  a factory function (`selfManagedValidator(employeeId)`) closing over
  the record's own id, only known in edit mode — mirroring the
  backend's own `assertNotSelfManaged` check as a client-side UX
  convenience, never the actual authority.
- **`provideNativeDateAdapter()` + `MatDatepicker`** — `dateOfJoining`
  uses a real `Date` as its form-control value, matching the domain
  model exactly; no extra date library needed since native `Date` was
  already this app's chosen type.
- **`MatDialog` with typed data and a typed close result** —
  `ConfirmDialogComponent` is generic over its `MAT_DIALOG_DATA` shape
  and closes with `boolean | undefined`; `EmployeeDocumentsDialogComponent`
  nests a second `ConfirmDialogComponent` call from inside an
  already-open dialog for per-document delete confirmation.
- **`effect()` to patch a form once async data arrives** — the edit
  form patches its values from `EmployeeStore.selected()` inside a
  constructor `effect()`, guarded by a `formPatched` flag so it only
  fires once even though the signal may update again later (e.g. after
  a save).
- **Debounced reactive form as a filter source** —
  `EmployeeToolbarComponent`'s `search`/`department`/`jobTitle` fields
  pipe through `debounceTime(300)` before emitting a `filtersChange`
  output, the first real debounced-search case in this app (contrasted
  explicitly with Users' fully client-side, non-debounced filter).

## Routing

```
/employees               list    — permissionGuard: employee:read:any
/employees/new           create  — permissionGuard: employee:create
/employees/:id           detail  — permissionGuard: employee:read:any | employee:read:own
/employees/:id/edit      edit    — permissionGuard: employee:update:any
```

Route order matters here in a way that's easy to get wrong: `new` is
declared **before** `:id`, which is declared **before** `:id/edit` —
correct because Angular's router differentiates by **segment count**
(`:id` only ever matches a single path segment; `:id/edit` requires
two), so there's no real ambiguity despite `new` being a string `:id`
could technically also match. Order still has to be right, though — a
`:id` route declared first would shadow `/employees/new` entirely.

## State Management

`EmployeeStore` holds `employees`/`pagination`/`query`/`loading`/`error`
for the list, `selected`/`selectedLoading`/`selectedError` for the
detail/edit views, and `documents`/`documentsLoading`/`documentsError`/
`documentUploading` for the documents dialog — one Store, three related
but independently-loading concerns, rather than three separate Stores
for one feature. Mutations (`createEmployee`/`updateEmployee`/
`deleteEmployee`) return `Observable<Employee>`/`Observable<void>` so
the calling smart component can navigate on success — matching the
app's established **no optimistic UI** rule: local state is only ever
patched from the server's actual response, never guessed ahead of it.
Document mutations (`uploadDocument`/`deleteDocument`) are `void`
instead — the dialog that calls them never navigates away on success,
it just keeps showing the updated list, so there's nothing for a caller
to subscribe to (the same shape `AccountStore.uploadProfilePicture`
already established in Feature 4).

## Best Practices

- **Promote a shared capability to `core/` only once a second real
  consumer needs it — not when the first feature is built.**
  `UserDirectoryService` didn't exist as a `core/` service until
  Employees actually needed the exact same lookup Users already had;
  moving it then, rather than over-engineering Users to anticipate a
  future consumer, kept Feature 5 honest to its own scope.
- **A route guard can only gate on "has some access to try" —
  the ownership check for `:any`/`:own` routes still happens after the
  API call, in the service layer.** `/employees/:id`'s guard accepts
  either permission; a plain employee can pass the guard and still get
  a real `403` from the server if the record isn't theirs. The frontend
  never pretends to replicate that check itself.
- **Mirror a backend validation rule client-side only after confirming
  the backend actually enforces it** — `uuidValidator`,
  `notFutureDateValidator`, and `positiveNumberValidator` all exist
  because a real Zod rule exists server-side for the same field; none
  were added speculatively.

## Common Mistakes

- **Assuming a missing relation means "add it to the API."** The
  correct fix for Employee having no nested `user` was not to change
  the backend's response shape, but to design the frontend to work
  correctly with the shape that already exists — including working
  when enrichment data isn't available at all.
- **Treating client-side form validation as sufficient on its own.**
  The UUID bug (below) is a direct example: without a client-side rule
  mirroring the backend's, the *first* signal a user got that
  `"test.com"` wasn't a valid id was a raw server round-trip. Client
  validation is a UX convenience layered on top of the server's real
  authority, never a replacement for it — but skipping it entirely is
  also a real UX cost, not a neutral shortcut.
- **Reaching for a shared abstraction the moment it becomes theoretically
  possible.** A shared `FileSizePipe` was in the original blueprint plan
  but was **not** built this feature — with exactly one real consumer
  (the documents dialog's byte-count display), a private method on that
  one component is the right amount of abstraction today.

## Performance Notes

- Server-side pagination/sort/filter means the employee list never
  loads more rows than the current page needs — a deliberate contrast
  with Users' (Feature 5) fully-client-side, fully-loaded-array
  approach, justified because `GET /employees` actually supports real
  `page`/`limit`/`sortBy`/`order`/`search` query parameters and `GET
  /users` does not.
- The toolbar's search input is debounced (300ms) specifically because,
  unlike Users' client-side filter, every keystroke here would otherwise
  trigger a real network request.
- `angular.json`'s production bundle budget moved twice this feature
  (500kB → 550kB → 650kB) — both increases came from genuinely
  eager/initial-bundle additions (`@angular/animations`,
  `provideNativeDateAdapter()`, `MAT_FORM_FIELD_DEFAULT_OPTIONS`), not
  lazy feature code, and both were disclosed at the time rather than
  quietly absorbed.

## Accessibility Notes

- Every `<mat-form-field>` across the **entire app** now reliably shows
  a visible label — see the density bug below; this fix wasn't scoped
  to just the new employee form.
- Icon-only actions (delete row, delete document) carry an explicit
  `aria-label` rather than relying on the icon glyph alone.
- The employee form's inline `mat-error`s are tied to their control via
  Angular Material's standard `mat-label`/`matInput`/`mat-error`
  association, the same pattern already used correctly in Login/
  Register since Feature 2.

## Security Notes

Two-layer authorization is now demonstrated concretely for the first
time by this feature, not just described in the abstract: the
`permissionGuard` on `/employees/:id` accepts **either**
`employee:read:any` **or** `employee:read:own`, but the actual ownership
decision — whether *this specific* record belongs to *this specific*
caller — only happens in the backend's service layer, after the record
is loaded. The frontend has no way to pre-compute that answer, so it
doesn't try to; a plain employee who somehow reaches a detail page for
someone else's record would get a real `403` from the API, not a
frontend-side block. Document upload/delete are `employee:update:any`
-only with no `:own` variant — mirrored client-side by simply never
rendering the upload/delete controls for a caller who lacks that
permission, never by disabling them and trusting the disabled state.

## Real Bugs Found During This Feature

All found live, none by code review:

1. **`@angular/animations` was never installed at all.**
   `provideAnimationsAsync()` had nothing to resolve until this
   feature's `ConfirmDialogComponent` — the app's first real `MatDialog`
   usage — made the missing dependency a hard build error instead of a
   silent, un-animated degradation. Fixed with `npm install
   @angular/animations`.
2. **Critical, systemic: every default-appearance `<mat-form-field>`
   in the app rendered with no visible label at all.** Root-caused by
   grepping the compiled production CSS for Material's own
   `--mat-form-field-*` custom properties and finding
   `--mat-form-field-filled-label-display: none` at the app's compact
   (`-2`) theme density, with no equivalent rule for the `outline`
   appearance. Silently present since Feature 5 (Users' search box),
   only unmissable once this feature's 6-field create form made empty
   gray boxes impossible to ignore. Fixed once, globally, via
   `MAT_FORM_FIELD_DEFAULT_OPTIONS: { appearance: 'outline' }`.
3. **A real user-submitted `curl` request** (`userId: "test.com"`)
   surfaced the backend's raw `"userId: Invalid UUID"` 400 error with no
   prior client-side warning. Fixed by adding `uuidValidator` — mirrors
   the backend's own `z.string().uuid()` rule — to both the `userId` and
   `managerId` form controls, plus inline `mat-error` messages.

## Interview Questions

**Q: A related entity your API needs to reference (here, `User`) isn't
included in the response, and adding it isn't currently planned. How do
you design the consuming feature?**
A: Design for its literal absence rather than working around an
assumption that it'll usually be there. Treat any lookup of that
related entity as *optional enrichment* — resolve it only when
possible (here: only when the current viewer already has the separate
permission needed to legitimately see it), fail silently rather than
noisily when it can't be resolved, and give every "resolved" value an
honest, visible fallback instead of a fabricated one. The core feature's
correctness should never depend on the enrichment succeeding.

**Q: Two features (here, Users and Employees) both need the exact same
small capability (resolving a user's display name). Where does that
code live?**
A: Not in either feature — and specifically not imported from one
feature into the other, since that creates a hidden coupling that makes
either feature harder to reason about or delete independently. Promote
it to the shared core layer once a second real consumer exists to
validate that the capability is genuinely shared and not just
superficially similar. Both features then depend downward on the same
core service, never on each other.

**Q: You found a systemic CSS bug (every form field missing its label)
by reading compiled CSS instead of visually guessing at colors/contrast.
Why does that matter?**
A: Guessing at a visual bug's cause risks fixing a symptom instead of
the actual rule — e.g. assuming it's a color-contrast issue and
adjusting a text color, when the label isn't rendering at all. Reading
the actual compiled output (in this case, grepping for Material's own
named custom properties) confirms the precise mechanism before writing
a fix, and also confirms the fix's scope — here, that the `outline`
appearance genuinely has no equivalent rule, which is what justified a
single global default instead of a narrower, more defensive patch.

**Q: When is it correct to add a shared, generic `DataTableComponent`
versus a small feature-local table?**
A: Once a real feature's actual requirements validate the contract
you're about to generalize — not before. This app deferred
`DataTableComponent` through two earlier features (Users' table has a
fundamentally different, client-side-only contract) and only built it
once Employees' genuine server-side pagination gave it something real
to be designed around. Building it earlier would have meant guessing at
a contract, likely getting it wrong, and then needing to loosen or
rework it once real requirements showed up anyway.

## Key Takeaways

- The biggest architectural decision in this feature wasn't a UI
  choice — it was recognizing that a missing backend relation (`Employee`
  → `User`) is a data-shape fact to design around, not a gap to route
  around by fabricating data or coupling two features together.
- `core/` promotion is not a decision made upfront "just in case" — it
  happens after the fact, the moment a second real feature needs the
  same thing a first feature already built, exactly as it happened here
  with `UserDirectoryService`.
- Three of this feature's four real findings (the animations gap, the
  form-field-label bug, the UUID validation gap) were only found because
  of actual live testing — against the real running backend, in an
  actual rendered form, from an actual user-submitted request — not from
  reading the code more carefully.
- Not building something (a shared `FileSizePipe`, `*appHasPermission`
  for a single button, a searchable id picker) is as much a documented
  architectural decision in this app as building something is.
