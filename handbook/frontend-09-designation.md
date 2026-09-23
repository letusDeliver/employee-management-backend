# Frontend Chapter 9 — Designation (and the shared master-data screen)

## Theory

Designation is the **job title** of an Employee — "Software Engineer",
"Sales Manager" — independent of function (Department) and location (Branch)
(`docs/domain-designation.md`). Before the backend made it a domain,
`Employee.jobTitle` was free text with the same typo-and-duplication problem
Department had. It is the third orthogonal axis on Employee; the backend design
is explicit that it is **not scoped to a department** (a "Manager" recurs across
functions), so the UI offers no department select or filter.

This chapter is really two things: the Designation screen, and the extraction
that Department's chapter promised — the point at which the third master-data
screen stopped being a copy and became a configuration.

**The trigger: measuring, not guessing.** Chapter 8 deferred extraction until
"two genuinely identical instances" existed. Before writing any code, the
Designation backend module was diffed against Department's with names
normalised. Result: routes identical, permissions identical, validation
identical apart from example strings, service and repository identical apart
from comments and line wrapping. Same endpoints, same query
(`page/limit/search/status/sortBy/order`), same `{ designations, pagination }` /
`{ designation }` wire keys, same `designation:read` for all three roles with
ADMIN-only mutations, same mandatory `designationId` on Employee — hence the
same consequence: a used designation can never be deleted, so **deactivating is
the real lifecycle action** and a delete `409` is a normal outcome. Branch's and
Department's dialogs were also found to differ only by comments and one
`.trim()`. The duplication was no longer a suspicion; it was a diff.

**What genuinely differs** is presentation only: the wording ("job title", never
"department"), a new icon (`work` — `apartment` is Departments', `badge` is
Employees'), and a one-line page description that reinforces the title-versus-
function distinction the domain doc warns small organisations blur.

## Architecture

**Two commits, refactor first.** (1) *Extract shared master-data screen from
Department* — behaviour-preserving, protected by the moved specs and a full
live re-run. (2) *Add Designation* on top of it. If Department had regressed, it
would be attributable to the refactor and not to new code.

`shared/master-data/` (new — a domain-agnostic **UI pattern**, not a business
domain, so it does not break "shared has zero knowledge of any feature's
business meaning"; nothing in it imports from `features/`):

```
shared/master-data/
├── master-data.models.ts             MasterDataRecord, request/query types, MasterDataApi, labels
├── master-data.store.ts              abstract base: list state, refetch, cancel, step-back, toasts
├── master-data-toolbar.component.*   debounced search + status (no domain wording at all)
├── master-data-table.component.*     rows + canEdit/canDelete inputs, no SessionStore inside
├── master-data-form-dialog.component.*  create/edit, omit-vs-null, blank-name rule
└── master-data-list-page.component.* the smart shell: dialogs + delete flow
```

A domain is now:

```
features/designations/
├── data-access/designation.models.ts   type aliases of the shared shapes + wire types
├── data-access/designation.service.ts  explicit HttpClient wrapper (own path, own keys)
├── data-access/designation.store.ts    ~10-line subclass: `api` + `labels`
└── designation-list/designation-list-page.component.ts   thin: store, icon, prefix, description
```

Four files plus a wiring spec, against fifteen for a mirrored Department.

**Decisions, and what was rejected**

1. **Extract, but only what is stable and domain-free.** The backend contract is
   fixed by ADRs, so this is not speculation, and the cost of *not* extracting
   had already shown up: Branch lacks the refetch fixes Department has.
2. **HTTP services stay per-domain.** They are the explicit contract boundary
   (blueprint §8). Each owns its path and maps its own response key into the
   neutral `{ items, pagination }` that `MasterDataApi` returns, so a divergence
   in one domain's wire shape never touches `shared/`. A generic base service
   was rejected: it would hide exactly the place divergence will happen.
3. **No config-only routes.** Each domain keeps a tiny explicit page component,
   so routing and permission keys stay visible per domain, and extending one
   (Branch's Holiday Calendar select) stays a local change. A route that builds
   a whole page from a config object was rejected as too implicit.
4. **A base class, not composition.** An abstract class with `abstract api` and
   `abstract labels` is the smallest thing that works with Angular DI, and the
   behaviour is stateful and identical. A store factory function would work but
   adds indirection for no gain. This is the app's **first abstract base class**;
   it is justified by is-a-specialisation, not a licence to reach for
   inheritance elsewhere.
5. **The table decides nothing about permissions.** It takes `canEdit`/
   `canDelete` and never injects `SessionStore`; the smart page derives them
   from `<prefix>:update`/`:delete`. Presentational components carry no
   permission-key knowledge.
6. **Branch is not migrated in this work.** Its dialog will gain a Holiday
   Calendar select, and touching a shipped, verified feature widens the blast
   radius. Moving `BranchStore` onto the base would also fix its list-patching
   defects — a small follow-up of its own.

**Reused, not rebuilt**: `DataTableComponent` + `DataTableCellDirective`,
`ConfirmDialogComponent`, `PageHeaderComponent` (its `description` input finally
put to use), `InlineBannerComponent`, `EmptyStateComponent`, `notBlankValidator`,
`createListQueryState()`, `NotificationService`, `extractErrorMessage`,
`toHttpParams`.

## Folder Structure

See the trees above. No detail page, no `designations.routes.ts`, and no
per-domain toolbar, table or dialog.

## Angular Concepts Used

- **An abstract class with `inject()` field initialisers.** `MasterDataStore`
  calls `inject(NotificationService)` in a field initialiser, which works
  because a concrete subclass is instantiated by DI (`providedIn: 'root'`), so
  the injection context is live. **The trap is initialisation order:** the base
  class's field initialisers run *before* the subclass's, so the base must never
  read `api` or `labels` in its constructor or initialisers — only inside
  methods, which run later. `createListQueryState`'s `onChange` callback is lazy,
  which is why the base is safe.
- **Structural typing as the extension mechanism.** `MasterDataRecord` is
  declared, not inherited; `type Designation = MasterDataRecord` is an alias, so
  a domain can later widen its own shape (Branch's `holidayCalendarId`) without
  touching `shared/`.
- **Generic standalone components with signal inputs.**
  `MasterDataTableComponent<T extends MasterDataRecord>` with
  `input.required<T[]>()` and typed outputs.
- **A store instance as a signal `input()`.** The shared list page takes
  `store = input.required<MasterDataStore<...>>()` and derives everything
  (`labels`, `hasActiveFilters`, permissions) with `computed()`.
- **`MAT_DIALOG_DATA` carrying a store**, so the dialog needs no per-domain
  injection.
- **Pipes for wording** — `LowerCasePipe` builds "No designations yet" and
  "Inactive designations can't be assigned…" from one label.
- **`computed()` over `SessionStore.hasAnyPermission`** — reactive because the
  method reads the `user()` signal inside the computation.

## Routing

A flat, lazy-loaded route, same as Branch and Department:

```ts
{
  path: 'designations',
  loadComponent: () => import('./features/designations/designation-list/designation-list-page.component')
    .then((m) => m.DesignationListPageComponent),
  canActivate: [permissionGuard],
  data: { breadcrumb: 'Designations', permissions: ['designation:read'] },
}
```

Verified live, including a full page load (deep link) that restores the session
and renders the list — with the caveat under "Real Bugs Found".

## State Management

Unchanged in behaviour from Department, now in one place: every successful
mutation toasts and **refetches** the list rather than patching it; deleting the
only row on a page beyond the first steps back one page; a superseded list
request is unsubscribed (before `loading` is set, because `finalize()` runs on
unsubscribe).

## Best Practices

- **Two-layer permission gating**, as everywhere: the route checks
  `designation:read`; the page checks `designation:create`/`:update`/`:delete`
  for the header button and row actions.
- **Omit vs. `null` in a PATCH** — create omits an empty code, edit sends `null`
  so clearing actually clears. Now covered by one spec against the shared dialog
  instead of one per domain.
- **Wording comes from data.** `store.labels` (`Designation` / `Designations`)
  drives every heading, toast, empty state, dialog title and hint — no domain
  string lives in shared code. A grep for the word "department" in
  `shared/master-data` (non-comment) and in the Designation feature returns
  nothing; that check is cheap insurance against a copy-paste leaking wording.
- **Test the shared behaviour once, the wiring per domain.** Base-store logic is
  proven against a fake API; each domain adds a small spec for its own path,
  response keys, request bodies and wording.

## Testing

51 tests, all passing. The breakdown, so the shape is clear:

- **`MasterDataStore` (11)** — against a fake `MasterDataApi`: default query,
  error surfacing, a superseded request being unsubscribed, *stays loading while
  the latest request is in flight even though the superseded one was cancelled*,
  filter and sort resetting to page 1, create/update/delete each toasting with
  the label and refetching, step-back-a-page, and a failed mutation neither
  toasting nor refetching.
- **Dialog (7), table (5), toolbar (4), list page (13)** — labelled titles and
  errors, omit-vs-null, blank name blocked, server message in the banner,
  `canEdit`/`canDelete` gating, the toolbar's 300 ms debounce and coalescing,
  permission gating **per prefix (including refusing another domain's keys)**,
  labelled empty states, the delete flow with copy that points at deactivation,
  and a 409 rejection shown in the banner.
- **Wiring specs — Department (4), Designation (5)** — endpoint path, response
  key mapping, request bodies, wording.
- **App (2)** — the existing scaffold specs.

**Mutation checks, again.** All tests passed on the first run, so six behaviours
were deliberately broken at once — the loading-order rule (set `loading` before
unsubscribing), the step-back condition, `null`-vs-`undefined` on clearing the
code, `canDelete` (always render Delete), the permission prefix (hard-coded to
another domain's), and the toolbar's debounce. Eleven specs failed, every one
the intended guard, and each mutation was caught. A green run only means
something if a red run is possible.

## Performance Notes

Unchanged: `DataTableComponent` is server-side only, so a list never loads more
than one page; refetch-after-mutation costs one extra small GET; the feature is
lazy-loaded. The extraction is not a size win for two domains (Department's
deleted component code was roughly matched by the new shared code); the payoff
is that Designation costs four small files instead of a fifteen-file copy, and
every future fix lands once.

## Accessibility Notes

Icon-only Edit/Delete keep a tooltip and a row-specific `aria-label`
(`"Edit Backend Engineer"`); status is real text in a chip; errors appear inline
and not only as a transient toast; the dialog restores focus to its trigger. The
status hint now uses `subscriptSizing="dynamic"` and one line, so it can't clip
behind the buttons. All of this now lives in one shared place instead of three.

## Security Notes

Client-side permission checks are UX only; every mutation is re-enforced by
`requirePermission('designation:create' | ':update' | ':delete')`. Verified live
with a real `EMPLOYEE` account: the sidebar link and read-only list appear, but
no New button and no Edit/Delete icons exist in the DOM.

## Real Bugs Found During This Work

**Nothing wrong in the shipped code — but several things looked wrong, and
telling them apart is the substance of this section.**

1. **A false regression, caused by my own mutation check.** The first live run
   of the refactored Department failed four checks, including one where clearing
   a department's code did not clear it in the database (the audit trail showed
   `before.code = ZZV-S, after.code = ZZV-S`). Capturing the real request body
   showed `PATCH {"name":…,"status":"INACTIVE"}` — no `code` at all, i.e.
   `undefined` where the source sends `null`. That was exactly the mutation
   applied during the mutation check. The running `ng serve` had rebuilt with the
   mutated file, and after the files were restored their older timestamps meant
   the watcher never rebuilt, so it kept serving the mutated bundle. Touching the
   restored files forced a rebuild; the same repro then sent `"code":null` and a
   clean re-run passed. **Lesson: after a mutation check, force a rebuild before
   any live verification, and confirm a suspected regression by capturing the
   real request before blaming — or absolving — the code.**
2. **A pre-existing backend defect (FIXED 2026-09-24 in the backend — a random `jti`
   on every refresh token, plus rotation that claims the old token and issues the new
   one in a single transaction; see `backend/CLAUDE.md`. The diagnosis below was
   incomplete: the old code revoked the old token *before* issuing the new pair, so
   the collision also destroyed the session).** A full page load within about
   one second of logging in bounced to `/login`. The backend error log showed
   `Unique constraint failed on the fields: ("tokenHash")` from
   `refreshTokenRepository.create()`. A refresh token is a JWT of
   `{ sub, roles }` plus a one-second `iat` with **no unique id**, so two issued
   for one user in the same second are byte-identical; the second `create` hits
   the unique constraint and `POST /auth/refresh` returns 500, then 401 once the
   first token is rotated. It affects every route (`/branches` fails the same
   way), and a real user rarely reloads that fast — a script does. A `jti` claim
   would fix it. After a realistic pause, deep links to `/branches`,
   `/employees`, `/departments` and `/designations` all restore the session and
   render.
3. **An earlier claim of mine was too weak.** Chapter 8 said a deep link "worked"
   after only checking that the URL stayed put, which says nothing about
   rendering. It was corrected in that chapter and in `frontend/CLAUDE.md`, and
   the check now asserts the heading and table rows actually render.
4. **A gap in my own cleanup script.** Verifying "zero rows remain" found one
   leftover `ZZV Designation Two…` row: the script removed the fixture
   designation by id but not designations created through the UI. It was listed
   first (one row, unreferenced, created during this run) and only then deleted.
   Verifying the cleanup is not optional.
5. **Script-side false alarms (as before):** a request-log read racing the
   navigation, a dialog's text read mid fade-in, and a narrow viewport where the
   sidebar is collapsed. Each was re-checked with an explicit wait or a
   pre-registered `waitForResponse`.

## Observations Outside This Work's Scope (not changed)

- The shell's overlay drawer stays open after tapping a nav link at narrow
  widths; the global `errorInterceptor` toasts errors that the page also shows
  inline; at 390px the shared table scrolls horizontally so Edit/Delete are
  off-screen until scrolled (desktop-first, usable narrow via scroll).
- Backend: name uniqueness is case-insensitive in the service but the database
  constraint is case-sensitive (a concurrent-create race), for Designation as
  for Department.
- The dev database holds ~70 leftover "Attendance Test Designation …" and
  "… Department …" rows from earlier backend testing. Untouched.
- `BranchStore` and `EmployeeStore` still patch their lists locally after a
  mutation; Branch/Employees have no unit specs. Tracked as follow-ups.

## Interview Questions

1. **When is it right to extract shared code, and when is it premature?** When
   the contract is stable and you have measured the duplication — here a diff of
   the backend modules with names normalised — not when you merely suspect it.
   Chapter 8 deliberately did not extract from one instance; the second identical
   instance, plus Branch already lagging behind Department's fixes, made it
   right.
2. **Why an abstract base class here, when the blueprint prefers composition?**
   The behaviour is stateful, identical across every subclass, and each subclass
   genuinely *is* a master-data store; an abstract class with two abstract
   members is the smallest thing Angular DI accepts. It is documented as a
   precedent with its initialisation-order trap, not as a habit.
3. **What is the initialisation-order trap?** Base-class field initialisers run
   before the subclass's, so the base must never read a subclass-provided member
   (`api`, `labels`) in its constructor or initialisers — only in methods.
4. **Why do the HTTP services stay per-domain?** They are the explicit contract
   boundary. Each maps its own response key to a neutral `items`, so when one
   domain's wire shape diverges the change is local. A generic service would hide
   the very place divergence occurs.
5. **Why does the shared table take `canEdit`/`canDelete` instead of checking
   permissions itself?** Presentational components should carry no permission-key
   knowledge; the smart page owns "what may this user do" and passes booleans
   down.
6. **A live check fails after a mutation check — how do you tell a real
   regression from a stale bundle?** Capture the real request/response. A
   request body that matches the *mutation* rather than the *source* means the
   dev server is serving old output; force a rebuild and repeat.
7. **Why verify that the cleanup removed everything?** Because the script had a
   gap, and only the "zero remain" check exposed it.

## Key Takeaways

- Measure duplication before extracting it, then extract only what is stable and
  domain-free, and keep the explicit contract boundary (the HTTP service) per
  domain.
- A refactor gets its own commit and its own live verification; behaviour
  preservation is a claim you have to prove, not assume.
- A mutation check can poison the very environment you then verify in. Force a
  rebuild afterwards, and confirm a suspected regression from the real request.
- "It worked" needs a definition: a URL staying put is not a page rendering.
  Assert the thing the user would see.
- Verify your own cleanup; a script that deletes "by id" misses what the UI
  created.
