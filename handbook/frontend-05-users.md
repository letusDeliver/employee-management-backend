# Frontend Chapter 5 — Users

## Theory

Users is an admin-only, read-only page listing every user in the
system and their roles. It exists to give an ADMIN visibility into who
has accounts and what they can do — nothing more. Before any design
work, the real backend contract was re-verified: `GET /users`
(`authMiddleware` + `requirePermission('user:list')`) is ADMIN-only
(confirmed in `prisma/seed.js`'s `ROLE_PERMISSIONS` — `MANAGER`/
`EMPLOYEE` don't have this permission), returns `{ users: [...] }` with
each entry `sanitizeUser(user, roles)` (roles only, never
`permissions`), and — critically — `user.repository.js`'s `findAll()`
is a bare, unpaginated `findMany()`. No search, sort, filter, or
pagination exists server-side. No mutation endpoints exist either — no
promote, demote, or delete. This is genuinely just a list, not a
trimmed-down CRUD feature waiting for more endpoints.

## Architecture

Before Phase 2 was approved, five explicit questions shaped the design:

1. **What's reusable vs. feature-specific?** Reused: `SessionStore`,
   the `mat-chip` role-display pattern, `extractErrorMessage`/
   `NotificationService`, `ICON_NAMES`, and the Store/Service/component
   conventions themselves. Feature-specific: `UserTableComponent`'s
   internals and `UsersStore.filteredUsers` — both tied to "one full
   array already in memory," a contract that doesn't match what the
   shared `DataTableComponent` needs to be built around.
2. **Migration path to `DataTableComponent` later?** Not automatic, not
   obligated. `UserListPageComponent` never touches `MatTable` APIs
   directly — it delegates entirely to `UserTableComponent`. If
   `DataTableComponent`'s eventual (Employees-driven) contract ever
   turns out to also support a client-side mode, swapping
   `UserTableComponent`'s internal template is a one-file change;
   `UsersStore`/`UserService` are untouched either way. Equally valid:
   it never migrates.
3. **Still Smart/Presentational even though the table is simple?**
   Yes — `UserListPageComponent` (smart, owns the search binding,
   injects `UsersStore`) + `UserTableComponent` (presentational, no
   `HttpClient`/Store injection). Keeping the split is *why* answer #2
   is true — inlining the table into the smart component would remove
   the clean seam a future migration needs.
4. **Could client-side search/sort ever look like server capability?**
   Guarded against explicitly: no `MatPaginator` (a "page 1 of 5"
   control would visually imply server-side paging that doesn't exist),
   and `UsersStore.filteredUsers` carries a doc comment stating plainly
   this is a convenience over an already-fully-loaded array.
5. **Document "avoid premature abstraction" as a standing rule.**
   Recorded in `docs/frontend-architecture-blueprint.md` (revision v8,
   §9's Tables bullet) — evidenced now by three data points:
   `EmptyStateComponent` deferred (Feature 3), `FileUploadComponent`
   built once justified (Feature 4), `DataTableComponent` deliberately
   still deferred to Employees (this feature).

## Folder Structure

```
features/users/
├── data-access/
│   ├── user.models.ts    # UserListItem = Omit<AuthUser, 'permissions'>
│   ├── user.service.ts   # one method: listUsers()
│   └── users.store.ts    # users/loading/error/searchTerm signals, filteredUsers computed
└── user-list-page/
    ├── user-list-page.component.{ts,html,scss}   # smart
    └── user-table.component.{ts,html,scss}       # presentational
```

Mirrors the `employee-list/` subfolder pattern already reserved in the
blueprint for Employees — a page component paired with a table
component in the same folder, rather than the flat single-file pattern
Dashboard/Landing/Account used (those had no second component to pair
with).

## Angular Concepts Used

- **`MatTableDataSource` + `MatSort`, entirely client-side** —
  `UserTableComponent` builds a `MatTableDataSource` from its `rows`
  input via an `effect()` and connects a `MatSort` in `ngAfterViewInit`.
  A custom `sortingDataAccessor` handles the two cases the default
  comparator can't: `roles` is a `string[]` (joined for a stable sort),
  and `name`/`email` are lowercased for a case-insensitive compare.
- **`viewChild.required(MatSort)`** — locates the `matSort` directive by
  type, no template reference variable needed.
- **`*matNoDataRow`** — an explicit "No users match your search" row,
  so the filtered-to-empty state is designed, not just an empty
  `<table>`.
- **`computed()` for a client-side filter** — `UsersStore.filteredUsers`
  derives from `users` + `searchTerm`, recomputing automatically; no
  manual re-filter call needed anywhere.

## Routing

`/users`, gated by `permissionGuard(['user:list'])` — the **first real
route** to use this guard since it was built (unused) in Feature 2.
`data: { breadcrumb: 'Users', permissions: ['user:list'] }`.

## State Management

`UsersStore` — signals `users`/`loading`/`error`/`searchTerm`, one
`computed()` (`filteredUsers`). No NgRx, matching every other Store in
this app. `loadUsers()` is called once, from `UserListPageComponent`'s
`ngOnInit` — there's no reactive re-fetch trigger needed since nothing
about this page's own filters requires a new server call (unlike
Employees, which will re-fetch on `page`/`sortBy`/`search` changes).

## Best Practices

- **Answer "why not the shared component" explicitly, in the docs, not
  just in code.** The blueprint's own §9 now names the exact reasoning
  for why `DataTableComponent` isn't used here — a future reader (or
  future you) doesn't have to reverse-engineer the decision from the
  absence of its usage.
- **Guard a client-side convenience from ever looking like a server
  capability.** No `MatPaginator`, explicit doc comments, no naming that
  implies pagination (`filteredUsers`, not `paginatedUsers`).
- **Preserve a clean Smart/Presentational seam even when a component
  feels "too simple to bother splitting."** The split is what makes a
  future refactor cheap — the value shows up later, not at write time.

## Common Mistakes

- **Assuming a smaller/simpler feature means the Definition of Done gets
  skipped.** Users has no mutations and no pagination, but it still
  needed real loading/empty/error states, real accessibility
  consideration (a `*matNoDataRow`, `MatSort`'s built-in ARIA), and real
  permission verification against two live accounts — "simple" scope
  doesn't mean fewer states to design for.
- **Using a shared component's presence in the blueprint as license to
  force-fit a feature into it.** `DataTableComponent` was *named* in the
  blueprint before Users existed, but a name reserved in a design
  document isn't the same as a validated contract — using it here would
  have meant guessing at requirements (does it support client-side mode?
  How?) instead of waiting for a feature that actually needs to answer
  that question for real.

## Performance Notes

No new async complexity beyond the one `listUsers()` call on page load;
sorting/filtering afterward is pure client-side array work over data
already resident in memory — no debouncing needed for search, since
there's no network request per keystroke to worry about triggering
(contrast with Employees' future server-side search, which will need
`debounceTime`).

## Accessibility Notes

- `MatSort`'s built-in ARIA (sort direction, sortable-column labeling)
  is trusted as-is, per §15's "don't fight Material's own correct
  behavior" principle.
- The search `<mat-form-field>` has a real `<mat-label>`, not just a
  placeholder.
- The table sits in its own `overflow-x: auto` container on narrow
  viewports — an explicit responsive decision, not an unstated default.

## Security Notes

Authorization here is enforced twice, at two different layers, and
this feature makes the boundary between them visible for the first
time: `permissionGuard` (client-side) hides the *route* and the
*nav entries* from a non-admin, which is pure UX — the actual
enforcement is `requirePermission('user:list')` on the backend, which
would `403` the real API call regardless of what the frontend does or
doesn't render. Verified live: a non-admin never even reaches a state
where the frontend would need to handle a `403` from this endpoint,
because the guard already redirected them — but the guard existing is a
convenience, not the security boundary itself.

## Real Bugs Found During This Feature

None. The one real design risk (client-side filtering being mistaken
for server capability) was designed around from Phase 1 Theory onward,
not discovered live — the same pattern as Feature 4's
`permissions`-merge risk.

## Interview Questions

**Q: A backend endpoint returns a full, unpaginated list. Would you add
client-side pagination or sorting to make the UI feel more polished?**
A: Sorting, yes — sorting data you already have entirely in memory is a
legitimate, well-supported client-side operation (`MatTableDataSource`'s
`sortingDataAccessor` is built for exactly this) and doesn't misrepresent
anything about the server. Pagination is trickier: a paginator control
visually implies "there's more data on another page," which is only
true if the server is actually paging. Adding a client-side-only
paginator over a fully-loaded array can mislead a user into thinking
there's a cheap way to jump between pages of a huge dataset, when really
the whole thing already downloaded. The safer choice, when in doubt: no
paginator at all, or make its client-side-only nature explicit in the
UI copy.

**Q: You have a shared component reserved in your architecture docs for
a use case, and a new feature also needs "a table." Do you use the
reserved shared component?**
A: Only if the new feature's actual requirements match the contract the
shared component was designed around. A name reserved in a design
document is a plan, not a validated contract — using it prematurely
risks either forcing the new feature into a shape it doesn't fit, or
quietly expanding the shared component's contract to accommodate a case
its original design never considered, which is how shared components
end up with a pile of conditional props nobody fully understands. Better
to give the new feature its own small local implementation and let the
shared component's real design wait for the case it was actually built
for.

**Q: How do you keep a future refactor (e.g., swapping a local component
for a shared one) cheap, before you even know if that refactor will
happen?**
A: Preserve a clean boundary now, even if the current implementation is
simple enough that the boundary feels unnecessary. Here, that meant
keeping `UserTableComponent` as its own presentational component (rather
than inlining the table into the smart page component) — so if a swap
ever happens, it's contained to one file's internals, not a change that
ripples into the Store or the smart component.

**Q: Client-side vs. server-side authorization — where does each one
actually matter?**
A: Client-side checks (route guards, conditionally rendered nav items)
are UX — they prevent a legitimate user from wasting a click on
something they can't do, and they keep an authenticated-but-unauthorized
user from seeing UI that isn't relevant to them. They are not a security
boundary: anyone can bypass client-side JavaScript entirely. The real
enforcement always has to be server-side (`requirePermission` here) —
the frontend guard existing is a nicety for the 99% honest-user case, not
protection against a determined bad actor.

## Key Takeaways

- A feature's scope should match what the backend genuinely supports —
  Users is a read-only list because that's all `GET /users` is, not
  because of an arbitrary frontend decision to simplify.
- This feature formalized a principle that had already been followed
  twice before (`EmptyStateComponent`, `FileUploadComponent`) but never
  written down explicitly until a user's direct question forced it into
  the blueprint as a named, citable rule.
- Two mechanisms built in earlier features (`permissionGuard`,
  `NAV_CONFIG`'s permission filtering) were exercised for the first time
  here, against two real accounts — proving they work, not just
  reasoning that they should.
