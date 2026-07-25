# Frontend Chapter 4 — Account

## Theory

Account is the self-service surface reserved since Feature 2's blueprint
note on `HeaderComponent`'s user menu: view your own profile, manage
your own profile picture. Unlike Employees/Users, this feature has no
list/table UI at all — everything is scoped to exactly one record, the
logged-in user's own.

A real backend contract review, done before any design, narrowed the
scope in a way worth understanding: `backend/src/modules/users/
user.routes.js` exposes exactly three routes — `GET /users` (admin-only
listing, unrelated to this feature), `POST /users/me/profile-picture`,
and `DELETE /users/me/profile-picture`. **There is no endpoint to update
a user's own name or email.** That's a real, current backend limitation,
not something to route around client-side — Account is deliberately
read-only for those two fields.

## Architecture

- **No new Store state for reading.** `AccountPageComponent` reads
  name/email/roles/`createdAt` directly from `SessionStore` — that data
  is already there from login/`/auth/me`, so there's nothing to fetch.
- **`AccountStore`** exists purely to coordinate the two *mutations*
  (upload/delete), holding `uploading`/`error` signals and calling
  `AccountService`, then patching `SessionStore` on success.
- **`SessionStore.updateProfileImage(url, publicId)`** is the
  architectural fix for this feature's one real design risk (see below)
  — a narrow, purpose-built mutation method alongside the existing
  `setSession`/`clearSession`.
- **`FileUploadComponent`** (`shared/components/file-upload/`) is dumb
  and domain-agnostic — no `HttpClient`, no Store, just
  `input()`/`output()`. It was built for real in this feature, not
  deferred, because it already has two justified consumers (this
  feature, and Employee documents later) — a different call than
  Feature 3's deliberate deferral of `EmptyStateComponent`, which had
  only one weak, cosmetic use case at the time.

## Folder Structure

```
features/account/
├── data-access/
│   ├── account.models.ts    # ProfilePictureResponse — Omit<AuthUser, 'permissions'>
│   ├── account.service.ts   # 2 HTTP methods, both carry the silent-error context
│   └── account.store.ts     # uploading/error signals, LiveAnnouncer calls
└── account-page.component.{ts,html,scss}

shared/components/file-upload/
└── file-upload.component.{ts,html,scss}
```

## Angular Concepts Used

- **`Omit<T, K>` in a wire-shape type** — `ProfilePictureResponse { user:
  Omit<AuthUser, 'permissions'> }` makes "this response has no
  `permissions` field" a compiler-enforced fact. Any code that tried to
  read `.permissions` off this response, or assign it somewhere expecting
  a full `AuthUser`, would fail to compile — a stronger guarantee than a
  comment saying the same thing.
- **`signal.update()`** — `SessionStore.updateProfileImage` uses
  `this.user.update((current) => current ? { ...current, profileImageUrl, profileImagePublicId } : current)`,
  the correct pattern for "patch part of an object signal" without ever
  constructing an intermediate full replacement value from an untrusted
  source.
- **`viewChild.required()`** — `FileUploadComponent` uses it to grab a
  reference to its own hidden `<input type="file">` so a visible,
  accessible `<button>` can trigger it programmatically (`fileInput().nativeElement.click()`),
  rather than relying on a `<label>`-wraps-`<input>` pattern that's
  harder to style consistently with Material buttons.
- **`LiveAnnouncer` (CDK)** — injected directly into `AccountStore`, not
  the component, since only the Store knows the precise moment an
  upload/delete has resolved.

## Routing

`/account` added under the existing `ShellLayout` (already gated by
`authGuard` for its whole subtree) — no new guard, since this is
self-service, open to any authenticated user. `data: { breadcrumb:
'Account' }` set, same generic `BreadcrumbsComponent` from Feature 2
picks it up automatically.

## State Management

`AccountStore` is a small, `providedIn: 'root'` service — signals
(`uploading`, `error`), no `computed()` needed here (nothing derived).
It coordinates `AccountService` + `SessionStore`, exactly the Store
definition in blueprint §6 — never NgRx.

## Best Practices

- **Model a "smaller" wire shape with `Omit`, not a hand-copied
  interface.** `ProfilePictureResponse`'s `user` field reuses `AuthUser`
  minus one field, so if `AuthUser` ever gains a new field, this type
  gets it automatically — a hand-duplicated interface would have needed
  a matching edit remembered every time.
- **Give an accessibility side effect (`LiveAnnouncer`) a home where the
  relevant state transition is actually known**, rather than trying to
  infer "did this just succeed" from signal changes observed elsewhere.
- **Build a shared abstraction when a second real consumer already
  justifies it** — `FileUploadComponent` vs. the deliberately-still-unbuilt
  `EmptyStateComponent` from Feature 3 is the direct contrast worth
  remembering.

## Common Mistakes

- **Assuming a "profile update" endpoint exists because a `User` model
  has editable-looking fields.** A frontend can't create backend
  capability by wanting it — the real Theory-phase check here was
  reading `user.routes.js` directly, not inferring scope from the
  `User` Prisma model's columns.
- **Merging a partial API response into a larger client-side state
  object without checking what fields it's missing.** This is exactly
  what would have happened here if `sessionStore.user.set(response.user)`
  had been used instead of a targeted merge — the bug wouldn't throw or
  error anywhere; it would just silently make every permission check
  fail until the next login.

## Performance Notes

No new async complexity — one small lazy-loaded route
(`account-page-component`, confirmed as its own chunk in the build
output). `@defer` not warranted for a small, always-visible page.

## Accessibility Notes

- Avatar `<img>` has real `alt` text (`"Profile picture for {name}"`);
  the placeholder icon state is explicitly labeled too, so "no picture
  set" is itself communicated, not just visually implied.
- Both the client-side rejection message and any server error render
  with `role="alert"`.
- Upload/delete outcomes are announced via `LiveAnnouncer` — a purely
  visual UI change here (the avatar image swapping) would otherwise be
  invisible to a screen-reader user.
- The upload trigger is a real `<button>`, not a `<label>` or bare `div`
  — full keyboard operability confirmed live.

## Security Notes

Profile-picture upload/delete are scoped to the caller's own record only
— `req.user.id` on the backend, never a client-supplied user id — so
there's no BOLA surface here to worry about client-side; the frontend's
job is just to call the right endpoint and handle the response
correctly, which is where this feature's one real risk (the permissions-
wipe bug) actually lived — a client-side state-management bug, not an
authorization one.

## Real Bugs Found During This Feature

None — the one real risk (merging a `permissions`-less response into
`SessionStore`) was caught and designed around during Phase 1 Theory,
before any code existed, rather than discovered live during browser
testing. Worth noting as a contrast to Features 2 and 3, where several
real bugs were found only through live testing: catching a risk at the
contract-review stage is strictly better than catching it after it ships,
when it's cheap to do so.

## Interview Questions

**Q: An API response is a subset of a type you already have elsewhere in
the codebase. Would you write a new interface from scratch, or derive
it?**
A: Derive it with a mapped/utility type (`Omit<T, K>`, `Pick<T, K>`)
whenever the subset relationship is genuinely permanent, not
coincidental. `ProfilePictureResponse`'s `user` field is always going to
be "`AuthUser` minus `permissions`" for as long as this backend's
`sanitizeUser`/`attachPermissions` split exists — deriving it means a
future field added to `AuthUser` propagates automatically, and the
missing field is enforced by the type checker, not just documented.

**Q: You need to merge a partial update into a larger piece of client
state (e.g., a session/user object). What's the failure mode of doing
this carelessly, and how do you prevent it?**
A: The failure mode is a silent data-loss bug — spreading a smaller
response object over a larger state object (or worse, replacing the
whole state with the smaller one) drops every field the smaller response
didn't include, with no error, no exception, nothing to catch in
testing unless you specifically check for the dropped field afterward.
Prevent it by writing a narrow, explicit merge function (here,
`SessionStore.updateProfileImage`) that only ever touches the fields
it's actually meant to change, rather than a generic `Object.assign`-style
merge that trusts the caller to pass a complete-enough object.

**Q: Where should an accessibility announcement (e.g., `LiveAnnouncer`)
live — the component or the service/store layer?**
A: Wherever the relevant state transition is actually known with
certainty. If only a Store's subscription callback knows "this async
operation just succeeded," putting the announcement there is more
reliable than trying to infer success from a component watching signals
change — the latter requires extra bookkeeping (was this a fresh
success, or just the initial signal value?) that the Store already
avoids by construction.

**Q: When do you build a new shared, reusable component versus solving a
problem locally?**
A: When a second real, concrete consumer already exists or is
imminent — not "this might be reused someday." `FileUploadComponent`
qualified because Employee documents (a known, near-term feature) needs
the exact same drag-drop/validation concern. Contrast with
`EmptyStateComponent`, deliberately left unbuilt in Feature 3 because
its only candidate use at the time was a single static sentence with no
loading/error siblings — building the abstraction then would have been
guessing at its shape before a second real case existed to validate it
against.

## Key Takeaways

- A feature's scope is bounded by what the real backend actually
  supports — Account is "view + picture management," not "edit
  profile," because that's what exists today.
- The most valuable bug this feature avoided was caught in Theory, not
  in the browser — reading the real response shape before writing
  `SessionStore` code prevented a silent, hard-to-detect permissions bug
  that no build/lint/test pass would have caught either.
- This feature is the first real exercise of two mechanisms built
  earlier but never tested end-to-end: Feature 3's `NAV_CONFIG`-driven
  Sidebar/Dashboard cards, and blueprint §11's reserved
  `FileUploadComponent` slot.
