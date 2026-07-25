# Frontend Chapter 3 — Landing Page & Dashboard Quick-Navigation

## Theory

Feature 2 deliberately deferred two things named in the blueprint: the
Landing Page's real content (§4.2) and the Dashboard's quick-navigation
cards + reserved widgets region (§4.3). Both were disposable/placeholder
by explicit design — the Landing stub existed only so `/` wasn't a 404
during Feature 2, and the Dashboard's welcome message + profile card
were real but incomplete, with an empty `<section>` reserved for this
feature.

This feature is not a new architectural layer — it's the two deferred
pieces landing inside components that already exist, following the
binding rule revision v5 recorded in the blueprint: extend
`DashboardPageComponent` additively, never restructure it. The Landing
Page needed no backend contract review at all (§0 confirms nothing backs
it); the Dashboard needed none either, beyond confirming that
`NAV_CONFIG` — the same array the Sidebar already reads — was still the
correct single source of truth for "what modules exist," now with one
new field.

## Architecture

- **`LandingPageComponent`** stays a single component with no children
  and no data-access layer — nothing here is reused elsewhere, so
  splitting it into sub-components would be pure indirection. Content is
  organized into three template sections (Hero → Features → closing
  CTA), each just markup, not separate Angular components.
- **`DashboardPageComponent`** gained one `computed()` signal,
  `visibleNavItems`, deriving from `NAV_CONFIG` and `SessionStore` — no
  new state was introduced beyond what already existed (`SessionStore`)
  plus a config array that already existed (`NAV_CONFIG`, previously
  only consumed by the Sidebar).
- **`NavItem`** (in `layout/shell/sidebar/nav-config.ts`) gained a
  `description: string` field. This is the one shared config array both
  the Sidebar (a nav list) and the Dashboard (a card grid) read — two
  different renderings of one source, never two copies.

## Folder Structure

No new folders or files. Everything landed inside:

```
features/landing/landing-page.component.{ts,html,scss}
features/dashboard/dashboard-page.component.{ts,html,scss}
layout/shell/sidebar/nav-config.ts
shared/icon-names.ts
```

`features/dashboard/widgets/` remains empty — no widget-worthy backend
capability exists yet, so nothing was built there. That's still correct
per §4.3, not an oversight.

## Angular Concepts Used

- **`computed()`** — `visibleNavItems` derives from `NAV_CONFIG` (a
  static array) and `SessionStore.hasAnyPermission(...)`, recomputing
  automatically if the session's permissions ever change (e.g. after a
  fresh login), with zero manual subscription management.
- **`@for`/`@empty`** — the Dashboard's card grid uses the `@empty` block
  to show the "more modules coming" message, the same block-comprehension
  pattern the Sidebar already established for its own empty-nav case
  (`SidebarComponent`'s `@empty { <p>No navigation items yet.</p> }`) —
  consistent, not reinvented.
- **`MAT_ICON_DEFAULT_OPTIONS`** — an `InjectionToken`-based provider
  (`app.config.ts`) that sets every `<mat-icon>` in the app's default
  `fontSet` in one place, instead of a `fontSet` attribute repeated on
  every single `<mat-icon>` usage.

## Routing

No changes. `/` and `/dashboard` already existed; both routes' guards
(`redirectIfAuthenticatedGuard`, `authGuard`) are untouched.

## State Management

No new Store. `visibleNavItems` is a plain `computed()` inside
`DashboardPageComponent` itself — it doesn't warrant promotion to a
Store, since it's derived, has no mutation, and is used by exactly one
component. Storing it as a signal instead of computing it would have
been the exact "value that can drift out of sync" anti-pattern the
blueprint's own state-management principle (§6) warns against.

## Best Practices

- **Reuse a config array across two different views rather than
  duplicating it.** The Dashboard's cards and the Sidebar's nav list
  read the same `NAV_CONFIG`, filtered the same way
  (`hasAnyPermission`) — when Employees/Users/Account ship and add
  entries, both views update from one edit.
- **Don't build a generic abstraction for its first, weakest use case.**
  `EmptyStateComponent` was reserved in the blueprint for a real reason
  (a genuine empty-list state, with loading/error siblings) — reaching
  for it here, for one static sentence with no async states around it,
  would have been solving a problem this feature doesn't have.
- **Tailwind for marketing/bespoke sections, Material for interactive
  ones** — the blueprint's own styling strategy (§14) names the Landing
  Page's marketing sections as the textbook case for Tailwind-first,
  non-Material cards; the Dashboard's cards use `mat-card` since they're
  genuinely interactive (clickable navigation), matching §13's
  inside-vs-between-components spacing boundary too.

## Common Mistakes

- **Assuming a font `<link>` in `index.html` is sufficient on its own.**
  Loading a web font makes its glyphs *available*; nothing renders them
  unless something on the page actually requests that exact font-family
  for the right elements. `MatIconModule` ships its own default
  (`'material-icons'`), completely independent of whatever font tag
  happens to sit in `<head>` — the two have to be wired together
  explicitly, and nothing errors when they aren't; the ligature text
  just silently fails to resolve to a glyph.
- **Treating a guard's `catchError` as proof an error was fully
  suppressed.** `redirectIfAuthenticatedGuard`'s `catchError(() =>
  of(true))` only stops the failed `restoreSession()` observable from
  blocking navigation — it does nothing to stop the HTTP error from
  having already passed through `errorInterceptor` earlier in the same
  pipeline. Silencing an error for the *guard's* purposes and silencing
  it for the *user's* purposes are two separate concerns, handled in two
  different places (the guard's `catchError`, and the request's
  `HttpContext`).

## Performance Notes

No new async calls, no new lazy chunks beyond the existing per-route
code-splitting Angular already does for `landing-page-component` and
`dashboard-page-component`. `@defer` was correctly not reached for — a
`computed()` over an in-memory array has no async boundary to defer
around.

## Accessibility Notes

- Landing Page has one real `<h1>` (previously a stub had none framed as
  the page's actual heading).
- Dashboard's two new regions carry explicit `aria-label`s ("Quick
  navigation", "More") so a screen-reader user gets an accurate region
  map even while "More" is empty — an empty landmark is still a landmark
  worth naming.
- The nav cards are `mat-card[routerLink]`, which Material keeps
  keyboard-focusable and activatable via Enter/Space — not a bare `div`
  with only a `(click)` handler.

## Security Notes

Nothing in this feature touches authentication or authorization
directly, but the second bug fixed here is adjacent to both: a silent,
expected-to-fail background auth check (`restoreSession()` on every
anonymous page load) was leaking as a user-visible error. That's a UX
bug, not a security hole — the guard's actual access-control decision
was always correct — but it's the kind of noisy, alarming error message
that trains users to distrust or dismiss real security-relevant
messages, which is itself worth treating seriously.

## Real Bugs Found During This Feature

1. **Every `<mat-icon>` in the app rendered its ligature text literally**
   instead of a glyph (`<mat-icon>people</mat-icon>` showed clipped text
   reading "peo"). `index.html` loads the "Material Symbols Outlined"
   font, but `MatIconModule`'s own default `fontSet` targets the
   classic, never-loaded "Material Icons" font — a font-family mismatch
   present since Feature 1, invisible at the small sizes Feature 2's
   header/login icons used, unmissable once this feature's larger
   Landing feature-card icons made it obvious. Fixed with one global
   `MAT_ICON_DEFAULT_OPTIONS` provider plus the matching
   `.material-symbols-outlined` CSS class.
2. **A "Refresh token missing" toast fired on every anonymous visit to
   `/`, `/login`, `/register`, and immediately after logout.**
   `redirectIfAuthenticatedGuard`'s routine silent `restoreSession()`
   attempt is *supposed* to fail quietly whenever there's no valid
   session — but `AuthService.refreshAccessToken()`'s HTTP call didn't
   carry the `SKIP_GLOBAL_ERROR_NOTIFICATION` context `login()`/
   `register()` already used, so every such expected failure surfaced as
   a raw, alarming toast. Fixed by giving `refreshAccessToken()` the
   same context.

Neither bug was caught by `ng build`/`ng lint`/`ng test` — both were
found exclusively through live browser testing, the same pattern every
prior feature's real bugs followed.

## Interview Questions

**Q: You add a web font `<link>` to `index.html`, but a component
library's icon component still renders the wrong glyphs. What's likely
wrong, and how would you diagnose it?**
A: Loading a font makes it *available*; nothing consumes it unless some
CSS rule requests that exact `font-family` for the relevant elements.
Check what CSS class/font-family the component library actually applies
by default (e.g. `MatIconModule`'s default `fontSet` is a specific,
separate font from whatever you loaded) — a mismatch there means the
element renders its literal fallback text instead of resolving a
ligature to a glyph, with no console error at all. Fix by aligning the
library's configured font-set with the font you actually loaded, in one
shared place rather than per-usage.

**Q: A guard's `catchError` swallows an HTTP error so navigation isn't
blocked. Why might the user still see an error toast?**
A: The guard's `catchError` only affects what the *guard's observable*
resolves to — it runs after the HTTP request has already gone through
the full interceptor chain, including any interceptor that reports
errors globally (e.g. to a toast service). Suppressing an error for the
guard's own decision-making and suppressing it from ever reaching the
user are two different concerns; the latter has to be handled at the
HTTP-request level (e.g. an `HttpContext` flag the error-reporting
interceptor checks), not by catching it later in a completely separate
consumer of that same request.

**Q: Why derive `visibleNavItems` with `computed()` instead of storing
it as a plain signal set once on init?**
A: A `computed()` value is guaranteed to always reflect its current
dependencies (`NAV_CONFIG`, `SessionStore`'s permissions) with no
window where it can go stale — if permissions ever change (e.g. after a
fresh login without a full page reload), a plain signal set once at
construction time would silently keep showing the old filtered list
until something remembered to recompute it by hand. `computed()` removes
that entire class of bug by construction.

**Q: Why wasn't a generic `EmptyStateComponent` built for the
Dashboard's "no modules yet" message?**
A: Because this is a single static sentence with no loading/error states
around it — building a reusable, configurable component for that one
case would be solving a problem this feature doesn't actually have. The
blueprint already reserves that component for a genuinely justified
future case (Employees' real empty-list state, which does have
loading/error/empty as siblings) — better to build the real abstraction
once that case exists than guess at its shape now.

**Q: Two features (Sidebar, Dashboard) both need "what modules exist and
what can this user access." Why one shared config array instead of each
feature computing its own list?**
A: Because a role's access to a module is one fact, not two — if it were
computed independently in two places, a future change to permission
requirements could update one and silently miss the other, producing
two UI surfaces that disagree with each other about what the user can
do. One `NAV_CONFIG`, filtered identically by both, guarantees they
never drift apart.

## Key Takeaways

- Deferred scope from an earlier feature is still real scope — Feature 3
  was "just" the two things Feature 2 explicitly named as out of scope,
  built the same way (Theory → Architecture → Plan → Implementation →
  Review → Docs), with the same rigor.
- Two real, previously-invisible bugs surfaced purely because this
  feature made existing code paths (icon rendering, silent session
  restoration) more visible than before — a reminder that "no one
  reported it" is not the same as "it doesn't happen."
- Reuse existing config/state before reaching for something new: this
  feature added zero new Stores, zero new services, and one additive
  interface field, because everything it needed (`NAV_CONFIG`,
  `SessionStore`) already existed.
