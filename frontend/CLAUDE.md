# Employee Management App — Frontend

## My Role: Senior Angular Engineer and Mentor

I am acting as a **Senior Angular Engineer and Staff-level mentor** for
this project. My goal is twofold: (1) build a production-grade Angular
application, and (2) teach **why** every architectural and coding
decision exists. The person I'm working with already has ~5 years of
Angular experience (see `backend/CLAUDE.md` — they came to backend
engineering from a frontend-strong foundation) and wants to reach
Staff-Engineer-level depth here, not fundamentals. Every feature is a
complete learning session, not a checklist to clear quickly.

## The Frontend Architecture Blueprint Is the Constitution

**[`docs/frontend-architecture-blueprint.md`](../docs/frontend-architecture-blueprint.md)**
is the single source of truth for every architectural decision — layered
+ feature-first architecture, folder structure, routing, state
management (signals-based Stores, not NgRx), authentication, the API
layer, UI architecture, naming conventions, styling strategy,
accessibility, and performance. Nothing in this file repeats that
content; this file records **process** and the **running feature log**.
**Never bypass or contradict the blueprint without explicit approval.**

## Non-Negotiable Rules

1. **Never rush into implementation.** Explain first, code second.
2. **Never make architectural assumptions.** Always verify against the
   real running backend — never invent APIs, DTOs, or permissions.
3. **Never use mock business data** unless explicitly requested.
4. **Every feature goes through all 8 phases below, in order, with no
   skipping**, regardless of how tersely the feature is requested.
5. **Stop and wait for explicit approval at every phase gate** before
   moving to the next — most importantly before Phase 5
   (Implementation) and before starting the next feature after Phase 8.
6. **Explain WHY, not just WHAT.** When more than one valid approach
   exists, compare them and justify the choice for this project
   specifically.
7. **Keep commits small; never bundle unrelated refactoring; never
   introduce an architectural change without approval.**
8. **Never commit or push without explicit approval** — Phase 8
   proposes a commit message and waits.

## The 8-Phase Feature Workflow

1. **Theory** — what the feature is, why it exists, the business
   problem, where it fits architecturally, how enterprise Angular apps
   typically implement it, common mistakes, best practices, production/
   performance/security/accessibility/scalability considerations. No
   code.
2. **Architecture** — folder placement, component hierarchy, smart vs.
   presentational split, Store/Service/DTO/Domain Model/Mapper
   responsibilities, routing, guards, interceptors, shared/core
   components, state management, and explicitly how this follows the
   blueprint. No code.
3. **Action Plan** — files to create/change and why, development order,
   risks, testing strategy, manual verification steps, responsive +
   accessibility considerations, Definition of Done. Wait for approval.
4. **Git** — propose a branch (currently: everything lands on the
   long-lived `frontend` branch — see below), description, and scope.
   Wait for approval.
5. **Implementation** — only after approval. Production-quality code,
   explained as it's written.
6. **Review** — what was built, why it works, which Angular concepts
   were used and why, alternatives considered, trade-offs, performance
   implications, future improvements.
7. **Documentation** — update `frontend/README.md` if needed; write
   `handbook/frontend-XX-<feature>.md` (theory, architecture, folder
   structure, Angular/RxJS/Signals/Reactive Forms/Material concepts
   used, routing, state management, best practices, common mistakes,
   performance, accessibility, security, interview questions, key
   takeaways).
8. **Git Completion** — commit message, commit description, PR title,
   PR description, manual testing checklist. **Do not commit** — wait
   for explicit approval.

## Git Workflow

All frontend work lands on one long-lived `frontend` branch (created
2026-07-22 off `main` at commit `db19130`), accumulating every
feature's commits over time. This is a deliberate departure from the
backend's one-branch-per-feature-merged-immediately pattern — merge
into `main` happens only on explicit instruction. A feature only gets
its own separate branch if explicitly requested.

## Technology Stack

| Concern | Technology | Status |
|---|---|---|
| Framework | Angular 21.2.19, standalone APIs (no NgModules) | ✅ Feature 0 |
| Language | TypeScript 5.9, strict mode | ✅ Feature 0 |
| State | Signals + `computed()`; RxJS at true stream boundaries only | Introduced per-feature |
| Styling | SCSS composition root | ✅ Feature 0 |
| Design system | Angular Material 3 (custom theme), Tailwind CSS v4 | ✅ Feature 1 |
| Routing | Angular Router | ✅ Feature 2 (public/shell route tree, guards) |
| HTTP | Angular `HttpClient`, functional interceptors | ✅ Feature 2 (credentials/auth/error/refresh) |
| Forms | Typed Reactive Forms (**not** Signal Forms — see blueprint §9) | ✅ Feature 2 (Login/Register) |
| Linting | ESLint via `@angular-eslint/schematics@21.4.0` | ✅ Feature 0 |
| Formatting | Prettier (reconciled with `backend/.prettierrc.json`) | ✅ Feature 0 |
| Testing | Vitest (Angular 21's default test runner) | ✅ Feature 0 (harness only) |
| Package manager | npm | ✅ Feature 0 |

## Naming Convention

Enforced by configuration, not just convention — see blueprint §10 for
the full table. `angular.json`'s `schematics` section sets
`addTypeToClassName: true` for components/directives/services, and the
project was scaffolded with `--file-name-style-guide=2016`, so **every**
`ng generate component/directive/service` produces
`employee-list-page.component.ts` / `export class
EmployeeListPageComponent` automatically — verified live during Feature
0, not assumed.

## Progress Log

> Update this section as features complete, mirroring
> `backend/CLAUDE.md`'s Progress Log.

- [x] Feature 0 — Angular Project Initialization
- [x] Feature 1 — Angular Material, Tailwind CSS, theming, design tokens, design system
- [x] Feature 2 — Authentication (SessionStore, guards, interceptors, Login/Register, Shell, real Dashboard)
- [x] Feature 3 — real Landing Page content, Dashboard quick-nav cards + widgets region
- [x] Feature 4 — Account: self-service profile view, profile picture upload/delete
- [x] Feature 5 — Users: admin-only, read-only user list (search + client-side sort)
- [x] Feature 6 — Employees: full CRUD, documents, first real `DataTableComponent`

_(Feature 0 — Angular Project Initialization — completed, on the
`frontend` branch. Scaffolded via `npx @angular/cli@21.2.19 new frontend`
(pinned, not `@latest`, since the latest `@angular/cli` tag has already
moved to Angular 22, which the installed Node `v22.22.1` does not
satisfy — `v22.22.1` sits just below Angular 22's `^22.22.3`
requirement but comfortably satisfies Angular 21's `^22.12.0`,
confirmed against the live npm registry before choosing the version)
with `--routing --style=scss --ssr=false --skip-git --commit=false
--package-manager=npm --strict --standalone
--file-name-style-guide=2016` — SSR declined deliberately (this is an
authenticated internal tool with no SEO/first-paint requirement);
`--skip-git`/`--commit=false` since this scaffolds into an existing
monorepo, not a fresh repo.

**A real, verified-before-relying-on-it finding shaped this feature**:
Angular 21 changed its default generated **class** naming (not just file
naming) to drop the `Component`/`Service`/`Directive` suffix entirely
(`export class App`, not `AppComponent`) — confirmed by scaffolding a
disposable probe project in an isolated scratch folder before touching
the real one, since this directly conflicted with the already-approved
`docs/frontend-architecture-blueprint.md` §10 naming convention. Found
the fix: `angular.json`'s `schematics.@schematics/angular:{component,
directive,service}.addTypeToClassName` is a real, persisted setting —
flipping it to `true` (paired with `--file-name-style-guide=2016` for
matching file names) makes **every future** `ng generate` respect §10
exactly, verified live via a disposable `TestPageComponent` generated in
the real project (confirmed `export class TestPageComponent` /
`test-page.component.ts`) and then deleted. Pipes and functional guards
were unaffected either way — `ng generate pipe` still produces
`FileSizePipe`, and guards are plain functions (`authGuard`), matching
§10 with zero configuration.

`ng generate environments` was used to scaffold environment files —
Angular no longer generates these by default. Its current convention
(`environment.ts` used as-is for production, `environment.development.ts`
swapped in via a `fileReplacements` entry for dev builds) is the
**reverse** naming from the blueprint's original illustrative
`environment.ts`/`environment.production.ts` example — adopted as-is
rather than fighting the CLI, with the blueprint amended via a
documented revision (see its revision history), not a silent edit.
`environment.development.ts`'s `apiBaseUrl` points at
`http://localhost:3000/api/v1`, matching the backend's real dev
defaults; `environment.ts` (production) uses a relative `/api/v1`,
explicitly commented as an assumption pending real hosting/Docker
decisions (backend Dockerization is still an open roadmap item).

`core/config/api-base-url.token.ts` is the one piece of `core/` with
real content this feature — a self-providing `InjectionToken<string>`
(`providedIn: 'root'`, factory reads `environment.apiBaseUrl`) so no
other file ever imports `environment` directly, mirroring the backend's
`env.js`-is-the-only-reader rule. `app.config.ts` gained
`provideHttpClient(withInterceptors([]))` — an empty array, the
extension point future `authInterceptor`/`refreshInterceptor`/
`errorInterceptor` slot into without restructuring this file.

The rest of the blueprint's folder skeleton (`core/{auth,http,
error-handling,logging}`, `shared/{components,directives,pipes,
validators,models,utils}`, `layout/{public-layout,shell}`, `features/`)
was created empty, `.gitkeep`-marked, at category granularity only —
deliberately not pre-creating individual future component folders
(`shared/components/data-table/`, etc.), mirroring the backend's own
Feature 1 precedent (`errors/`/`middlewares/`/`utils/` scaffolded as
categories, not per-file stubs).

`@angular-eslint/schematics@21.4.0` pinned explicitly (verified
peer-compatible with `@angular/cli >=21.0.0 <22.0.0` against the live
npm registry) rather than `@latest`, which already targets Angular 22.
Its bundled `angular.configs.templateAccessibility` lint rule is active
from this first commit, before any real template exists to violate it.
`.prettierrc` merged with `backend/.prettierrc.json`'s explicit settings
(`semi`, `trailingComma`, `tabWidth`, `arrowParens`, `endOfLine`),
keeping Angular's own useful addition (the `*.html` → Angular parser
override, which the backend has no equivalent need for).

**Dependency baseline** (`npm audit` / `npm outdated`, run once
post-scaffold, no upgrades applied per explicit instruction — nothing
here blocks setup): `npm audit` reports 3 moderate-severity
vulnerabilities, all tracing to `@hono/node-server` (a Windows
path-traversal advisory, GHSA-frvp-7c67-39w9) pulled in transitively via
`@modelcontextprotocol/sdk` ← `@angular/cli`'s new bundled MCP-server
support (the same feature that generates `.vscode/mcp.json`) — this is
a **dev-tooling-only** dependency chain (`@angular/cli` is a
devDependency; nothing here ships in the built application), and the
suggested `npm audit fix --force` would downgrade `@angular/cli` to
`21.0.4`, a regression from the pinned `21.2.19` — not applied.
`npm outdated` shows `angular-eslint` (21.4.0 → 22.1.0, tied to Angular
22, deliberately not followed yet), `jsdom` (28.1.0 → 29.1.1),
`typescript` (5.9.3 → 7.0.2), `typescript-eslint` (8.59.2 → 8.65.0) —
all noted as a point-in-time baseline, not acted on.

**One more real, live-discovered bug**: the repository root's `.gitignore`
(added during the earlier monorepo restructuring) had an unanchored
`.vscode/` rule, which - unlike a scoped `/.vscode/` - matches at every
directory depth and silently blocked `frontend/.gitignore`'s deliberate
`!.vscode/tasks.json`-style negations for Angular's own CLI-generated
`.vscode/*.json` files, even though those files were never actually
intended to be repo-root-only. Caught by dry-running `git add -n
frontend/` and noticing the `.vscode/*.json` files were missing from the
expected staged list, then confirmed with `git check-ignore -v`. Fixed
by anchoring the root rule to `/.vscode/`/`/.idea/` (repo root only),
letting each subproject (`backend/`, `frontend/`) own its own
`.vscode/`/`.idea/` policy via its own `.gitignore` - `backend/` has no
`.vscode/` folder today so this had no visible effect there, only on
`frontend/`.

Verified live end-to-end: `npm install` clean; `ng serve` boots on port
4200 (matching the backend's already-configured `CORS_ORIGIN` default)
and actually serves `200` with the expected HTML (confirmed via a real
HTTP request, not assumed); `npm run lint` passes with zero errors;
`ng build --configuration=production` succeeds within budget
(232.43 kB raw / 63.23 kB estimated transfer); `ng test` passes (2
tests, the CLI's own default spec). `index.html`'s `<html lang="en">`
and viewport meta were already correct from the CLI default; `<title>`
was the generic "Frontend" placeholder, fixed to "Employee Management
System". No Material, Tailwind, or business-feature code exists yet —
deliberately deferred, matching the approved Feature 0/Feature 1 split.
See `docs/frontend-architecture-blueprint.md`'s revision history for
the environment-naming amendment made during this feature.)_

_(Feature 1 — Angular Material, Tailwind CSS, theming, design tokens,
design system — completed, on the `frontend` branch. `ng add
@angular/material@21.2.14` run as a scaffold-only step (installs
`@angular/material` + `@angular/cdk`; no `@angular/animations` and no
`app.config.ts` changes — confirmed by reading its real `setup-project.js`
before running it, not assumed); its canned palette prompt was accepted
only because it gets replaced next, and its font link (legacy
`Material+Icons`) and its position-0 insertion directly into
`styles.scss` were both known, verified-in-advance discrepancies against
the blueprint, corrected during Implementation rather than encountered
as surprises.

**The custom theme was generated, not chosen from a preset.** Angular
Material's real per-seed-color generator is a separate schematic,
`ng generate @angular/material:m3-theme` (alias `theme-color`) —
undocumented in `ng add`'s own interactive flow, found by reading the
installed package's `schematics/collection.json` directly. Run with
`--primary-color="#1E56A0"` (a professional-blue brand color, chosen by
the user from a short set of options rather than invented) against
`--directory=src/styles`, it ran Google's Material Color Utilities (HCT
color-space algorithm) and produced a real, full M3 tonal palette. One
real tool quirk found live: the `--directory` option doesn't create a
non-existent folder — it produced a flat `src/styles_theme-colors.scss`
(directory + filename concatenated with no separator) instead of
`src/styles/_theme-colors.scss`; caught immediately by checking where
the file landed, then relocated by hand.

`styles/_material-theme.scss` feeds the generated palette into
`mat.theme()` with `typography: Roboto` and `density: -2` — the density
value was not assumed; it was derived by grepping every
`clamp-density()` call site across Material's real component Sass
source and taking the tightest floor found (chips, at `-2`), guaranteeing
the compact setting applies uniformly with no per-component silent
truncation. Verified in the actual compiled build output afterward
(`--mat-button-filled-container-height: 32px`, below M3's 40px spec
default at density 0).

`styles/_tokens.scss` holds Sass **variables** (not a second CSS
custom-property layer) aliasing semantic names to Material's real M3
system-variable names (`--mat-sys-primary`, `--mat-sys-error` for
"warn", etc. — the exact role list confirmed by reading Material's own
`core/tokens/m3/_md-sys-color.scss`), plus a genuinely new spacing unit/
radius/elevation scale. `styles.scss`'s Tailwind `@theme` block is the
only place these are turned into real runtime custom properties
(`--color-primary`, `--spacing`, `--radius-*`, `--shadow-*`) — a
deliberate one-layer design, since a naive two-layer version (tokens.scss
defining `--color-primary` at `:root`, Tailwind's `@theme` also defining
`--color-primary: var(--color-primary)`) is a genuine CSS custom-property
self-reference cycle per spec, not just redundant — verified this
wouldn't happen by inspecting the real compiled CSS, which shows
`--color-primary: var(--mat-sys-primary)` resolving cleanly with no
cycle.

Tailwind v4 (`4.3.3`, deduped against `@angular/build`'s own transitive
dependency) wired via `postcss.config.json` (auto-discovered by
`@angular/build:application`, zero `angular.json` changes) and
`@import 'tailwindcss';` inside `styles.scss` — Sass flags this with a
deprecation warning (`@import` is deprecated in Dart Sass generally) but
still passes it through unresolved to the compiled CSS since `tailwindcss`
isn't a resolvable Sass partial, letting `@tailwindcss/postcss` process
it correctly afterward — confirmed by inspecting the actual compiled
output for real generated utility classes (`.bg-primary`,
`.rounded-md`, `.shadow-elevation-2`), not just trusting that the build
didn't error.

`index.html`'s font link was corrected from the schematic's default
legacy `Material+Icons` to `Material+Symbols+Outlined`, matching
blueprint §13; confirmed in the compiled output that the Symbols
`@font-face` rule is what actually ships. `shared/icon-names.ts` was
scaffolded with the frozen-object pattern and zero entries — no feature
consumes an icon yet, so none were invented.

Verified live end-to-end: `npm install` clean (same 3 moderate,
dev-tooling-only `npm audit` advisories as Feature 0's baseline, no new
ones from Material/Tailwind); `ng lint` zero errors; `ng test` passes (2
tests, unchanged); `ng build --configuration=production` succeeds at
330.49 kB raw / 83.90 kB estimated transfer (up from Feature 0's
232.43 kB / 63.23 kB, still well inside the existing 500 kB/1 MB budget,
no budget change needed). Manual verification used a temporary
`MatButtonModule`/`MatIconModule` smoke test in `app.component`
(confirming custom theme color, compact density, Tailwind utility
classes, and the Material Symbols glyph all render correctly together),
reverted before commit so the feature's diff stays scoped to
design-system files only. `angular.json` picked up an analytics UUID
during a schematic run — surfaced to the user explicitly rather than
silently committed or silently stripped; kept, by the user's explicit
choice.)_

_(Feature 2 — Authentication — completed, on the `frontend` branch.
Scope confirmed in Phase 1/2 discussion before any code: `SessionStore`,
the 3 guards, the 4 interceptors, Login/Register, both layout shells
(`PublicLayoutComponent`, `ShellComponent`), and a **real** (not
placeholder) `DashboardPageComponent` — Landing Page's actual content and
Dashboard's quick-nav/widgets region stay Feature 3's job. The blueprint
itself was amended (revision v5) with this decision recorded explicitly:
`ShellComponent` is structurally complete as of this feature; future
features extend `nav-config.ts`/menu items/breadcrumb data, never
restructure the Shell, the Dashboard route/guard, or `SessionStore`'s
shape.

Every contract was verified against the real backend before writing
code, not assumed: `POST /auth/register`/`login` return
`{ message, user, accessToken }` plus a `Set-Cookie: refreshToken`
scoped to `path=/api/v1/auth`; `POST /auth/refresh` returns **only**
`{ accessToken }` — no `user` — which is why `AuthService.restoreSession()`
exists as a two-step refresh-then-`/me` chain for `authGuard`'s
bootstrap/reload path, distinct from `refreshInterceptor`'s simpler
mid-session token-only refresh. `user` includes `roles`/`permissions`
(§7.1's shipped backend enhancement) plus `profileImageUrl`/
`profileImagePublicId`/`createdAt`/`updatedAt` — no Decimal/Date
asymmetry like Employees will have, so `auth.models.ts` is a single
shared interface, deliberately skipping a dto/model/mapper split that
would have been premature here.

**A real correction to the blueprint's own text**, found by reading the
installed `@angular/common/http` typings rather than trusting the
existing prose: `provideHttpClient()` has no global "always send
credentials" provider feature (only `withInterceptors`,
`withInterceptorsFromDi`, `withXsrfConfiguration`,
`withNoXsrfProtection`, `withJsonpSupport`, `withRequestsMadeViaParent`,
`withFetch` exist) — §7's "applied globally via the HttpClient provider
configuration" described a mechanism that doesn't exist. Replaced with a
real `credentialsInterceptor`, registered first in the array. A second,
subtler correction was found by reasoning through Angular's actual
interceptor chain semantics (array order = outbound order, but
**reverse** array order for the response/error path): the interceptor
array is `[credentials, auth, error, refresh]`, not the more intuitive
`[..., refresh, error]` — `refreshInterceptor` needs to be closer to the
real HTTP call than `errorInterceptor` so it can silently retry a 401
before `errorInterceptor` ever sees it, otherwise every successful
silent refresh would flash a spurious error toast first.

**Five real bugs were found and fixed during this feature's own browser
verification** (per the user's explicit request to check the actual
rendered app after every step, not just build/lint output) — none
caught by code review:

1. `app.component.html` still held Feature 0's Angular CLI placeholder
   marketing content *above* `<router-outlet />` — every routed page was
   rendering correctly the whole time, just invisible below the
   placeholder. Fixed by finally replacing it with a bare
   `<router-outlet />` (and trimming the now-dead `title` signal from
   `app.component.ts`/`.spec.ts`).
2. `refreshInterceptor` only excluded `/auth/refresh` from its
   "401 → attempt silent refresh" logic, not `/auth/login`/`/auth/register`
   — a failed login (wrong password) triggered a spurious `/auth/refresh`
   call, and *that* call's own 401 ("Refresh token missing") masked the
   real login failure message shown to the user. Fixed with a shared
   `AUTH_ENDPOINTS_WITHOUT_SESSION` constant excluding all 3 endpoints
   from both `authInterceptor` and `refreshInterceptor`.
3. `BreadcrumbsComponent` crashed on first render (`Cannot read
   properties of undefined (reading 'url')`) — it walks the live
   `ActivatedRoute` tree synchronously during construction, but the
   deeper `dashboard` child node can exist before the router has
   attached its `snapshot`. Fixed by guarding on `child?.snapshot`, not
   just `child`'s existence.
4. Login/Register used a plain `navigateByUrl` after success, leaving
   `/login`/`/register` in browser history for the Back button to
   return to post-authentication. Fixed with `{ replaceUrl: true }`.
5. Chrome's back/forward cache restored an entire frozen pre-login page
   — JS heap and all — on Back, bypassing every guard and briefly
   showing stale unauthenticated UI to an actually-still-logged-in user
   (confirmed via the browser console's own "Page entered Back-Forward
   Cache" message). Fixed two ways together: a `pageshow`/
   `event.persisted` handler in `app.component.ts` forces a real reload
   when a bfcache restoration is detected, and `redirectIfAuthenticatedGuard`
   was hardened to attempt a silent `restoreSession()` before deciding
   — previously only `authGuard` did this, an inconsistency that would
   have shown the login form to a still-logged-in visitor on any genuine
   fresh reload of `/login`, not just the bfcache case.

`shared/utils/extract-error-message.util.ts` centralizes the
`HttpErrorResponse` → message extraction shared by `errorInterceptor`
and both auth forms — one real behavior, not duplicated three times.
`shared/directives/has-permission.directive.ts` and
`PageHeaderComponent` remain unbuilt — no feature yet has a
template-level permission gate or a primary-action slot to need them;
first likely consumer is Employees. `core/error-handling/
global-error-handler.ts` stays empty — orthogonal to this feature.

Verified live end-to-end against the real running backend (no mocks):
register (new email → real `201`, cookie set with the correct path,
duplicate email → real inline `409` banner), login (correct/wrong
credentials → real inline banner, not a generic message), logout
(cookie actually cleared, confirmed in DevTools), deep-link to
`/dashboard` while logged out → `/login?returnUrl=%2Fdashboard` →
login → lands back on the original URL, already-authenticated visits to
`/`/`/login`/`/register` bounced to `/dashboard`, a genuine hard reload
on `/dashboard` surviving via silent refresh, `localStorage`/
`sessionStorage` confirmed empty in DevTools throughout, and
`refreshInterceptor`'s single-flight dedup confirmed via a temporary
`window.__debugAuth` probe (two concurrent forced-401 calls produced
exactly one `/auth/refresh` network call), removed before commit.
`ng build`/`ng lint`/`ng test` all clean throughout. See
`docs/frontend-architecture-blueprint.md`'s revision v5 for the
Shell/Dashboard "extend, don't restructure" decision and the
`credentialsInterceptor`/interceptor-order corrections made during this
feature.)_

_(Feature 3 — real Landing Page content, Dashboard quick-navigation
cards + widgets region — completed, on the `frontend` branch. Scope was
exactly what revision v5 deferred from Feature 2: `LandingPageComponent`
(disposable stub replaced wholesale — hero, 3 honest feature highlights
mirroring what the app actually does today, Register/Login CTAs) and
`DashboardPageComponent` extended in place (same file/route/guard, no
restructuring) with a `computed()` view over `nav-config.ts`'s
`NAV_CONFIG` — the exact same array the Sidebar already reads,
permission-filtered identically, so the two never drift apart. `NavItem`
gained one additive field, `description: string`, for the one-line
per-card text §4.3 always called for — zero-risk since `NAV_CONFIG` was
still `[]` at the time.

Confirmed in Phase 1 (Theory) before any code: since no feature
(Employees/Users/Account) has added a `NAV_CONFIG` entry yet, the
quick-navigation section would render zero cards today. Rather than
build the full shared `EmptyStateComponent` (§11) for this one cosmetic
case, the Dashboard shows a one-line "More modules will appear here as
they become available" message — an honest reflection of current app
capability, matching the same "no fabricated content" discipline as
§0's "no analytics endpoint" rule. `EmptyStateComponent` itself stays
deliberately unbuilt, reserved for Employees' genuine empty-list state,
which is the better-justified first real use.

**Two real, pre-existing bugs were found and fixed via this feature's
own live browser testing** — both latent since Feature 1/2, neither
caught by build/lint/test:

1. **Every `<mat-icon>` in the app was rendering its ligature text
   literally** (e.g. `<mat-icon>people</mat-icon>` showing the clipped
   text "peo" instead of a glyph) — invisible at the small sizes Feature
   2's header/login icons used, but unmissable once Landing's larger
   feature-card icons made it obvious. Root cause: `index.html` has
   always loaded the "Material Symbols Outlined" web font, but
   `MatIconModule`'s own default `fontSet` is the classic, never-loaded
   "Material Icons" font — a font-family mismatch, not a font-loading
   race. Fixed globally, once: `{ provide: MAT_ICON_DEFAULT_OPTIONS,
   useValue: { fontSet: 'material-symbols-outlined' } }` in
   `app.config.ts`, plus the required `.material-symbols-outlined` CSS
   class (Google's own recommended definition) added to `styles.scss`.
2. **A "Refresh token missing" toast fired on every visit to `/`,
   `/login`, or `/register` while logged out — including immediately
   after logout.** `redirectIfAuthenticatedGuard` (hardened during
   Feature 2's bfcache fix) attempts a silent `restoreSession()` on
   every such navigation; for a genuinely anonymous visitor or a just-
   logged-out session, that attempt is *supposed* to fail silently, but
   `AuthService.refreshAccessToken()`'s HTTP call didn't carry the
   `SKIP_GLOBAL_ERROR_NOTIFICATION` context `login()`/`register()`
   already used, so `errorInterceptor` surfaced the failure as a
   user-visible toast every time. Fixed by giving `refreshAccessToken()`
   the same context; the shared field was renamed `silentErrorContext`
   (from `formOwnedErrorContext`) since it now documents both reasons a
   request might carry it, not just the form-owned one.

Verified live: `/` while logged out shows the real Landing content with
working Register/Login CTAs and correctly-rendered feature icons; a
resize confirmed the feature-card grid stacks to one column on mobile;
`/dashboard` while logged in shows the new "Quick navigation" section
(the expected empty-state message, `NAV_CONFIG` still being `[]`) and a
still-separate, still-empty "More" widgets section; no toast on
logged-out reload or post-logout; icons render correctly everywhere
(header menu, login/register visibility toggle, Landing's feature
cards). `ng build`/`ng lint`/`ng test` all clean throughout. See
`docs/frontend-architecture-blueprint.md`'s revision v6 for where each
of these two bugs and the `NavItem.description` addition are recorded
against the sections they amend (§4.3, §7, §13).)_

_(Feature 4 — Account (self-service profile view, profile picture
upload/delete) — completed, on the `frontend` branch. Backend contract
re-verified before any code, not assumed: `backend/src/modules/users/
user.routes.js` exposes exactly `GET /users` (admin-only, unrelated),
`POST /users/me/profile-picture`, and `DELETE /users/me/profile-picture`
— **no endpoint exists to update name/email**, so Account is
deliberately read-only for those fields (sourced straight from
`SessionStore`, already populated by login/`/auth/me` — no new fetch),
not an oversight worked around. Both profile-picture endpoints return
`sanitizeUser(updatedUser, roles)` — roles only, **never** `permissions`
(matches §7.1's rule that only register/login/`/auth/me` attach that) —
modeled precisely via `ProfilePictureResponse { user: Omit<AuthUser,
'permissions'> }` in `account.models.ts`, so the missing field is a
type-checked fact, not just a comment.

**A real design risk, caught in Phase 1 Theory before any code**: naively
merging that response into `SessionStore.user` would have silently
wiped `permissions` from the live session after every profile-picture
change, breaking every `hasAnyPermission()` check app-wide with no
error anywhere. Fixed architecturally, not defensively: `SessionStore`
gained `updateProfileImage(url, publicId)`, merging only the two fields
that actually changed — `AccountStore` calls this, never
`sessionStore.user.set(response.user)`.

`shared/components/file-upload/` (`FileUploadComponent`) was built for
real this feature — unlike Feature 3's deliberate deferral of
`EmptyStateComponent`, this one already has two justified consumers
(this feature's profile picture now, Employee documents later), per
blueprint §11. It's dumb (no `HttpClient`/Store injection): drag-drop +
a real, keyboard-operable `<button>` trigger + a client-side MIME/size
pre-check mirroring the backend's real allow-list (`image/jpeg|png|webp`,
5 MB), emitting `fileSelected`/`rejected` — the consuming component
decides how to surface a rejection. `AccountStore` (signals: `uploading`,
`error`) is the first Store in this app to also own a `LiveAnnouncer`
call — deliberately, since only the Store knows the exact moment an
upload/delete resolves, and that async outcome has no visual focus
change of its own (§15).

**This is also the first feature to add a real `NAV_CONFIG` entry**
(`{ route: '/account', ... }`) — the first live proof that Feature 3's
Sidebar-link and Dashboard-quick-nav-card mechanism, built but never
exercised, actually works end-to-end. `HeaderComponent`'s user menu
gained the "Account" item Feature 2's blueprint note reserved for this
exact moment.

Verified live: `/account` shows name/email/roles/member-since with zero
new network calls; uploading a real image updates the avatar
immediately and Sidebar/Dashboard/Header all show the new "Account"
entry for the first time; removing it reverts to a placeholder icon; a
wrong-type or oversized file is rejected client-side with an inline
message and no network request. `ng build`/`ng lint`/`ng test` all clean
throughout. See `docs/frontend-architecture-blueprint.md`'s revision v7
for where all of the above is recorded against the sections it amends
(§3/§4.3, §7, §11, §12).)_

_(Feature 5 — Users (admin-only, read-only user list) — completed, on
the `frontend` branch. Before Phase 2 (Architecture) was approved, the
user asked 5 explicit clarifying questions — what's reusable vs.
feature-specific, whether a later migration to the shared
`DataTableComponent` is expected and how it'd happen without a big
refactor, whether the Smart/Presentational split still applies to a
table this simple, whether client-side search/sort could ever be
mistaken for server-side capability, and a request to formally document
"avoid premature abstraction, build shared components only after a real
consumer validates the contract" as a standing rule — all answered
before implementation began, not deferred to after the fact.

Backend contract re-verified before any code: `GET /users`
(`authMiddleware` + `requirePermission('user:list')`) returns
`{ users: [...] }`, each a `sanitizeUser(user, roles)` — roles only,
never `permissions` (same pattern as Account's profile-picture
response); `user:list` is **ADMIN-only** (`prisma/seed.js`'s
`ROLE_PERMISSIONS`); and `user.repository.js`'s `findAll()` is a bare,
unpaginated `findMany()` — no search/sort/filter/pagination exists
server-side at all, and no mutation endpoints (promote/demote/delete)
exist either. This is a genuinely read-only admin utility, not a
trimmed-down CRUD feature.

**The premature-abstraction decision, made explicit rather than
defaulted into**: blueprint §9's `DataTableComponent` is designed
around Employees' real, upcoming **server-side** pagination — Users'
table has a fundamentally different contract (client-side only, since
the backend does none of that). Rather than force `DataTableComponent`'s
first real build to serve two incompatible pagination models at once,
Users got its own small, feature-local `UserTableComponent`
(`MatTableDataSource` + `MatSort`, client-side, deliberately **no**
`MatPaginator` — nothing here should ever visually imply the server is
paging results). `UserListPageComponent` (smart) never touches
`MatTable` APIs directly, delegating entirely to `UserTableComponent`
(presentational) — the seam that keeps a future migration (if
`DataTableComponent`'s eventual contract ever turns out to also support
a client-side mode) contained to one file, `UsersStore`/`UserService`
untouched either way, and entirely optional, not obligated.
`UsersStore.filteredUsers`'s doc comment states explicitly that this
filtering is a client-side convenience over an already-fully-loaded
array, never implying the backend supports search.

**This is the first feature to actually exercise two mechanisms built
in earlier features but never tested against a real permission
boundary**: `permissionGuard` (built Feature 2, unused until now) and
`NAV_CONFIG`'s permission filtering (Account's Feature 4 entry has
`permissions: []`, visible to everyone — Users' is the first with a
real, restrictive key). Verified live with two real accounts (registered
fresh via `POST /auth/register`, one promoted to `ADMIN` via the
established throwaway-DB-script pattern, deleted immediately after
running): as ADMIN, Sidebar/Dashboard/Header all show "Users," the list
loads both accounts with roles as chips, search filters client-side,
column sort works (including a custom `sortingDataAccessor` for the
`roles` array field and case-insensitive name/email comparison); as a
plain `EMPLOYEE`, no "Users" entry appears anywhere, and navigating to
`/users` directly redirects silently to `/dashboard` — no error, no 403
page, matching this app's established "client-side authorization is UX,
the server enforces the real check" philosophy. `ng build`/`ng lint`/
`ng test` all clean throughout. See `docs/frontend-architecture-blueprint.md`'s
revision v8 for the premature-abstraction principle recorded formally,
now evidenced by three data points across Features 3–5.)_

_(Feature 6 — Employees (full CRUD, documents, first real
`DataTableComponent`) — completed, on the `frontend` branch, staged into
4 checkpoints per the approved Action Plan, landing in one commit.
Real backend contract finding, confirmed via live `curl` before any
code: **`Employee` has no nested `user`/`manager` relation in any
response** — `userId`/`managerId` are raw, unresolved FKs
(`employee.repository.js` never `include`s the relation); `GET
/employees` (list) is `employee:read:any`-**only**, not `:any`/`:own`
like the single-record route; document upload/delete require
`employee:update:any` with **no** `:own` variant at all. Before Phase 2
was approved, six explicit clarifying questions were answered: how
enrichment should be implemented (neither of the two proposed options —
injecting `UsersStore` directly, or passing a lookup map down — matched
blueprint §1's "never feature-to-feature import" rule; the actual
answer was promoting the capability to `core/`), who owns lazy-load/
cache ownership, whether `DataTableComponent` stays pure infrastructure,
what the name-resolution fallback should be (department/job title or
"—", never a raw id), and a request to formally document "business
features must remain functional without optional enrichment data —
enrichment improves the UX but must never become a functional
dependency" as a standing principle. All answered before implementation
began.

`features/users/data-access/{user.models.ts, user.service.ts}` moved to
`core/users/{user.models.ts, user-directory.service.ts}` (renamed
`UserService` → `UserDirectoryService`) — the first real, lived example
of a capability promoted to `core/` after a second feature needed it,
not planned upfront. `UserDirectoryService` is `providedIn: 'root'`,
single-flight cached (mirrors `refreshInterceptor`'s dedup pattern),
`canListUsers()` gates on `user:list`, `ensureLoaded()` short-circuits
to zero HTTP calls without that permission, `resolveDisplayName(userId)`
returns `string | null` — never a raw id, never fabricated. Both
`UsersStore` (already-shipped Feature 5 code) and the new
`EmployeeTableComponent`/`EmployeeDetailPageComponent` depend downward
on it; neither feature imports the other.

`DataTableComponent` (`shared/components/data-table/`), deliberately
deferred through Features 3 and 5, was finally built — the first
feature whose contract (real server-side `page`/`limit`/`sortBy`/
`order`/`search`) matches what it was designed around. Pure
infrastructure: `columns`/`rows`/`loading`/`totalCount`/pagination
inputs, `(pageChange)`/`(sortChange)` outputs that just re-emit the raw
`PageEvent`/`Sort`. A new `DataTableCellDirective`
(`ng-template[appDataTableCell]`, collected via `contentChildren()`,
rendered via `NgTemplateOutlet`) supplies per-column rich content
(resolved name, currency-formatted salary) with a plain-text fallback
for every other column.

First real DTO → Model → Mapper split in the app (`employee.dto.ts`/
`employee.model.ts`/`employee.mapper.ts`) — `salary` is a Prisma
`Decimal`, a JSON string on the wire, a `number` in the domain model,
converted in one place, mirroring the backend's own
`normalizeForAudit()` isolation of the identical quirk.
`EmployeeDocument`'s domain model drops `publicId`/`resourceType`
entirely (Cloudinary bookkeeping the frontend never reads), the same
trimming precedent `Employee` itself set by dropping `deletedAt`. New
shared infrastructure validated by this feature, not built
speculatively: `shared/models/paginated.model.ts` (`Paginated` —
deliberately non-generic, since the array is always a separate sibling
key per endpoint, never nested inside pagination), `shared/utils/
http-params.util.ts`, `shared/validators/{not-future-date,
positive-number,uuid}.validator.ts`, `shared/components/confirm-dialog/`
(first real consumer: Employees' soft-delete, then Employee documents'
delete). Documents reuse `FileUploadComponent` (built in Feature 4
anticipating exactly this second consumer) inside a new
`EmployeeDocumentsDialogComponent` — upload/delete gated on
`employee:update:any` only, matching the backend's real permission
matrix exactly.

**Three real bugs were found live during this feature, none by code
review**: (1) `@angular/animations` had never been installed at all —
`provideAnimationsAsync()` had nothing to resolve until this feature's
`ConfirmDialogComponent`, the app's first real `MatDialog` usage, made
the gap a hard build error; fixed via `npm install @angular/animations`.
(2) **Critical, systemic**: the compact theme density (`-2`, chosen in
Feature 1 for chips) sets `--mat-form-field-filled-label-display: none`
— confirmed directly by grepping compiled production CSS — so **every**
`<mat-form-field>` using Material's default "filled" appearance
rendered with **zero label at all**, not a contrast issue, silently
since Feature 5 (Users' search box), only unmissable once this
feature's 6-field form made it impossible to miss (caught via the
user's own screenshot and explicit UX pushback). No equivalent
`--mat-form-field-outline-label-display: none` rule exists at this
density, so fixed globally, once, via `{ provide:
MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline' } }`
in `app.config.ts` — Login/Register were unaffected since Feature 2
already set `appearance="outline"` explicitly per field. (3) A real
user-submitted `curl` request (`userId: "test.com"`) surfaced the
backend's raw `"userId: Invalid UUID"` 400 with no prior client-side
warning — fixed with a new `uuidValidator` (mirrors the backend's
`z.string().uuid()` rule) wired into both the `userId` and `managerId`
form controls, plus inline `mat-error` messages.

`angular.json`'s production budget moved twice (500kB → 550kB → 650kB)
for genuinely eager, initial-bundle additions (`@angular/animations`,
`provideNativeDateAdapter()`, `MAT_FORM_FIELD_DEFAULT_OPTIONS`), not
lazy feature code — both disclosed at the time. Verified live across
all 4 stages against two real accounts (ADMIN and a plain EMPLOYEE):
list pagination/sort/search/filter, create/edit/delete with every
client-side validator (required fields, positive salary, not-future
date, self-management, UUID format) each individually confirmed against
a real server-side equivalent, permission-gated buttons correctly
absent for the non-admin account, document upload (PDF/jpeg/png/webp,
reject wrong type/oversized client-side)/list/delete against the real
Cloudinary-backed endpoints, and enrichment degrading honestly (a
resolved name when permitted, "—" otherwise, never a crash) in both
directions. `ng build`/`ng lint`/`ng test` all clean throughout. See
`docs/frontend-architecture-blueprint.md`'s revision v9 and
`handbook/frontend-06-employees.md` for the full account — this was the
last feature on the original roadmap; further frontend work is
enhancement-phase from here.)_

_(Employees create/edit/documents — edge-case hardening pass — 2026-07-26.
Not a numbered feature; a live-testing follow-up on Feature 6, found by
deliberately trying to break the create/edit form and the documents
dialog rather than just re-confirming the happy path. Nine real issues
fixed, none by code review alone:

1. **Salary's `type="number"` input silently reported an empty value
   whenever what was typed didn't parse as a number** (a real, user-
   screenshotted bug: `--876876` was visibly typed, yet the form said
   "Salary is required") - a known HTML quirk where a number input's
   `.value` collapses to `""` on any unparseable entry, which Angular
   then sees as `null`. Fixed by switching Salary to `type="text"
   inputmode="decimal"` and moving all parsing into `positiveNumberValidator`
   itself (now a factory taking a `max`, operating on the raw string,
   rejecting non-numeric-format input with a new `notANumber` error
   instead of silently reporting "required").
2. **The Create/Save button never reflected form validity** - only
   `submitting()` disabled it, so it stayed clickable next to a visible
   error. Fixed: `[disabled]="submitting() || (form.invalid && form.touched)"` -
   untouched/blank forms still look inviting, but the moment a submit
   attempt (or an edit) leaves the form invalid, the button goes inert
   until it's fixed.
3. **Cancel had no guard against an in-flight submit** - clicking
   Cancel right after Create/Save could leave the request running in
   the background, with a late success response calling `router.navigate()`
   to the new employee's page after the user already left. Fixed two
   ways together: Cancel's `routerLink` becomes `null` (a no-op link)
   while `submitting()`, and the submit subscription now pipes through
   `takeUntilDestroyed(this.destroyRef)` - Angular aborts the real HTTP
   request on unsubscribe, so navigating away for *any* reason (Cancel,
   back button) cleanly cancels it instead of letting it resolve into a
   dead component. The same `takeUntilDestroyed` + a new `deleting`
   signal (disabling Documents/Edit/Delete/Back while active) was added
   to `EmployeeDetailPageComponent`'s delete flow for the same reason.
4. **The documents dialog showed "No documents uploaded yet." at the
   same time as a fetch-error banner** - `documents` stays `[]` on a
   failed load, and the empty-state branch didn't know to check for an
   error first. Fixed by gating the empty-state message on
   `!documentsError()`.
5. **Every error banner in Employees was a bare, unstyled `<p>`** -
   inconsistent with the `bg-warn`/icon banner Login/Register/Account
   already use. Standardized all of them (create/edit form's
   `serverError`, the detail page's `selectedError`/`deleteError`, the
   documents dialog's `rejectionError`/`documentsError`) to the same
   pattern.
6. Plain "Loading..." text in the edit form, detail page, and documents
   dialog replaced with the same `MatProgressSpinner` pattern Account
   already established, for visual consistency.
7. **A slow document-delete request left its row fully clickable** -
   a second click would fire a redundant `DELETE` for the same id.
   Fixed with a new `EmployeeStore.deletingDocumentIds` signal (a `Set`
   of in-flight document ids), letting the dialog swap that row's
   delete button for a small spinner while its own request is pending.
8. **Documents dialog's scroll container hardened explicitly**
   (`max-h-[60vh] overflow-y-auto` on `mat-dialog-content`) rather than
   relying on Material's implicit default - not full pagination (no
   realistic per-employee document count would need it, and the backend
   endpoint doesn't support it), a deliberate proportionality call, not
   an oversight.
9. **Department/Job Title accepted whitespace-only input** ("   ") as
   valid - added a new `notBlankValidator` (mirrors the backend's own
   `.trim().min(1)` fix, see `backend/CLAUDE.md`'s matching entry),
   replacing plain `Validators.required` for both fields with no
   template changes needed (it reuses the same `required` error key).

All nine verified: build/lint/test clean throughout; the two backend-
paired fixes (unlink-via-null from the previous round, trim, and the
salary cap) were additionally verified live via direct `curl` calls
against the running server, not just inferred from reading the schema.
See `backend/CLAUDE.md`'s matching entries for the two small backend
validation corrections this pass also required.)_

_(UI/UX redesign pass — design tokens, Shell chrome, forms, toasts,
tooltips — 2026-07-26. Not a numbered feature; a full audit + design
system proposal (mood board, color/type/spacing/elevation/radius
system, component library, screen-by-screen plan) was presented and
approved before any code changed, then implemented in slices through
the full 8-phase workflow, with every fix live-verified in the browser
against the user's own screenshots rather than assumed from code
review. See `docs/frontend-architecture-blueprint.md`'s §13/§14
amendments for the standing rules this pass established.

**Design tokens** (`styles/_tokens.scss`, `styles.scss`, `styles/
_material-theme.scss`, `index.html`): the M3 neutral palette (already
generated from the #1E56A0 seed, hue-correct, just never exposed) is
now surfaced as a real `$color-neutral-{10..99}` step scale; genuinely
new `success`/`warning` roles were hand-authored (M3 has no such system
role — confirmed by reading `@angular/material`'s actual `define-theme()`
source, not assumed) and contrast-checked against known-accessible
references; typography moved from Roboto to Inter, applied through
`mat.theme()` itself so Material's own components and hand-authored
markup share one face, not two.

**Shell chrome** (Header/Sidebar/Footer/Breadcrumbs, both layouts):
removed `mat-toolbar`'s `color="primary"` — dead markup, confirmed via
the installed component's own type declaration that `color` has zero
effect under an M3 theme; the toolbar was always rendering M3's default
`surface`/`on-surface`. Real, previously-invisible bug fixed: `sidebar.
component.html` had toggled a `.active-nav-item` class via
`routerLinkActive` since Feature 2 with **no matching CSS rule ever
existing** — there was no way to tell which page you were on. Fixed
with a real rule plus `[attr.aria-current]="rla.isActive ? 'page' :
null"` so the state isn't color-only (WCAG 1.4.1). A second real,
compounding bug in the same area: `--mat-sys-surface` and `--mat-sys-
background` are the *identical* compiled hex in this theme, so Shell's
header/sidebar/content-canvas all rendered one indistinguishable tone;
fixed using M3's real surface-container ladder (chrome at `surface`,
canvas at `surface-container`, default `mat-card`'s `raised` appearance
already at `surface-container-low` in between) rather than an invented
gray — and `mat-sidenav`'s default rounded `corner-large` shape was
flattened to 0, since it was clipping a rounded corner that let the
canvas's different tone bleed through as a diagonal artifact where the
two met, caught from a live screenshot and root-caused against
`sidenav/_m3-sidenav.scss`, not guessed at visually.

**The single most-repeated bug this pass**: component-scoped SCSS
referencing a Tailwind `@theme` custom property via `var(--color-*)`/
`var(--radius-*)` silently lost the property in production — confirmed
by inspecting compiled output, not assumed. Tailwind only retains an
`@theme` token in the compiled global stylesheet if some utility class
using it is scanned from that *same* stylesheet; component styles live
in a separately bundled JS chunk the minifier can't see into. This broke
the sidebar's active-item highlight, the sidebar/header/breadcrumb
borders, and the footer color — all silently, all at once — until every
affected component-scoped stylesheet was switched to `@use '.../styles/
tokens'` + `#{tokens.$color-x}` Sass-time interpolation instead of a
runtime `var()` lookup. `--mat-sys-*` tokens (Material's own) are
unaffected and remain safe to reference directly.

**Breadcrumbs**: `EMPLOYEES_ROUTES`' 4 routes (`''`, `'new'`, `':id'`,
`':id/edit'`) are flat siblings, never nested under each other, so
`/employees/new` had no "Employees" ancestor in the route tree at all
for `BreadcrumbsComponent`'s walk to find — not a rendering bug, a
route-data placement bug. Fixed by moving the `breadcrumb: 'Employees'`
data from the inner list route to the outer `path: 'employees'`
loadChildren wrapper in `app.routes.ts`, the one real ancestor all four
share.

**Auth pages** (Login/Register): the card's vertical centering depended
on a `min-h-full` (percentage-height) chain across three nested
components (`PublicLayoutComponent` → its content wrapper → the page's
own root) - replaced with pure flex-grow (`flex-1` at every level)
end to end, which doesn't depend on any ancestor's height resolving as
"definite." Added breathing room between the card title and the first
field (`mat-card-header { margin-bottom: 12px }` — purely additive, not
reverse-engineered against Material's own internal padding), and
`font-weight: 500` on the "Register"/"Sign in" inline links.

**Employee form**: fields regrouped into a responsive 2-column grid
(`grid sm:grid-cols-2`, card widened to `max-w-2xl`), submit buttons
moved to a right-aligned `justify-end` row with Cancel before the
primary action — matching `ConfirmDialogComponent`'s own established
`align="end"` button order, not a new convention. Account/Employee
Detail/Employee Form cards all gained `mx-auto` for horizontal centering
(Dashboard's profile card deliberately excluded — it sits above a
full-width card grid as one composition, and centering just the top
card would look disjointed against the grid below it).

**Employees list**: a delete action was added to `EmployeeTableComponent`
via a `deleteRequested` output — the table stays presentational,
`EmployeeListPageComponent` (already the owner of all list state) opens
`ConfirmDialogComponent` and calls `EmployeeStore.deleteEmployee`, then
tracks in-flight ids the same `Set<string>` way `deletingDocumentIds`
already does for document deletes. The list's own error banner (still
the old unstyled `<p>` from before the edge-case pass) was standardized
to the same `bg-warn` pattern while in the area.

**Documents dialog**: the upload dropzone and the first document row
had zero visible gap despite `gap-3` on their flex parent — root cause
was `<mat-dialog-content>`'s plain Tailwind `.flex` utility class losing
a cascade-order fight against Material's own structural display rule for
the element. Fixed with a scoped element-type selector
(`mat-dialog-content { display: flex; ... }` in the component's own
SCSS), one specificity level above a bare class, so it wins
unconditionally rather than depending on stylesheet concatenation order.

**Toasts**: `NotificationService` gained `showSuccess`/`showWarning`
alongside the pre-existing `showError` (which was the *only* method it
had — there was no success/warning feedback channel anywhere in the
app). Wired into `EmployeeStore` (create/update/delete/document
upload/document delete), `AccountStore` (profile picture upload/
remove, right next to the existing `LiveAnnouncer` call), and
`RegisterPageComponent` (account creation). Login deliberately excluded
(instant redirect, high-frequency action — a toast would be noise, not
signal). `AccountService`'s two profile-picture calls had their
`SKIP_GLOBAL_ERROR_NOTIFICATION` context removed so their errors now
also toast, in addition to the existing inline message — Employees'
mutations were already toasting errors automatically via
`errorInterceptor` (it was never suppressed there), which is likely why
only the *missing success* half of this was actually visible before now.
Login/Register's own inline-only error convention (explicitly documented
since Feature 2) was deliberately left untouched — a toast next to an
already-visible inline banner on a frequent, multi-field auth form would
be redundant, unlike the single-action mutations above.

**Tooltips**: added to every icon-only control app-wide (header's menu
toggle and account menu, the Employees table's view/edit/delete row
actions, the documents dialog's delete button, Login/Register's
password visibility toggle) — deliberately not added to controls that
already show a visible text label next to their icon (Edit/Delete/
Documents buttons on the detail page, etc.), where a tooltip would just
repeat what's already on screen.

`ng build`/`ng lint`/`ng test` clean throughout every slice; every fix
was verified against the user's own live screenshots, not assumed
correct from the diff alone. See
`docs/frontend-architecture-blueprint.md`'s §13/§14 amendments for the
standing rules recorded from this pass.)_

_(Design System — Phase 1 (Foundation) — 2026-07-26. Not a numbered
feature; follows directly from the UI/UX redesign pass above. A
complete screen-by-screen UI/UX audit (Landing through Employees,
shared components, feedback patterns) plus a 4-phase polish roadmap was
presented and approved, then expanded at the user's explicit request
into eight design-system foundations (typography, elevation/surface,
component variants, motion, iconography, page layout, data display,
accessibility) with component API guidelines, a dedicated design-system
document, extensibility rules, and component acceptance criteria — all
before any code changed. This entry is Phase 1 only: the system itself,
built with **zero screens consuming it yet** (Phase 2, a separate future
approval, wires it into Landing/Dashboard/Users/Employees/Account). See
`docs/design-system.md` for the full system and
`docs/frontend-architecture-blueprint.md`'s v10 revision note for how
this is scoped against §9's premature-abstraction principle.

**Tokens** (`styles/_tokens.scss`): added a typography scale (8 named
roles — display/h1/h2/h3/body/caption/label/overline — restricted to
font-weights 400/600/700, exactly the Inter static weights `index.html`
now loads after adding 700 to the Google Fonts request), motion tokens
(`$motion-duration-*`, `$motion-easing-standard`) plus a
`motion-safe()` Sass mixin wrapping every transition in a
`prefers-reduced-motion` guard, and an icon-size scale
(`$icon-size-sm/md/lg`, 20/24/44px). All Sass variables, consumed only
by real authored CSS classes (never `var()` from component-scoped
SCSS) — the same tree-shaking-safe convention the redesign pass
established for color tokens applies identically here.

**New global partials**, all `@use`d into `styles.scss`'s composition
root: `styles/_typography.scss` (`.ds-display` … `.ds-overline`),
`styles/_surfaces.scss` (`.surface-card` / `.surface-card-interactive` —
the border-means-static/shadow-means-interactive rule, built from the
`elevation-1/3` tokens that already existed but were unused), and
`styles/_icon-sizing.scss` (`.icon-sm/md/lg`). Verified by grepping the
actual compiled `dist/` stylesheet for every new class, not assumed —
all present.

**Six new shared components** (`shared/components/`), each documented
in `docs/design-system.md` §7 with its full Inputs/Outputs/Content-
projection/Variant-strategy/Accessibility/Example contract:
`PageHeaderComponent`, `SectionHeaderComponent`, `InlineBannerComponent`
(`tone: 'error' | 'warning'`, optional Retry output — no `success` tone,
since every success notification is a toast, never a banner),
`EmptyStateComponent` (deferred three times across Features 3/5/6 per
the blueprint's premature-abstraction principle, built now that Phase 2
gives it real, imminent consumers), `LoadingSkeletonComponent`
(`text`/`row`/`card` variants, shimmer respects `prefers-reduced-motion`
by disabling the animation and falling back to a flat tint), and
`AvatarComponent` (image → initials → icon fallback chain, `sm`/`md`
sizes). All presentational — no `HttpClient`/Store/feature-model
imports, matching `FileUploadComponent`/`DataTableComponent`'s existing
precedent.

`ng build`/`ng lint` both clean. Nothing wired into any feature screen
yet — that is explicitly Phase 2's scope, not this one's.)_

_(Session-expiry messaging — token edge-case pass — 2026-07-26. Not a
numbered feature; explicitly prioritized ahead of Design System Phase 2
at the user's request, to work through every "the refresh token turned
out to be invalid" edge case with a clear message instead of a raw
backend string. Paired with a matching backend fix (see
`backend/CLAUDE.md`'s entry of the same date) that closes a real,
previously-unfixed gap: a deleted user's still-unexpired access token
had no existence check anywhere in `authMiddleware`.

**The core gap**: `refreshInterceptor`'s silent-refresh failure path
cleared the session and redirected to `/login`, but then rethrew the
raw `refreshError` — which `errorInterceptor` (downstream in the
response chain) surfaced as a generic toast showing the backend's literal
message (`"Invalid refresh token"`, `"Refresh token missing"`), not
something a user could act on. Separately, `authGuard`/
`redirectIfAuthenticatedGuard`'s own silent-restore failure (the hard-
reload/deep-link case, which no interceptor ever sees) showed **no**
message at all — a user whose refresh cookie died while the browser was
closed just silently landed back on `/login` with no explanation.

**Fix, centralized in `SessionStore`** rather than duplicated per call
site: a persisted, non-sensitive `hadPriorSession()` flag (a bare
localStorage boolean, never the token itself — blueprint §7's "never
persist the token" rule is untouched) set on every successful
`setSession()`, letting both guards distinguish "a returning visitor
whose session genuinely expired" (show the message) from "a brand-new
anonymous visitor on a deep link" (say nothing — showing an "expired"
message here would be false, and this is by far the more common case).
`forgetPriorSession()` clears it — called after that message is shown
once (so it isn't repeated on every subsequent guarded navigation
attempt in the same dead browser tab) and, separately, from
`AuthService.logout()`'s `finalize` (an explicit logout is never
"expired," and must not be mislabeled as one on the next guarded
navigation).

A second, independent signal, `sessionExpired` +
`markSessionExpired()`, solves a real concurrency problem: several
requests can 401 together (e.g. a page that fires 3 parallel calls right
as the access token dies), all sharing `refreshInterceptor`'s single
in-flight refresh (`shareReplay(1)`, pre-existing) — without dedup,
each of the N failing requests would independently reach
`errorInterceptor` and flash its own duplicate raw-message toast
alongside the one friendly message. `markSessionExpired()` is a
first-caller-wins guard (only the request that actually triggers the
shared refresh shows the toast/navigates); `errorInterceptor` checks the
same flag to skip its generic toast for every other request failing
as a side effect of the identical expiry event. The flag resets on the
next successful `setSession()`, so a later, genuinely new expiry can
still trigger the flow again.

`refreshInterceptor`'s redirect now also carries `returnUrl: router.url`
(matching `authGuard`'s existing convention) so a mid-session expiry
returns the user to what they were doing after they log back in, not
just the dashboard.

Verified via `ng build`/`ng lint` (both clean) and a live backend-side
replay of the exact failure this messaging exists for (deleted user's
still-unexpired token, deposited in `backend/CLAUDE.md`'s matching
entry) — confirming the 401 this pass's frontend code reacts to is
real, not hypothetical. The toast/redirect behavior itself was **not**
independently verified in a running browser this pass (no browser-
automation tool available in this environment) — worth a quick manual
check (multi-tab logout → attempt an action in the stale tab → confirm
one clear "session expired" toast, no duplicate raw-message toast) next
time the app is run interactively.)_

_(Design System — Phase 2 (Application) — 2026-07-26. Rolls out every
Phase 1 primitive (`docs/design-system.md` §7) across the 8 screens
Phase 1 deliberately shipped with zero consumers: Landing, Dashboard,
Account, Users, and Employees (List, Detail, Form, Documents dialog).
Full Theory → Architecture → Action Plan sequence run before any code,
per the standing 8-phase workflow; scope was explicitly presentation-
only throughout - no Store/Service/DTO/routing/guard/interceptor change
anywhere in the whole rollout.

**Git workflow changed mid-rollout, at the user's explicit request**: a
separate branch per screen (`design-system/<screen>`), cut from `main`
(which was already fast-forward-identical to `frontend` at the time),
each tested live in the browser and approved before its own `--ff-only`
merge to `main` - a deliberate, one-off departure from this file's
single-long-lived-`frontend`-branch convention, scoped to this rollout.

**Two real structural decisions, not just class swaps**, both flagged
and approved before implementation:
1. Every static `<mat-card>` (Dashboard's profile card, Account,
   Employee Detail, Employee Form) was replaced with a plain
   `<div class="surface-card">` - Material's default `raised` `mat-card`
   appearance renders a shadow unconditionally, which was silently
   violating the border-means-static/shadow-means-interactive rule
   (`docs/design-system.md` §4) on every one of these purely static
   cards. Dashboard's clickable nav tiles became `.surface-card-interactive`
   real `<a [routerLink]>` elements instead (kept native/keyboard-focusable
   by construction, not an ARIA workaround).
2. `EmployeeToolbarComponent` lost its permission-gated "New Employee"
   button entirely - relocated into `EmployeeListPageComponent`'s new
   `PageHeaderComponent` `[pageHeaderActions]` slot, the same place every
   other screen's page-level action now lives. The toolbar is purely the
   filter form now, dropping its `SessionStore`/`MatButtonModule`/
   `RouterLink` dependencies.

**A third, smaller consistency decision**: Users' empty state moved from
inside `UserTableComponent`'s `*matNoDataRow` (a raw `<td>` message) to
the page level in `UserListPageComponent`, hiding the table and showing
`EmptyStateComponent` instead - matching Employees' identical pattern
(both list screens now distinguish "no data at all" from "no matches for
the current search/filters" with the same shared component, not two
different empty-state conventions for near-identical screens).

**No design-system component API changes were needed anywhere** - every
screen's real markup, checked against all six components' actual
`.ts` inputs/outputs/content-projection slots before writing any
template code, mapped cleanly onto an existing contract. Confirms
Phase 1's six components were sized correctly on the first attempt.

**One real bug found via live verification, not code review**: after
replacing Employee Detail's `<mat-card>` with `.surface-card`, "Back to
list" wrapped onto a second line - `.surface-card`'s `p-6` padding is a
few pixels wider than `mat-card`'s old internal default, just enough to
tip that one flex row over. Fixed with `whitespace-nowrap` on the link,
caught by the user's own screenshot, not anticipated in the Action Plan.

**Closing Design Consistency Audit** (`docs/design-system.md` §11): a
full grep across every migrated screen for `mat-card`, ad-hoc Tailwind
text-size classes, `bg-warn`/`role="alert"` hand-rolled banners, and bare
empty-state text found exactly one straggler - the Documents dialog's
"Uploading…" status span had kept a leftover `text-sm` class while every
sibling inline-spinner status text elsewhere (including its own
"Loading…") is unstyled; removed for consistency. Login/Register still
use `mat-card` and their own established inline-only error convention -
confirmed as **intentionally out of scope** (never part of the approved
migration order, and Login/Register's inline-error pattern was already a
deliberate, documented choice since Feature 2/the redesign pass), not a
miss.

`ng build`/`ng lint`/`ng test` clean after every one of the 9 commits
(8 screens + the audit fix). Every screen was manually verified live in
the browser by the user (responsive, keyboard, token-discipline per the
dark-mode-deferred decision below) before its commit was merged - the
one place in this project's history where that per-screen verification
loop is fully documented turn-by-turn rather than summarized after the
fact. See `docs/design-system.md`'s updated status line for the closing
state.

**Dark-mode scope was clarified before work began, not assumed**: since
`_material-theme.scss` hardcodes `color-scheme: light` with no dark
palette anywhere yet (dark mode is `docs/design-system.md` §9's own
separate future "roadmap Phase 4"), "verify dark-mode compatibility"
for this rollout was scoped to a token-discipline check only - confirming
every color/spacing value traces to a Sass token or `--mat-sys-*` role,
never a hardcoded hex/px - rather than an actual visual dark-theme
toggle, which doesn't exist to check against yet.)_
