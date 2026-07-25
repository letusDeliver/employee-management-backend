# Frontend Chapter 2 — Authentication

## Theory

Authentication is the feature that gives the app a notion of *who is
asking*. Nothing built in Features 0/1 needed that; every feature from
here on (Dashboard, Employees, Users, Account) is meaningless without
it — they all read `SessionStore` for identity, permissions, or both.

The business problem isn't "let a user type a password" — that part is
trivial. The real problem is: how does a stateless SPA maintain a
trustworthy, XSS-resistant session across reloads and concurrent API
calls, without ever letting a compromised script exfiltrate a
long-lived credential? The backend already answered half of this
(httpOnly refresh cookie, rotation-on-use, SHA-256-hashed storage —
`backend/CLAUDE.md` Features 7/9). This chapter is the frontend half:
the access token lives in memory only, never `localStorage`/
`sessionStorage` — the cost is that a hard reload always needs a silent
refresh round-trip, an accepted trade-off, not an oversight.

Enterprise Angular apps handle this with three recurring patterns, all
used here: functional guards as the single source of route-level
authorization (never scattered `if (!loggedIn)` checks in components),
a single shared in-flight refresh call on a 401 (avoiding a refresh-token
race against a backend that rotates on use), and permissions resolved
server-side only — this app deliberately does **not** maintain a
frontend copy of the backend's role→permission map (blueprint §7.1),
since a duplicated map is a map that can silently drift.

## Architecture

Physical realization of
[`docs/frontend-architecture-blueprint.md`](../docs/frontend-architecture-blueprint.md)
§3 (Application Shell), §5 (Routing Strategy), §6 (State Management),
and §7 (Authentication Architecture) — plus one architectural decision
made *during* this feature's planning and recorded back into the
blueprint itself (revision v5, §3/§4.3): `ShellComponent` is
structurally complete as of this feature, and `DashboardPageComponent`
is a real component from this feature onward, not a placeholder —
future features extend both additively (new `nav-config.ts` entries,
new template sections), never restructure them.

This feature is the clearest example yet in this project of three
genuinely different folder responsibilities coexisting: `core/auth/`
and `core/http/` (app-wide singleton concerns nothing "owns"),
`layout/public-layout/` and `layout/shell/` (visual chrome, no
data-access layer), and `features/auth/` + `features/dashboard/`
(routed pages with their own smart components).

## Folder Structure

```
frontend/src/app/
├── core/
│   ├── auth/
│   │   ├── auth.models.ts                    # AuthUser + response shapes
│   │   ├── session.store.ts                  # signals: user, accessToken
│   │   ├── auth.service.ts                   # 5-endpoint HttpClient wrapper
│   │   ├── auth.guard.ts                     # session check + silent restore
│   │   ├── redirect-if-authenticated.guard.ts
│   │   └── permission.guard.ts
│   ├── http/
│   │   ├── credentials.interceptor.ts        # withCredentials: true, always
│   │   ├── auth.interceptor.ts               # attaches Bearer token
│   │   ├── error.interceptor.ts              # HttpErrorResponse → toast
│   │   ├── refresh.interceptor.ts            # single-flight 401 → refresh → retry
│   │   ├── http-context-tokens.ts            # SKIP_GLOBAL_ERROR_NOTIFICATION
│   │   └── auth-endpoint-paths.ts            # shared no-session-yet path list
│   └── notifications/
│       └── notification.service.ts           # MatSnackBar wrapper
├── shared/
│   ├── models/api-error.model.ts
│   └── utils/extract-error-message.util.ts
├── layout/
│   ├── public-layout/
│   │   ├── public-layout.component.ts
│   │   ├── header/public-header.component.ts
│   │   └── footer/public-footer.component.ts
│   └── shell/
│       ├── shell.component.ts
│       ├── header/header.component.ts
│       ├── sidebar/{sidebar.component.ts,nav-config.ts}
│       ├── breadcrumbs/breadcrumbs.component.ts
│       └── footer/footer.component.ts
└── features/
    ├── landing/landing-page.component.ts      # DISPOSABLE - Feature 3 replaces
    ├── auth/{login-page,register-page}/
    └── dashboard/dashboard-page.component.ts   # real from this feature
```

## Angular Concepts Used

- **Functional guards/interceptors** (`CanActivateFn`, `HttpInterceptorFn`)
  — Angular's current recommended style, no classes, tree-shakeable.
- **`HttpContext`/`HttpContextToken`** — `SKIP_GLOBAL_ERROR_NOTIFICATION`
  lets Login/Register own their own error banner without also
  triggering `errorInterceptor`'s global toast for the same error.
- **`inject()` inside functional guards/interceptors** — no constructor,
  since these aren't classes.
- **Route `data`** (`data: { breadcrumb: 'Dashboard' }`,
  `route.data['permissions']`) — declarative per-route configuration
  `BreadcrumbsComponent`/`permissionGuard` read generically, rather than
  each route needing bespoke logic.
- **`input()`/`output()`** — every layout chrome component
  (`HeaderComponent`, `SidebarComponent`) is a plain presentational
  component; `ShellComponent` is the one place that reads `SessionStore`
  and computes what to pass down.

## RxJS Concepts Used

- **`switchMap`** — `AuthService.restoreSession()` chains refresh then
  `/me`, since `/auth/refresh` alone doesn't return a `user`.
- **`shareReplay(1)` + a module-scoped variable** —
  `refreshInterceptor`'s single-flight dedup: concurrent 401s share
  exactly one `/auth/refresh` call, important since this backend
  rotates the refresh token on every use (a second concurrent call
  would invalidate the first mid-flight).
- **`catchError`/`finalize`** — `AuthService.logout()` clears
  `SessionStore` regardless of whether the server call itself succeeds;
  `refreshInterceptor` resets its shared in-flight reference once the
  refresh settles, success or failure.
- **`filter`/`startWith`/`map` over `router.events`**, bridged via
  `toSignal()` — `BreadcrumbsComponent` recomputes on every
  `NavigationEnd`.

## Signals Used

`SessionStore.user`/`accessToken` (state), `SessionStore.isAuthenticated`
(`computed()`), `ShellComponent.sidebarItems` (`computed()`, filtering
`NAV_CONFIG` through `hasAnyPermission`), `ShellComponent.isHandset` and
`BreadcrumbsComponent.breadcrumbs` (both `toSignal()`-bridged from RxJS
sources). `hasPermission`/`hasAnyPermission` are plain methods, not
`computed()` — `computed()` can't take a runtime argument.

## Reactive Forms Concepts

Typed `FormBuilder.nonNullable.group` for both Login (`email`,
`password`) and Register (`name`, `email`, `password`). Client-side
validators mirror the backend's real Zod rules exactly
(`Validators.email`, `Validators.minLength(8)` on register's password)
for immediate feedback — never treated as the actual authority. Server
validation failures render as a single banner (`serverError` signal),
never split into per-field fragments, since the backend's error body is
one joined string, not a parseable per-field structure.

## Material Components Used

`MatCard`, `MatFormField`/`MatInput` (with a show/hide password
`MatIconButton` suffix), `MatButton`, `MatToolbar`, `MatSidenav`
(`mode="side"`/`"over"` via `BreakpointObserver`), `MatMenu` (Header's
user menu), `MatNavList` (Sidebar), `MatChip`/`MatChipSet` (Dashboard's
role display), `MatSnackBar` (via `NotificationService`).

## Routing

```
"" (PublicLayout) → redirectIfAuthenticatedGuard
├── ""          → LandingPageComponent (disposable stub)
├── "login"     → LoginPageComponent
└── "register"  → RegisterPageComponent

"" (ShellComponent) → authGuard
└── "dashboard" → DashboardPageComponent, data: { breadcrumb: 'Dashboard' }
```

Both layout parents use `path: ''` with their own `canActivate`,
applying each guard exactly once for the whole subtree rather than
duplicating it per child route — the standard Angular layout-route
pattern.

## State Management

Pure `SessionStore` signals — no RxJS inside the Store itself.
`AuthService`'s `Observable`s (the true stream boundary, since
`HttpClient` returns them by contract) are subscribed once and
immediately turned into signal writes via `tap()`, per blueprint §6's
"RxJS only where the problem is genuinely a stream" rule.

## The Session Lifecycle, in Detail

Three distinct code paths handle "does this browser have a valid
session," and conflating them was the source of two of this feature's
five real bugs:

1. **First load / hard reload, hitting a guarded route** —
   `authGuard` finds `SessionStore` empty, calls
   `AuthService.restoreSession()`: refresh the access token (updating
   `SessionStore.accessToken` so `authInterceptor` can attach it), *then*
   call `/auth/me` to recover the `user` object (since `/auth/refresh`
   alone never returns one). Only on failure does it redirect to
   `/login?returnUrl=...`.
2. **First load / hard reload, hitting a *public* route** (`/`,
   `/login`, `/register`) — `redirectIfAuthenticatedGuard` needs the
   exact same silent-restore attempt, or a still-logged-in visitor who
   simply reloads `/login` would incorrectly see the login form (their
   in-memory session is gone, but their refresh cookie is still valid).
   This was originally missing — added as one of the five real fixes
   below.
3. **Mid-session, an already-populated `SessionStore` gets a 401 from
   some other call** — `refreshInterceptor` doesn't need step 1's `/me`
   call at all; the `user` object is already known, only the access
   token needs refreshing before retrying the original request once.

## Best Practices

- Verify every backend contract against the real running server before
  writing a DTO/interface — `auth.models.ts`'s shape (including that
  `profileImagePublicId` is present, unstripped, on every auth
  response) came from reading `user.service.js`'s `sanitizeUser`/
  `attachPermissions`, not from guessing.
- Reason through a platform API's actual chain semantics before wiring
  it, not just copying a plausible-looking order — Angular's
  interceptor array order is reversed for the response/error path, a
  fact that changes correctness, not just style.
- Keep the Store as the only mutator of its own signals — components
  and guards call `AuthService`/guard functions, never
  `SessionStore.setSession`/`clearSession` directly.

## Common Mistakes

- Storing the access token in Web Storage "because it's simpler" —
  reopens exactly the XSS hole the backend's httpOnly cookie was built
  to close.
- Attaching a Bearer token indiscriminately to every request, including
  `/auth/login`/`/auth/register`/`/auth/refresh` themselves — usually
  harmless, occasionally causes confusing failures when a stale token
  happens to be present.
- Treating a 401 as always meaning "session expired" — from
  `/auth/login`/`/auth/register`, it means "wrong credentials," and
  triggering a refresh attempt in response (this feature's Bug #2) masks
  the real error.
- Assuming the browser Back button always means "a normal Angular
  navigation happens" — it can instead resurrect an entire frozen page
  from the back/forward cache, bypassing every guard (Bug #5).

## Performance Notes

Every route still lazy-loads independently; `PublicLayoutComponent`/
`ShellComponent` add two more small chunks (0.6–16 KB transfer each).
`BreakpointObserver` is the only new CDK usage, negligible cost.

## Accessibility Notes

Password fields carry `autocomplete="current-password"`/
`"new-password"` (correct password-manager behavior); the show/hide
toggle button has `aria-label`/`aria-pressed`. Form errors use
`<mat-error>` with Angular Material's own `aria-describedby` wiring.
Sidebar responsiveness (`mode="side"`/`"over"`) uses
`BreakpointObserver`, not a CSS-only media query, so the sidenav's
`mode` input (which affects keyboard/focus-trap behavior) is actually
correct at each breakpoint, not just visually similar.

## Security Notes

- Access token: in-memory `SessionStore` signal only, confirmed via
  DevTools Storage tab to never appear in `localStorage`/
  `sessionStorage`.
- Refresh token: httpOnly, `Secure` in production, `SameSite=Lax`,
  scoped to `path=/api/v1/auth` — confirmed this cookie is genuinely
  absent from requests to other paths (e.g. a future `/employees` call),
  not just assumed from the `path` attribute.
- `refreshInterceptor`'s single-flight dedup isn't just an optimization
  — this backend rotates the refresh token on every use, so two
  concurrent refresh calls would have one invalidate the other,
  potentially force-logging-out a user who did nothing wrong.
- No frontend copy of the role→permission map — `hasPermission`/
  `hasAnyPermission` are direct array lookups against a server-resolved
  list, zero drift risk (blueprint §7.1).

## Real Bugs Found During This Feature

All five were caught through actual browser testing against the real
backend, per this project's "see the browser after every step" working
style — none were caught by code review or static analysis:

1. **`app.component.html`** still held Feature 0's Angular CLI
   placeholder content above `<router-outlet />` — every routed page
   was rendering correctly all along, just invisible below it.
2. **`refreshInterceptor` didn't exclude `/auth/login`/`/auth/register`**
   from its 401-triggers-refresh logic, so a wrong-password login
   attempt triggered a spurious `/auth/refresh` call whose own error
   ("Refresh token missing") masked the real "Invalid credentials"
   message.
3. **`BreadcrumbsComponent` crashed on first render** — it walks the
   live `ActivatedRoute` tree synchronously during construction, but a
   deeper child route node can exist before the router attaches its
   `snapshot`; fixed by guarding on `child?.snapshot`, not just
   `child`'s existence.
4. **Missing `replaceUrl: true`** on the post-login/register
   navigation left `/login`/`/register` in browser history, so Back
   returned to the login form after a successful authentication.
5. **Chrome's back/forward cache** restored an entire frozen pre-login
   page on Back, bypassing every guard (confirmed via the browser
   console's own "Page entered Back-Forward Cache" message) — fixed
   with a `pageshow`/`event.persisted` handler forcing a real reload,
   paired with hardening `redirectIfAuthenticatedGuard` to attempt a
   silent restore before deciding (previously only `authGuard` did
   this).

## Interview Questions

- **Q: Why does the access token live in a signal instead of
  `localStorage`?** A: `localStorage` is readable by any script running
  on the page — a single XSS vulnerability anywhere in the app would
  let an attacker exfiltrate a long-lived credential. The backend
  already made its refresh token unreadable by JavaScript (httpOnly
  cookie) specifically to blunt XSS; storing the access token in Web
  Storage would reopen the same hole from the other side. The cost —
  losing the session on every hard reload — is deliberately accepted
  and solved by a silent refresh instead.
- **Q: Why does `refreshInterceptor` need to come *after*
  `errorInterceptor` in the interceptors array, not before?** A:
  Angular runs interceptors in array order outbound, but in *reverse*
  order for the response/error path — the last interceptor in the array
  is closest to the real HTTP call and sees a response/error first. If
  `errorInterceptor` were closer to the backend than `refreshInterceptor`,
  it would show a toast for every 401, including ones `refreshInterceptor`
  was about to silently recover from.
- **Q: Why does `AuthService` need a separate `restoreSession()` method
  instead of just calling `refreshAccessToken()` everywhere?** A:
  `POST /auth/refresh` returns only `{ accessToken }`, not a `user`
  object (verified against the real controller) — mid-session, that's
  fine, since `SessionStore.user` is already populated. On a hard
  reload, `SessionStore` is completely empty, so recovering the token
  alone isn't enough; a follow-up `/auth/me` call is required to
  rebuild the full session.
- **Q: Why is there no frontend copy of the role→permission mapping?**
  A: Permission resolution is backend business logic (§7.1) — a
  frontend copy would be a second source of truth that can silently
  drift every time a role's grants change server-side. The backend
  already resolves and returns `permissions: string[]` on every
  register/login/`/me` call; the frontend just does array lookups
  against it.
- **Q: What's the practical risk of the back/forward cache bug this
  feature found?** A: A shared/public computer scenario — someone logs
  out, but if the back/forward cache weren't handled, a prior user's
  browser tab could still have a frozen "logged in" page one Back press
  away, even after that session's tokens were server-side revoked.
  Conversely, in this feature's actual repro, a still-logged-in user
  briefly saw stale unauthenticated UI — the same underlying
  browser mechanism, opposite direction, both fixed by the same
  `pageshow` handler forcing a real reload.

## Key Takeaways

- A feature this security-sensitive earns the most careful live testing
  of anything built so far — all five real bugs were browser-shaped
  bugs (routing, caching, interceptor ordering), not type errors a
  compiler could have caught.
- Reading a platform's actual chain/execution semantics (Angular's
  interceptor ordering, the browser's bfcache) before wiring against it
  is worth the time — both bugs it caught here would have been
  confusing, hard-to-reproduce reports from a real user in production
  otherwise.
- "Verify against the real backend, never invent a contract" paid off
  concretely twice: discovering `/auth/refresh` doesn't return a `user`
  (shaping `restoreSession()`'s two-step design) and discovering
  `provideHttpClient()` has no global-credentials feature (shaping
  `credentialsInterceptor`'s existence) — both facts an assumption-based
  design would have gotten wrong.
