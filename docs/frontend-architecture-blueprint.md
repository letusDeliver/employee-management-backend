# Frontend Architecture Blueprint

**Status:** Approved and in active use. The backend prerequisite
(§7.1/§19) shipped and was verified live (see `backend/CLAUDE.md`'s
"Permission Resolution Enhancement" entry). Feature 0 (Angular Project
Initialization), Feature 1 (Angular Material, Tailwind CSS, theming,
design tokens), Feature 2 (Authentication), Feature 3 (real Landing Page
content, Dashboard quick-navigation cards + widgets region), and Feature
4 (Account — self-service profile view + profile picture management)
are all complete — see `frontend/CLAUDE.md`'s Progress Log. Employees
and Users are next, following the same 8-phase workflow
(`frontend/CLAUDE.md`).

This blueprint is the frontend's equivalent of the backend's
`CLAUDE.md` + `planning/feature-NN-*.md` combination: a durable
constitution the frontend will be built against, feature by feature,
under the same discipline the backend already used (theory before code,
one feature per session, explicit approval between features, README/
handbook kept in sync, one commit per feature).

**Revision history:**
- v1 — initial blueprint (16 sections).
- v2 (this revision) — six required changes applied: (1) permission
  resolution is now a proposed **backend** enhancement, not a
  client-side mirror; (2) Typed Reactive Forms explicitly confirmed,
  Signal Forms explicitly deferred; (3) added a public Landing Page and
  reshaped the Dashboard into a navigation hub, with a documented
  navigation flow; (4) added a dedicated Component Naming Convention
  section; (5) expanded the Feature Lifecycle and Definition of Done
  into one detailed, symmetric checklist; (6) added an explicit
  Store-is-not-NgRx clarification.
- v3 — the §7.1/§19 backend prerequisite has been built
  and verified live: `POST /auth/register`, `POST /auth/login`, and
  `GET /auth/me` now return a resolved `user.permissions: string[]`.
  §0, §7.1, and §19 updated from "proposed" to "shipped."
- v4 (this revision) — Feature 0 (Angular Project Initialization) is
  complete; the environment-file naming in §2's folder tree corrected
  from the original illustrative `environment.ts`/`environment.production.ts`
  to Angular's actual current `ng generate environments` convention:
  `environment.ts` (used as-is for production) +
  `environment.development.ts` (swapped in for dev builds via a
  `fileReplacements` entry). This is a naming correction only — no
  change to the Core Layer's config-token architecture (§12), which
  still holds: exactly one file (`core/config/api-base-url.token.ts`)
  reads `environment.*` directly, everything else injects the
  `API_BASE_URL` token. See `frontend/CLAUDE.md`'s Progress Log for
  everything else Feature 0 verified live.
- v5 (this revision) — architectural decision made during Feature 2
  (Authentication) planning, recorded here so it binds every later
  feature, not just Feature 2's own handbook chapter: **`ShellComponent`
  is structurally complete as of Feature 2** (Header, Sidebar,
  Breadcrumbs, Footer, router-outlet — all real, final components, not
  placeholders) and **`DashboardPageComponent` is a real component from
  Feature 2 onward**, not a stub to be replaced. See §3 and §4.3 for the
  specifics this amends. The governing rule for every feature from here
  on: **extend this architecture additively (new `nav-config.ts`
  entries, new template sections, new menu items) — never restructure
  the Shell, the Dashboard route/guard, or `SessionStore`'s shape to
  accommodate a later feature.** If a future feature ever seems to need
  a structural change here, that itself is a signal to stop and get
  explicit approval before proceeding, exactly like any other
  architectural deviation (see `frontend/CLAUDE.md`'s Non-Negotiable
  Rules).
- v6 (this revision) — Feature 3 delivered §4.2's real Landing Page
  content and §4.3's Dashboard quick-navigation cards + widgets region,
  exactly as revision v5 scoped it: no restructuring of `ShellComponent`,
  `DashboardPageComponent`, or `SessionStore`. `NavItem` (§3's
  `nav-config.ts`) gained one additive field, `description: string`, so
  the Dashboard's cards can show the one-line-per-module text §4.3
  always called for — safe to add with zero migration since `NAV_CONFIG`
  was still `[]` at the time. Two real, pre-existing bugs (latent since
  Feature 1/2, surfaced only by this feature's own browser testing) were
  found and fixed; see §7 and §13 for where each is now recorded, and
  `frontend/CLAUDE.md`'s Progress Log for the full account.
- v7 (this revision) — Feature 4 (Account) delivered self-service
  profile viewing (name/email/roles/member-since, read directly from
  `SessionStore` — no new fetch) and profile-picture upload/delete
  against the two real `/users/me/profile-picture` endpoints. Real
  backend contract finding: **no endpoint exists to update name/email**
  (verified against `user.routes.js`) — Account is deliberately
  read-only for those fields, not an oversight. `SessionStore` gained
  `updateProfileImage(url, publicId)` (§7/§12) specifically because both
  profile-picture endpoints return a `user` shape without `permissions`
  — merging the whole response would have silently wiped it from the
  live session. `shared/components/file-upload/` (§11) was built for
  real, not deferred like Feature 3's `EmptyStateComponent` — it already
  has two justified consumers (this feature, and Employee documents
  later). This is also the **first feature to add a real `NAV_CONFIG`
  entry** (§3/§4.3), the first live proof that Feature 3's Sidebar +
  Dashboard quick-nav mechanism actually works end-to-end.

Every claim about backend behavior below was verified against the
**actual current source**, not assumed or remembered:
`backend/prisma/schema.prisma`, `backend/prisma/seed.js`,
`backend/src/app.js`, `backend/src/middlewares/*`,
`backend/src/modules/auth/*`, `backend/src/modules/employees/*`,
`backend/src/modules/users/*`, `backend/src/utils/jwt.js`. Where the
backend has a real, undecorated limitation, this document says so
explicitly rather than designing around an idealized version — the same
honesty standard `backend/CLAUDE.md` holds the backend to.

---

## 0. Ground Truth This Blueprint Is Built On

A few concrete backend facts drive several non-obvious decisions below.
Stated once here so the rest of the document can just reference them:

- **No uniform response envelope.** `POST /auth/login` returns
  `{ message, user, accessToken }`; `GET /employees` returns
  `{ employees, pagination }`; `GET /employees/:id` returns
  `{ employee }`; `DELETE /employees/:id` returns `{ message }` only.
  There is no generic `{ data: T }` wrapper anywhere. A generic
  `ApiResponse<T>` abstraction on the frontend would be actively
  misleading — response types must be hand-declared per endpoint.
- **Errors are `{ status: 'error', message: string }`** (plus `stack` in
  non-production), where `message` for validation failures is **one
  comma-joined string** (`"email: Invalid email, password: Password
  must be at least 8 characters long"`), not a field-keyed structure
  (`backend/src/middlewares/validate.middleware.js`). The frontend
  cannot reliably bind server validation errors to individual form
  controls — this is a real, current limitation, not a frontend
  oversight. See §9 (Forms) for how this shapes the validation strategy.
- **Access token in the JSON body, refresh token in an httpOnly
  cookie.** `accessToken` is returned in the response body (15 minutes,
  `JWT_ACCESS_EXPIRES_IN`); the refresh token is set as an httpOnly,
  `SameSite=Lax` cookie named `refreshToken`, scoped to path
  `/api/v1/auth`, `Secure` only in production, 7-day lifetime
  (`JWT_REFRESH_EXPIRES_IN`), rotated on every use. JavaScript can never
  read the refresh token — by design.
- **The JWT payload still carries role *names* only**
  (`roles: ['ADMIN']`) — that part is unchanged. Permission resolution
  (`employee:read:any`, etc.) still happens exclusively server-side in
  `permission.middleware.js` via `permissionCache`, reading
  `prisma/seed.js`'s `ROLE_PERMISSIONS` map. **As of the shipped
  permission-resolution enhancement (§7.1), the resolved result of that
  server-side lookup is now returned to the client**: `POST
  /auth/register`, `POST /auth/login`, and `GET /auth/me` all return a
  `user.permissions: string[]` array — the frontend does not, and will
  not, maintain its own copy of the role→permission map. `GET /users`
  and the profile-picture endpoints remain `roles`-only, deliberately.
- **`Employee.salary` is a Prisma `Decimal`, which serializes as a JSON
  *string*** on the way out (`"85000"`) but is accepted as a **number**
  on the way in (`z.number().positive()`). Same field, different type,
  different direction — the canonical reason this app needs a real
  DTO ↔ domain mapping layer instead of using wire shapes directly.
- **CORS is locked to a single origin with `credentials: true`**
  (`CORS_ORIGIN`, defaulting to `http://localhost:4200` — Angular CLI's
  own default `ng serve` port, already anticipated). Every request that
  needs the refresh cookie to flow must be sent with
  `withCredentials: true`.
- **Two-layer authorization exists today**: `GET /employees/:id` and
  `GET /employees/:id/documents` accept **either**
  `employee:read:any` **or** `employee:read:own` at the route, and the
  service layer alone decides ownership once the record is loaded. A
  route guard can only ever gate on "has some access to try," never
  fully replicate the ownership check — the real decision happens after
  the API call, not before it. Client-side authorization is UX, not
  security, exactly as it is on the backend.
- **No rate limiting exists on the API today** (a known, previously
  disclosed backend gap). Nothing in this blueprint assumes protection
  that isn't there.
- **There is no dashboard/analytics/statistics endpoint of any kind**
  today. The Dashboard designed in §4 is a navigation hub only — no
  fabricated metrics, no mock widgets.

---

## 1. Overall Frontend Architecture

**Hybrid: layered at the top, feature-first underneath** — this is the
direct Angular translation of the backend's own
`Route → Controller → Service → Repository` layering:

| Backend layer | Frontend equivalent | Responsibility |
|---|---|---|
| Route | Angular Route + Guard | Entry point, access control |
| Controller (thin) | Smart Component | Parse route/user input, call the store, shape what's rendered |
| Service (business logic) | Store (signals — see §6) | Orchestration, derived state, mutation sequencing |
| Repository (DB access) | `*.service.ts` (HttpClient) | The only place that talks to the network |

**Dependency direction is one-way**, enforced the same way the backend
enforces "services never call Prisma directly": `features/* → shared/*
→ core/*`, never the reverse, and never `feature A → feature B`
directly. Cross-feature communication goes through `core/` services
(e.g., `SessionStore`) or the router — never a direct import between
sibling feature folders. `core/` has zero knowledge that any feature
exists; `shared/` has zero knowledge of any feature's business meaning.

- **`core/`** — singleton, app-wide, instantiated once (`providedIn:
  'root'`): session/auth, HTTP interceptors, guards, global error
  handling, logging, environment config. Analogous to the backend's
  `config/`, `middlewares/`, `errors/`.
- **`shared/`** — stateless, reusable, framework-level building blocks
  with no domain knowledge: generic components (data table, dialogs),
  directives, pipes, validators, utility functions. Analogous to the
  backend's `utils/`.
- **`layout/`** — the application shell's visual chrome (public chrome
  vs. authenticated chrome — see §3). Has no business logic of its own.
- **`features/`** — one folder per domain module (`landing`, `auth`,
  `dashboard`, `employees`, `users`, `account`), lazy-loaded, each
  internally structured the same way (see §2). Analogous to the
  backend's `src/modules/`.

---

## 2. Folder Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── app.config.ts              # providers: router, HttpClient+interceptors, animations
│   │   ├── app.routes.ts              # root route table: public layout vs shell layout
│   │   ├── app.component.ts           # bootstrap shell only — no logic
│   │   │
│   │   ├── core/                      # singleton, app-wide — mirrors backend's config//middlewares//errors/
│   │   │   ├── auth/
│   │   │   │   ├── session.store.ts          # current user + accessToken + permissions signals
│   │   │   │   ├── auth.service.ts           # HttpClient wrapper for the 5 auth endpoints
│   │   │   │   ├── auth.guard.ts             # CanActivateFn — session exists / silent refresh
│   │   │   │   ├── redirect-if-authenticated.guard.ts  # inverse guard for landing/login/register
│   │   │   │   └── permission.guard.ts       # CanActivateFn — route data.permissions, OR semantics
│   │   │   │                                  # (no role-permissions map file here — see §7/§19:
│   │   │   │                                  #  permissions come from the backend response, not
│   │   │   │                                  #  a frontend-computed mirror)
│   │   │   ├── http/
│   │   │   │   ├── credentials.interceptor.ts # clones every request with withCredentials: true
│   │   │   │   ├── auth.interceptor.ts       # attaches Authorization: Bearer <token>
│   │   │   │   ├── refresh.interceptor.ts    # single-flight 401 → refresh → retry
│   │   │   │   └── error.interceptor.ts      # HttpErrorResponse → ApiError, global notifications
│   │   │   ├── error-handling/
│   │   │   │   └── global-error-handler.ts   # non-HTTP unexpected errors (ErrorHandler override)
│   │   │   ├── logging/
│   │   │   │   └── logger.service.ts         # console-backed today, one seam for real logging later
│   │   │   └── config/
│   │   │       └── app-config.ts             # InjectionToken sourced from environment.ts
│   │   │
│   │   ├── shared/                    # stateless, reusable — mirrors backend's utils/
│   │   │   ├── components/
│   │   │   │   ├── data-table/               # DataTableComponent — generic MatTable wrapper
│   │   │   │   ├── page-header/              # PageHeaderComponent
│   │   │   │   ├── confirm-dialog/           # ConfirmDialogComponent
│   │   │   │   ├── empty-state/              # EmptyStateComponent
│   │   │   │   ├── loading-skeleton/         # LoadingSkeletonComponent
│   │   │   │   └── file-upload/              # FileUploadComponent
│   │   │   ├── directives/
│   │   │   │   └── has-permission.directive.ts  # *appHasPermission / *appHasAnyPermission
│   │   │   ├── pipes/
│   │   │   │   ├── file-size.pipe.ts
│   │   │   │   └── role-label.pipe.ts
│   │   │   ├── validators/
│   │   │   │   ├── not-future-date.validator.ts # mirrors backend's dateOfJoining rule
│   │   │   │   └── positive-number.validator.ts # mirrors backend's salary rule
│   │   │   ├── models/
│   │   │   │   ├── paginated.model.ts        # generic { page, limit, total, totalPages }
│   │   │   │   └── api-error.model.ts        # { status: 'error', message, stack? }
│   │   │   └── utils/
│   │   │       ├── date.util.ts
│   │   │       └── http-params.util.ts       # typed filter object → HttpParams
│   │   │
│   │   ├── layout/                    # visual chrome — see §3
│   │   │   ├── public-layout/                # PublicLayoutComponent — landing/login/register chrome
│   │   │   │   ├── header/                   # PublicHeaderComponent (brand + Login/Register links)
│   │   │   │   └── footer/                   # PublicFooterComponent
│   │   │   └── shell/                        # ShellComponent — authenticated chrome
│   │   │       ├── header/                   # HeaderComponent
│   │   │       ├── sidebar/                  # SidebarComponent (+ nav-config.ts)
│   │   │       ├── breadcrumbs/              # BreadcrumbsComponent
│   │   │       └── footer/                   # FooterComponent
│   │   │
│   │   └── features/                  # one folder per domain module — mirrors backend's src/modules/
│   │       ├── landing/                      # LandingPageComponent — public, unauthenticated
│   │       ├── auth/                         # LoginPageComponent, RegisterPageComponent
│   │       ├── dashboard/                    # DashboardPageComponent — navigation hub, see §4
│   │       │   └── widgets/                  # reserved extension point, empty today (.gitkeep) — see §4
│   │       ├── account/                      # self-service: my profile, my profile picture
│   │       ├── users/                        # admin-only user list (user:list)
│   │       └── employees/
│   │           ├── employees.routes.ts
│   │           ├── data-access/
│   │           │   ├── employee.dto.ts        # exact wire shape — salary: string, dates: string
│   │           │   ├── employee.model.ts      # domain shape — salary: number, dates: Date
│   │           │   ├── employee.mapper.ts     # dto ⇄ domain, the one place the asymmetry lives
│   │           │   ├── employee.service.ts    # HttpClient only, one method per endpoint
│   │           │   └── employee.store.ts      # signals: list, selected, loading, error, pagination
│   │           ├── employee-list/             # EmployeeListPageComponent, EmployeeTableComponent, EmployeeToolbarComponent
│   │           ├── employee-detail/           # EmployeeDetailPageComponent
│   │           ├── employee-form/             # EmployeeFormComponent (create + edit)
│   │           └── employee-documents/        # EmployeeDocumentsDialogComponent
│   │
│   ├── environments/
│   │   ├── environment.ts             # used as-is for production (Angular's current `ng generate environments` convention — see v4 revision note)
│   │   └── environment.development.ts # swapped in for dev builds via a fileReplacements entry
│   ├── styles/
│   │   ├── _tokens.scss                # single source of truth: color roles, spacing, radii
│   │   ├── _material-theme.scss        # mat.theme() built from _tokens
│   │   └── styles.scss                 # Tailwind entry + global resets
│   └── assets/
│
├── frontend/CLAUDE.md                  # frontend engineering constitution (created with ng new)
├── frontend/README.md                  # created once Angular is scaffolded
├── angular.json / tsconfig*.json / package.json / tailwind.config.js
```

**Why every top folder exists:**

| Folder | Exists because |
|---|---|
| `core/` | App-wide singletons that every feature depends on but no feature owns — session, HTTP plumbing. Importing `core/` into `core/` (a feature reaching back into another feature's internals) is the smell this boundary prevents. Note `core/auth/` deliberately has **no** permission-mapping file — see §7/§19. |
| `shared/` | Reuse without domain coupling. A `DataTableComponent` that knows nothing about "Employee" can be reused by `users/`, future `audit-logs/`, etc. |
| `layout/` | Visual chrome is not a "feature" — it has no data-access layer, no store, just composition. Split into `public-layout/` and `shell/` because the two audiences (anonymous visitor vs. authenticated user) need genuinely different chrome, not one layout awkwardly toggling itself. |
| `features/*` | Feature-first, not type-first (no app-wide `components/`, `services/` junk drawers) — mirrors the backend's `modules/auth/`, `modules/employees/` decision explicitly, for the same reason: everything about one feature is discoverable in one folder. |
| `features/landing/` | The public entry point is architecturally a feature like any other — it lazy-loads under the public layout, has no data-access layer (nothing to fetch), and will grow its own content over time without touching `core/`/`shared/`. |
| `features/dashboard/widgets/` | An empty, reserved folder today (matching the backend's own established `.gitkeep`-for-scaffolded-but-unused-folders convention from Feature 1) — the concrete extension point future real widgets slot into without any restructuring. See §4. |
| `features/employees/data-access/` | Isolates the DTO↔domain mapping (the salary/date asymmetry) behind one small boundary per feature, the same way the backend isolated the Decimal/Date-to-JSON problem behind one `normalizeForAudit()` helper instead of scattering the fact through every controller. |

---

## 3. Application Shell

Two layouts, selected by route, not two separate apps:

- **`PublicLayoutComponent`** — the unauthenticated chrome: a minimal
  header (brand/logo + "Login" / "Register" links) and a minimal
  footer. Hosts the Landing Page, Login, and Register — **no**
  sidebar, no breadcrumbs, no user menu, since there is no session yet.
  The Landing Page and the Login/Register forms are different *content*
  under this *same* chrome — the layout doesn't need to know which one
  it's currently showing.
- **`ShellComponent`** — the authenticated frame:

```
┌─────────────────────────────────────────────────────┐
│ Header  (app name · current user menu · logout)     │
├───────────┬───────────────────────────────────────────┤
│           │ Breadcrumbs                                │
│ Sidebar   ├───────────────────────────────────────────┤
│ (nav,     │ Toolbar (contextual page actions,          │
│ permission-│  e.g. "+ New Employee")                   │
│ filtered) ├───────────────────────────────────────────┤
│           │                                             │
│           │ Content (<router-outlet>)                  │
│           │                                             │
├───────────┴───────────────────────────────────────────┤
│ Footer (version/build info)                            │
└─────────────────────────────────────────────────────┘
```

- **Header**: `mat-toolbar`, fixed. App name, current user's name/avatar
  (from `SessionStore`) with a menu (Account, Logout).
- **Sidebar**: `mat-sidenav`. Nav items come from **one declarative
  config array** (`layout/shell/sidebar/nav-config.ts`), each entry
  carrying its route, icon, label, and required permission key(s) —
  filtered through `SessionStore.hasAnyPermission(...)` before
  rendering (§7). Adding a feature's nav entry means editing one
  object, never the template.
- **Toolbar**: page-local contextual actions (the "primary action"
  slot `PageHeaderComponent` exposes — e.g. "+ New Employee", gated by
  `employee:create`).
- **Breadcrumbs**: derived from the matched route tree's `data.breadcrumb`
  chain, not hand-maintained per page — a route that forgets to set
  `data.breadcrumb` simply omits itself, no separate bookkeeping.
- **Content**: the routed feature's own smart component.
- **Footer**: minimal — build/version info, nothing interactive.

**Architectural note (added in Feature 2, see revision v5):**
`ShellComponent` — Header, Sidebar, Breadcrumbs, Footer — is built as
final, structurally complete chrome in Feature 2, not a partial
placeholder. `SidebarComponent` renders `nav-config.ts` via `*ngFor`,
starting as an **empty array** and gaining one entry per feature as
Employees/Users/Account ship — the empty state is a data fact (no
entries yet), not an unfinished component. `HeaderComponent`'s user menu
ships with **Logout** in Feature 2; **Account** is added as a one-line
menu item once the Account feature exists. `BreadcrumbsComponent` is
fully generic from Feature 2 onward, driven by whatever routes set
`data.breadcrumb`. **The Toolbar described above is not part of
`ShellComponent`** — it is `PageHeaderComponent`'s primary-action slot
(§11), instantiated inside each feature's own page template, built
whenever the first feature that needs a primary action arrives. No
future feature should need to restructure the Shell itself — only add
to `nav-config.ts`, add a menu item, or set `data.breadcrumb` on its own
routes.

---

## 4. Application Flow, Landing Page & Dashboard

### 4.1 Navigation Flow

```
                Visitor
                   │
                   ▼
        Public Landing Page  ("/")  ── PublicLayout
                   │
                   ▼
           Register  /  Login
                   │
                   ▼
             Authentication
          (POST /auth/register or
             POST /auth/login)
                   │
                   ▼
               Dashboard  ("/dashboard")  ── ShellLayout
                   │
        ┌──────────┼──────────┬─────────────────┐
        ▼          ▼          ▼                 ▼
   Employees     Users    My Account      Future Modules
  (permission-  (user:list                 (reserved —
   gated)        only)                      no APIs today)
```

- **Unauthenticated visitor**: only the Landing Page, Login, and
  Register are reachable (`PublicLayoutComponent`). Any deep link to a
  protected route (e.g. sharing `/employees/:id`) redirects to
  `/login?returnUrl=/employees/:id` via `authGuard` — after a
  successful login, `AuthService` redirects to `returnUrl` if present,
  otherwise to `/dashboard`.
- **Already-authenticated visitor** hitting `/`, `/login`, or
  `/register` is bounced straight to `/dashboard` by
  `redirectIfAuthenticatedGuard` (the inverse of `authGuard`) — a
  returning logged-in user should never be shown the marketing page or
  a login form again.
- **After successful register/login**: always redirected to
  `/dashboard` (or `returnUrl`, above) — never back to the Landing Page.
- **From the Dashboard**: every other authenticated destination
  (`Employees`, `Users`, `My Account`, and any future module) is one
  click away via the quick-navigation cards described below, mirroring
  exactly what the Sidebar already offers — the Dashboard is a second,
  friendlier entry point into the same navigation the Sidebar provides,
  not a competing structure.

### 4.2 Landing Page (`features/landing/`)

Public, unauthenticated, served at `/` under `PublicLayoutComponent`.
Purely presentational — no data-access layer, nothing to fetch.
**Delivered in Feature 3** — the disposable Feature 2 stub was replaced
wholesale, exactly as its own header comment always said it would be.
Content:

- What the application is and its purpose.
- Key features/capabilities (a short, honest list mirroring what
  actually exists today — Employee records, role-based access, document
  management — not aspirational features).
- Why a visitor should use it.
- Clear calls to action: **Register** and **Login**, linking to
  `/register` and `/login`.

No backend call backs this page. It is a single `LandingPageComponent`
(`loadComponent`, not `loadChildren` — it has no children routes).

### 4.3 Dashboard (`features/dashboard/`)

Authenticated, served at `/dashboard` under `ShellLayoutComponent`,
and the default redirect target after login/register. **Explicitly not
an analytics surface** — the backend exposes no dashboard/statistics
endpoint, so nothing here fetches or fabricates numbers.

Content, all sourced from data the app already has (no new backend
calls beyond what `SessionStore` already holds from login/`/auth/me`):

- **Welcome message** — "Welcome back, {{ user.name }}" from
  `SessionStore`.
- **Logged-in user information** — name, email, roles (already in
  `SessionStore`), rendered as a small profile summary card.
- **Quick navigation cards** — one card each for Employees, Users, My
  Account, permission-filtered exactly like the Sidebar (reusing the
  same `nav-config.ts` entries as §3's sidebar, so the two never drift
  apart — the Dashboard is a *view* over the same nav config, not a
  second copy of it).
- **Short introduction to available modules** — one line per card
  describing what that module does.
- **A reserved widgets region** — `features/dashboard/widgets/` is an
  empty folder today, and the Dashboard template reserves a labeled
  layout region (`<section aria-label="More">`) for it, kept genuinely
  separate from the quick-navigation section above. When a real
  widget-worthy backend capability exists in the future (e.g. "my
  pending approvals," "recent audit activity"), it becomes a
  self-contained component dropped into that folder and registered in a
  small `dashboard-widgets.config.ts` array (the exact same "one config
  array, one place to register" pattern as the Sidebar's `nav-config.ts`
  and the future permission directive) — no restructuring of the
  Dashboard itself required. **Nothing is built in this region yet**; it
  renders empty until a real widget exists.

**Architectural note (added in Feature 2, see revision v5):**
`DashboardPageComponent` is built as a **real** component in Feature 2
(it is the app's post-login/register redirect target and needs to
exist for auth to be end-to-end testable), not a throwaway placeholder.
Feature 2 delivers the welcome message and profile summary card in
full — both need nothing but `SessionStore`, which Feature 2 builds
anyway.

**Delivered in Feature 3 (see revision v6):** the quick-navigation cards
and the reserved widgets region were added as template additions to
this same component — same file, same route, same guard, same redirect
logic, no restructuring. The cards are driven by a `computed()` over the
same `NAV_CONFIG` array the Sidebar reads (permission-filtered
identically), so the two never drift apart. Because `NAV_CONFIG` is
still `[]` (no feature has added an entry yet), the section currently
renders a one-line "More modules will appear here as they become
available" message instead of any cards — an honest reflection of
current app capability, not a bug. Building the shared `EmptyStateComponent`
(§11) was deliberately deferred rather than reached for here — this is
cosmetic filler text with no loading/error states behind it, and that
component's better-justified first real use is Employees' genuine
empty-list state.

---

## 5. Routing Strategy

```
/ (root)
├── "" (PublicLayout)                    → redirectIfAuthenticatedGuard on /, /login, /register
│   ├── /                  → features/landing  (loadComponent)
│   ├── /login              → features/auth  (loadComponent)
│   └── /register           → features/auth  (loadComponent)
│
└── "" (ShellLayout)                     → authGuard on the whole subtree
    ├── /dashboard          → features/dashboard (loadComponent) — default post-login redirect
    ├── /account            → features/account (loadChildren)
    ├── /users              → features/users (loadChildren, permissionGuard: user:list)
    └── /employees          → features/employees (loadChildren, permissionGuard: employee:read:any | employee:read:own)
        ├── /employees              (list)     — permissionGuard: employee:read:any
        ├── /employees/new          (create)   — permissionGuard: employee:create
        ├── /employees/:id          (detail)   — permissionGuard: employee:read:any | employee:read:own (§0 — ownership re-checked by the API itself)
        └── /employees/:id/edit     (edit)     — permissionGuard: employee:update:any
```

- **Layout routes**: both `PublicLayoutComponent` and `ShellComponent`
  are component-less parent routes (`path: ''`) whose children are the
  real feature routes — the standard Angular pattern, so each layout's
  guard is applied exactly once, not duplicated per feature.
- **Lazy loading**: every feature route uses `loadChildren` (or
  `loadComponent` for single-page features like `landing`, `dashboard`,
  `login`, `register`) — no feature's code ships in the initial bundle
  until navigated to.
- **Guards**:
  - `authGuard` (`CanActivateFn`) — checks `SessionStore` has a user; if
    not, attempts a silent `POST /auth/refresh` (the httpOnly cookie may
    still be valid after a page reload even though in-memory state is
    gone) before redirecting to `/login?returnUrl=<attempted url>`.
  - `redirectIfAuthenticatedGuard` (`CanActivateFn`) — the inverse:
    applied to `/`, `/login`, `/register`; if `SessionStore` already
    has a user, redirects to `/dashboard` instead of activating the
    route.
  - `permissionGuard(...keys)` — a single shared `CanActivateFn` reading
    `route.data['permissions']` and calling
    `SessionStore.hasAnyPermission(...keys)` (§7), mirroring
    `requirePermission(...requiredKeys)`'s OR semantics exactly. One
    implementation, configured per route via `data`, not one bespoke
    guard function per feature.
- **Preloading**: `PreloadAllModules` to start — this app has few
  enough features that the simplest strategy is correct; revisit with a
  custom/selective strategy only if bundle analysis later says
  otherwise (no premature optimization).

---

## 6. State Management

> **Store ≠ NgRx Store — read this first.** Throughout this document
> and the whole codebase, **"Store"** means a small, `providedIn: 'root'`
> (or route-scoped) Angular **service** that holds a feature's state as
> **signals** and exposes `computed()` values and plain methods. It is
> **not** `@ngrx/store`. This project will **not** introduce
> `@ngrx/store`, reducers, actions, effects, or entity adapters unless a
> future architectural decision explicitly revisits this. A Store's job
> is simply: hold the feature's signal state, expose read-only
> `computed()` views of it, and coordinate calls through the feature's
> `*.service.ts` — nothing more. Components inject the Store, never the
> `HttpClient`-based service directly, keeping components lean.

**Signals are the default for all local/feature state.** RxJS is kept,
deliberately scoped to where it's still the right tool. `computed()`
owns anything derivable. `resource()` is introduced narrowly. This
mirrors the backend's own recurring pattern of "pick the tool the
constraint actually demands" (e.g., SHA-256 vs. bcrypt for tokens vs.
passwords) rather than applying one paradigm dogmatically everywhere.

- **Signals** — lists, the selected/loaded item, loading/error flags,
  pagination state, form-adjacent UI state (dialog open/closed, active
  tab). This is the substance of every feature `*.store.ts`.
- **RxJS** — kept exactly where the problem is genuinely a *stream*,
  not a *value*:
  - `HttpClient` methods in `*.service.ts` return `Observable<Dto>` —
    that boundary is RxJS by definition; the Store is the seam that
    turns it into signal state (`toSignal()` or manual
    subscribe-and-set).
  - Debounced search input (`valueChanges.pipe(debounceTime(300),
    distinctUntilChanged())`) driving the employee list's `search`
    query param.
  - Router event streams, and any future event-driven feature
    (notifications, websockets) — inherently stream-shaped problems.
- **`computed()`** — anything derivable from other signals, never
  stored redundantly: `filteredEmployees`, `canEditEmployee =
  computed(() => sessionStore.hasAnyPermission('employee:update:any'))`,
  `totalPages`, the active breadcrumb trail, form-validity summaries.
  Storing what can be computed is the frontend version of the data
  integrity discipline the backend applies at the database layer (e.g.,
  the audit-log transaction guarantee) — a derived value that's
  separately stored is a value that can drift out of sync.
- **`resource()` / `httpResource()`** — reserved for simple, read-only,
  route-driven fetches where "loading / error / value" is the entire
  concern and there's no mutation to orchestrate: `employee-detail`'s
  single-record load by route param, reference-data lookups. **Not**
  used for the Employee list/CRUD store — mutations (create/update/soft
  -delete) need explicit sequencing, and this app deliberately does
  **not** do optimistic UI updates for them: every mutation's UI state
  is patched from the server's actual response only, after the request
  resolves — mirroring the backend's own "the mutation and its audit-log
  entry commit together or not at all" guarantee (Feature 11): the
  frontend should trust the server's response, not a client-side guess
  about what the server will do.

---

## 7. Authentication Architecture

**Session lifecycle:**

1. App bootstrap → a resolver (or route-level guard check) on the
   `ShellLayout` route attempts a silent `POST /auth/refresh`. The
   in-memory access token is gone after any page reload (see below),
   but the httpOnly refresh cookie may still be valid — this call is
   how a "remembered" session survives a refresh.
2. Success → `SessionStore` is populated (`user`, `accessToken`,
   `roles`, `permissions` — see below); failure (401) → treated as
   logged out, redirected to `/login`.
3. `login()`/`register()` populate the same store directly from their
   response bodies — no extra round-trip.
4. `logout()` calls `POST /auth/logout` (revokes the token server-side,
   verified live in this session's own endpoint run), clears
   `SessionStore`, redirects to `/login`. **Not available today**:
   revoking *all* of a user's sessions at once — the backend has no
   such endpoint yet; this blueprint doesn't pretend otherwise.

**Where the access token lives — deliberately in memory only** (a
signal inside `SessionStore`), **never** `localStorage`/`sessionStorage`.
This is the frontend half of the backend's own httpOnly-cookie decision
for the refresh token: the backend went out of its way to make the
refresh token unreadable by JavaScript specifically to blunt XSS: storing
the *access* token in Web Storage would reopen exactly the hole that
decision closed. The cost is that a hard page reload always requires
step 1 above — an accepted, deliberate trade-off.

### 7.1 Permissions — a shipped backend enhancement, not a frontend workaround

**Decision (revised from v1):** the frontend will **not** maintain its
own copy of `prisma/seed.js`'s `ROLE_PERMISSIONS` map. Permission
resolution is backend business logic; duplicating it client-side would
create a second copy that can silently drift from the source of truth
every time a role's grants change — exactly the kind of duplicated,
driftable state this project's own architecture otherwise goes out of
its way to avoid (see the "never store what can be computed" principle
in §6).

**Status: shipped and verified live** (previously a proposal in v2 of
this blueprint; built as its own small, surgically-scoped backend
change before any frontend `core/auth/` code was written — see
`backend/CLAUDE.md`'s Progress Log, "Permission Resolution
Enhancement"):

- **What shipped**: `sanitizeUser()`'s output
  (`backend/src/modules/users/user.service.js`) is now paired with a
  new `attachPermissions(sanitizedUser, roles)` helper that resolves a
  `permissions: string[]` array via the **same**
  `permissionCache.getPermissionKeysForRoles(roles)` call
  `permission.middleware.js` already uses server-side — exposing
  existing server-side logic, not new resolution logic. Deliberately
  a separate helper, not folded into `sanitizeUser()` itself, since
  `sanitizeUser()` is also used by `GET /users` and by `AuditLog`
  before/after snapshots, neither of which should carry a resolved
  permission set.
- **Where it appears**: the `user` object returned by
  `POST /auth/register`, `POST /auth/login`, and `GET /auth/me` only —
  verified live for all three. No new endpoint was added.
- **Where it does *not* appear**: `GET /users` and both
  `/users/me/profile-picture` endpoints remain `roles`-only — verified
  live (a promoted user's entry in `GET /users` has no `permissions`
  key). The JWT payload itself is unchanged (`{ sub, roles }`) —
  permissions travel only in the JSON response body, refreshed every
  time `/auth/me` is called — the exact same "can go stale until the
  next login/`/auth/me` call" trade-off already accepted for `roles`
  since Feature 8, **confirmed live**: promoting a test user to `ADMIN`
  and calling `/auth/me` with their *pre-promotion* access token
  immediately showed the new, full permission set (since
  `getCurrentUser` re-resolves from the database every call), while
  that same stale token still correctly received a `403` from
  `GET /users` (since `authMiddleware`/`requirePermission` check the
  token's own frozen `roles` claim) — only a fresh login produced a
  token `GET /users` accepted.
- **Frontend consequence**: `SessionStore.permissions` will be set
  directly from the login/register/`/auth/me` response — zero
  resolution logic on the frontend, zero duplicated map, zero drift
  risk. `SessionStore.hasPermission(key)` /
  `hasAnyPermission(...keys)` become simple array lookups against that
  signal, written against the real field from day one.

Swagger/OpenAPI docs and `handbook/API_ENDPOINTS.md` were updated in the
same change — a new `AuthenticatedUserSchema` (`UserPublicSchema` +
`permissions`) is used only by the three affected paths, so
`GET /users`'s documented schema doesn't claim a field that endpoint
never actually returns.

**Route guards** — `authGuard`, `redirectIfAuthenticatedGuard`,
`permissionGuard`, per §5.

**HTTP interceptors** (functional `HttpInterceptorFn`, in
`core/http/`):

1. **`authInterceptor`** — attaches `Authorization: Bearer
   <SessionStore.accessToken()>` to outgoing API requests (skipped for
   `/auth/login`, `/auth/register`, `/auth/refresh` themselves, which
   don't need or don't yet have a token).
2. **`credentialsInterceptor`** — corrected in v5 (verified against the
   installed `@angular/common/http` typings during Feature 2 planning):
   `provideHttpClient()` has **no** global "always send credentials"
   feature — its only feature functions are `withInterceptors`,
   `withInterceptorsFromDi`, `withXsrfConfiguration`,
   `withNoXsrfProtection`, `withJsonpSupport`,
   `withRequestsMadeViaParent`, and `withFetch`; `withCredentials` only
   ever exists as a per-request option. The earlier wording ("applied
   globally via the HttpClient provider configuration") described a
   mechanism that doesn't exist. **Corrected design**: a small,
   dedicated functional interceptor that unconditionally clones every
   outgoing request with `{ withCredentials: true }`, registered first
   in the `withInterceptors([...])` array — functionally global (every
   request passes through it), just implemented as an interceptor like
   the other three, not a separate provider flag. Kept as its own
   interceptor rather than folded into `authInterceptor`, since
   `authInterceptor` explicitly skips `/auth/login|register|refresh` —
   exactly the calls that still need credentials sent (to receive/send
   the refresh cookie) even though they don't need a Bearer token.
   Harmless on requests that have no cookie to send.
3. **`refreshInterceptor`** — on a `401` from any call other than
   `/auth/refresh` itself (avoiding an infinite loop): pause, trigger
   exactly one in-flight `POST /auth/refresh` (concurrent 401s within
   the same window share it, not one refresh call per failed request),
   update `SessionStore`, retry the original request once. If the
   refresh itself fails, force logout and redirect to `/login`. This is
   the client-side mirror of the rotation-on-use refresh design already
   verified working server-side.
4. **`errorInterceptor`** — maps `HttpErrorResponse` →
   `ApiError` and reports it to a central `NotificationService`, with an
   `HttpContext` escape hatch (e.g. `SKIP_GLOBAL_ERROR_NOTIFICATION`)
   so a form that wants to render the server's message inline isn't
   *also* shown a duplicate toast. **Real bug found and fixed in
   Feature 3**: `AuthService.refreshAccessToken()` didn't carry this
   context, so `redirectIfAuthenticatedGuard`'s/`authGuard`'s routine
   silent-restore attempt — which runs on *every* visit to `/`, `/login`,
   or `/register`, and is expected to fail for any anonymous visitor or
   right after logout — surfaced a raw "Refresh token missing" toast on
   every such page load. Fixed by giving `refreshAccessToken()` the same
   context `register()`/`login()` already used; the shared field was
   renamed `silentErrorContext` (from `formOwnedErrorContext`) since it
   now covers both "form renders its own error" and "this failure is a
   normal, silent outcome," not just the former.

---

## 8. API Layer

- **`*.service.ts`** — thin `HttpClient` wrappers, one method per real
  backend endpoint, zero business logic, return `Observable<Dto>` (the
  literal wire shape).
- **DTOs** (`*.dto.ts`) — TypeScript interfaces matching exactly what
  the server sends today, not an idealized version:
  ```ts
  interface EmployeeDto {
    id: string;
    userId: string | null;
    department: string;
    jobTitle: string;
    salary: string;        // Decimal serializes as a JSON string
    dateOfJoining: string; // ISO date string
    managerId: string | null;
    deletedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }
  ```
- **Domain models** (`*.model.ts`) — the shape components/stores
  actually work with: `salary: number`, `dateOfJoining: Date`.
- **Mappers** (`*.mapper.ts`) — pure `toDomain(dto): Model` /
  `toRequestBody(model): CreateEmployeeRequest` functions, the single
  place the salary string↔number and date string↔`Date` conversions
  happen. This directly mirrors the backend's own
  `normalizeForAudit()` helper: isolate a serialization quirk behind one
  small function instead of letting every call site remember it.
- **Response typing** — hand-declared per endpoint response
  (`{ employees: EmployeeDto[]; pagination: Paginated }`,
  `{ employee: EmployeeDto }`, `{ message: string }`), **not** wrapped
  in a generic envelope type, because no such envelope exists
  server-side (§0). The one genuinely reusable generic is
  `Paginated<T> = { page: number; limit: number; total: number;
  totalPages: number }`, since that shape is designed to repeat as more
  list endpoints are added.
- **Error handling** — a shared `ApiError { status: 'error'; message:
  string; stack?: string }` model; the `errorInterceptor` (§7) is the
  one place an `HttpErrorResponse` becomes an `ApiError`. Components
  never parse `HttpErrorResponse` directly.

---

## 9. UI Architecture

- **Smart components** — one per routed page (`EmployeeListPageComponent`,
  `EmployeeDetailPageComponent`, etc. — naming per §10). Inject the
  feature's Store, own data-fetching and mutation orchestration, own
  the permission checks that decide what renders, pass data down via
  `input()`.
- **Presentational components** — `shared/components/*` and
  feature-local dumb components (`EmployeeTableComponent`,
  `EmployeeToolbarComponent`): pure `input()`/`output()`, no
  `HttpClient`/Store injection anywhere inside them, trivially
  unit-testable in isolation.
- **Dialogs** (`MatDialog`) — destructive confirmations (soft-delete an
  employee, delete a document, remove a profile picture) share **one**
  `ConfirmDialogComponent`, parameterized by title/message/confirm-label
  — never a bespoke dialog per action. Richer dialog content (e.g.
  `EmployeeDocumentsDialogComponent`) gets its own component when the
  content is genuinely feature-specific.
- **Drawers** (`MatSidenav`, `mode="over"`) — contextual side panels
  where losing the underlying page's context would hurt, reserved for
  cases where a dialog feels too heavy (e.g. a long list side panel
  opened from a detail page without navigating away).
- **Tables** — one generic `DataTableComponent` (`MatTable` +
  `MatPaginator` + `MatSort`), driven entirely by `columns: ColumnDef[]`
  + `rows: T[]` + `loading` inputs and `(pageChange)`/`(sortChange)`
  outputs. Pagination/sort/filter are **server-side**, matching the
  real `page/limit/sortBy/order` query params the backend already
  validates and whitelists — no pretending to paginate data the server
  already paginated. `EmployeeTableComponent` configures it for the
  Employees feature; it is never forked.
- **Forms — Typed Angular Reactive Forms, explicitly not Signal
  Forms.** Every form is a typed `FormGroup<{...}>` built with
  `FormBuilder`. **Signal Forms are deliberately not adopted in this
  phase** — they're a newer, still-maturing Angular primitive, and
  introducing them now would mean building the app's entire form layer
  on a pattern with less production track record than Reactive Forms,
  for no immediate benefit. Signal Forms may be evaluated later, once
  the application is stable, as its own dedicated, explicitly-approved
  migration — not folded in silently during initial feature work. One
  `*.validators.ts` per feature mirrors the backend's Zod rules 1:1
  where practical (`dateOfJoining` not-in-future, `salary` positive,
  required fields) for instant feedback. The server's Zod validation
  remains the actual authority — client-side validation is a UX
  convenience, never assumed sufficient on its own, the same principle
  as a route guard never replacing the backend's own ownership check.
  Because server validation errors arrive as one joined string (§0),
  forms show that string as a single banner/alert on submit failure —
  they do **not** attempt to split it and assign fragments to
  individual controls; that would be guessing at a format the backend
  doesn't actually guarantee.
- **Reusable patterns** — a single `PageHeaderComponent` (title +
  breadcrumb + a permission-gated primary action slot) used by every
  feature-list page; a single `ConfirmDialogComponent` reused by every
  destructive action across every feature.

---

## 10. Component Naming Convention

Consistent, enterprise-style naming so a file's role is obvious from
its name alone, without opening it. Every Angular class name ends in
its structural role suffix (`Component`, `Directive`, `Pipe`); files are
kebab-case of the same name.

| Category | Class pattern | Examples |
|---|---|---|
| Routed smart component (one per route) | `<Domain><Noun>PageComponent` | `EmployeeListPageComponent`, `EmployeeDetailPageComponent`, `DashboardPageComponent`, `LandingPageComponent`, `LoginPageComponent` |
| Presentational, domain-scoped | `<Domain><Purpose>Component` | `EmployeeFormComponent`, `EmployeeTableComponent`, `EmployeeToolbarComponent` |
| Dialog content | `<Domain><Purpose>DialogComponent` | `EmployeeDocumentsDialogComponent` |
| Drawer content | `<Domain><Purpose>DrawerComponent` | (reserved pattern; none exist yet) |
| Domain-agnostic shared component | `<Purpose>Component` (no domain prefix) | `PageHeaderComponent`, `EmptyStateComponent`, `LoadingSkeletonComponent`, `ConfirmDialogComponent`, `DataTableComponent`, `FileUploadComponent` |
| Layout/shell chrome | `<Region>Component` | `HeaderComponent`, `SidebarComponent`, `FooterComponent`, `BreadcrumbsComponent`, `ShellComponent`, `PublicLayoutComponent` |
| Store (§6) | `<Domain>Store` (service, not a component) | `EmployeeStore`, `SessionStore` |
| Data-access service | `<Domain>Service` | `EmployeeService`, `AuthService` |
| Functional guard | `camelCaseGuard` | `authGuard`, `permissionGuard`, `redirectIfAuthenticatedGuard` |
| Functional interceptor | `camelCaseInterceptor` | `authInterceptor`, `refreshInterceptor`, `errorInterceptor` |
| Directive | `<Purpose>Directive` (class), `appCamelCase` (selector) | `HasPermissionDirective` → `*appHasPermission` |
| Pipe | `<Purpose>Pipe` (class), `camelCase` (selector) | `FileSizePipe` → `fileSize`, `RoleLabelPipe` → `roleLabel` |
| Validator function | `camelCaseValidator` | `notFutureDateValidator`, `positiveNumberValidator` |
| Mapper | `<Domain>Mapper` (or a plain exported function module) | `employee.mapper.ts` exporting `toEmployeeModel`/`toCreateEmployeeRequest` |

**File naming**: kebab-case of the class name with the suffix
lower-cased and dot-separated (`employee-list-page.component.ts`,
`employee-documents-dialog.component.ts`, `has-permission.directive.ts`,
`file-size.pipe.ts`, `employee.store.ts`, `employee.service.ts`).

**Selectors**: `app-` prefix + kebab-case for components
(`app-employee-list-page`, `app-page-header`), matching Angular CLI
defaults, applied with zero exceptions so every custom element in a
template is immediately recognizable as project code.

---

## 11. Shared Layer

- **Components**: `data-table`, `page-header`, `confirm-dialog`,
  `empty-state`, `loading-skeleton`, `file-upload` (wraps both real
  upload endpoints' shared concerns — drag-drop, a client-side MIME/
  size pre-check mirroring the backend's actual allow-lists: profile
  pictures `image/jpeg|png|webp` up to 5 MB; employee documents
  additionally `application/pdf` up to 10 MB). **Delivered in Feature 4**
  for the profile-picture case — built for real rather than deferred,
  since a second real consumer (Employee documents) already justified
  it, unlike `empty-state`, still deliberately unbuilt (§4.3/revision
  v6).
- **Directives**: `*appHasPermission="'employee:create'"` and
  `*appHasAnyPermission="['employee:read:any','employee:read:own']"` —
  structural directives reading `SessionStore` (§7), the template-level
  counterpart to `permissionGuard`.
- **Pipes**: `fileSize` (bytes → human-readable, for
  `EmployeeDocument.size: Int`), `roleLabel` (role name → display
  label). A `decimalCurrency`-style formatting pipe is documented to
  expect the **mapped domain `number`**, never the raw wire `string` —
  reinforcing the mapper boundary rather than letting a component
  quietly coerce a string itself.
- **Validators**: `notFutureDateValidator`, `positiveNumberValidator` —
  centralized once, not copy-pasted per feature, the same
  centralization principle behind the backend keeping these rules in
  one Zod schema file rather than scattered across services.
- **Utilities**: `date.util.ts` (ISO-string parsing since domain models
  keep real `Date` objects, formatted at the display edge via
  `DatePipe`), `http-params.util.ts` (builds `HttpParams` from a typed
  filter object — the employee list's exact
  `page/limit/search/department/jobTitle/managerId/sortBy/order` set,
  so every list feature builds params the same way).

---

## 12. Core Layer

- **Interceptors**: `credentialsInterceptor`, `authInterceptor`,
  `errorInterceptor`, `refreshInterceptor` (§7) — in that order in
  `withInterceptors([...])`. This order is deliberate, not incidental:
  Angular runs interceptors in array order outbound, but in *reverse*
  order on the response/error path, so `refreshInterceptor` (last in the
  array, closest to the real HTTP call) sees a 401 *before*
  `errorInterceptor` does — letting it silently refresh-and-retry without
  a spurious error toast ever flashing for a transparently-recovered
  session. Found and corrected during Feature 2 implementation (an
  earlier draft of this section listed `refreshInterceptor` before
  `errorInterceptor`, which would have shown a toast on every silent
  refresh).
- **Guards**: `authGuard`, `redirectIfAuthenticatedGuard`,
  `permissionGuard` (§5/§7).
- **Tokens**: `API_BASE_URL` (an `InjectionToken` sourced from
  `environment.ts`, never hardcoded inside a `*.service.ts` — the
  frontend equivalent of the backend's rule that `env.js` is the only
  file allowed to read `process.env` directly).
- **Services**: `SessionStore` (holds `user`, `accessToken`, `roles`,
  and — once §7.1's backend enhancement ships — `permissions`; also
  exposes `updateProfileImage(url, publicId)`, added in Feature 4,
  since the profile-picture endpoints return a `user` shape without
  `permissions` and a wholesale merge would silently drop it),
  `AuthService` (thin wrapper for the 5 real auth endpoints),
  `NotificationService` (wraps `MatSnackBar` — the one place a toast
  gets triggered from), `LoggerService` (thin console-backed wrapper
  today).
- **Config**: `core/config/app-config.ts` — one small object built from
  `environment.ts` (`apiBaseUrl`, `production`).
- **Error handler**: a global `ErrorHandler` override for genuinely
  unexpected (non-HTTP, e.g. template/render) errors — logs via
  `LoggerService`, shows a generic fallback notification. A distinct
  concern from `errorInterceptor`, which only ever sees expected API
  error responses.
- **Logging**: `LoggerService` is deliberately the *only* place a
  `console.*` call is allowed to live outside it — mirrors the backend's
  own Feature 5 lesson (Winston replacing scattered `console.error`),
  reused here so a real logging/monitoring integration later is a
  one-file change, not a grep-and-replace across the app.

---

## 13. Material Design Strategy

- **Theme**: one custom Material 3 theme, defined once via
  `mat.theme()` in `styles/_material-theme.scss`, sourced from the same
  token file Tailwind reads (§14) — never per-component style
  overrides fighting the theme.
- **Typography**: Material's typography scale is the base for all text;
  Tailwind's typography utilities are avoided for prose specifically to
  prevent two competing font-size scales — Tailwind is reserved for
  layout/spacing, not type.
- **Density**: one global compact density setting, appropriate for a
  data-dense HR/admin tool (tables, forms) — applied once at the theme
  level, never mixed per component.
- **Icons**: Material Symbols via `<mat-icon>`, referenced only through
  one shared `icon-names.ts` constants file — the same "frozen object
  instead of magic strings" convention the backend already uses for
  `AUDIT_ACTIONS`/`AUDIT_ENTITY_TYPES`. **Real bug found and fixed in
  Feature 3**: `index.html` has always loaded the "Material Symbols
  Outlined" web font, but `MatIconModule`'s own default `fontSet` is the
  classic, never-loaded "Material Icons" font — every `<mat-icon>` since
  Feature 1 was rendering its ligature text literally (e.g. `people`)
  instead of resolving to a glyph, clipped to illegibility by the icon's
  small fixed-size box. Latent since Feature 1/2 but only visually
  obvious once Feature 3 put icons at a larger size on Landing's feature
  cards. Fixed globally, once, via `{ provide: MAT_ICON_DEFAULT_OPTIONS,
  useValue: { fontSet: 'material-symbols-outlined' } }` in
  `app.config.ts` plus the matching `.material-symbols-outlined` CSS
  class in `styles.scss` — every `<mat-icon>` in the app, not just
  Feature 3's, needed exactly one shared fix.
- **Spacing**: a clear boundary — **inside** a Material component,
  Material's own spacing tokens apply; **between** layout regions/
  components, Tailwind's spacing scale applies. Never both inside the
  same element.
- **Color system**: semantic roles (primary/accent/warn) defined once
  in `_tokens.scss`, consumed by both Material's theme (automatically)
  and Tailwind's config (referencing the same custom properties) — one
  palette, two consumers, never two independent color definitions that
  can drift apart.

---

## 14. Styling Strategy

- **Tailwind** — layout, spacing, flex/grid, responsive breakpoints,
  and one-off utility styling on custom (non-Material) elements: the
  shell's grid regions, the Landing Page's marketing sections, any
  bespoke card not backed by `mat-card`.
- **SCSS** — the Material theme definition itself, plus genuinely
  component-local concerns utilities can't express cleanly (complex
  pseudo-element states, keyframe animations). Most components should
  need **zero** custom SCSS beyond Tailwind classes + Material
  defaults — a large bespoke `.component.scss` per component is the
  enterprise-Angular anti-pattern this explicitly avoids.
- **Design tokens** — one `_tokens.scss` (spacing scale, radii,
  elevation, the color roles from §13) that both Tailwind's config and
  the Material theme read from — exactly one source of truth for "what
  blue is primary."
- **CSS variables** — the runtime bridge between Material's
  theme-generated custom properties and Tailwind's config (referencing
  `var(--mat-sys-primary)`-style tokens instead of hardcoded hex) — this
  is what makes a future dark-mode toggle a token swap, not a
  per-component rewrite.
- **Component styles** — templates default to Tailwind utility classes;
  `.component.scss` is the exception, not the default.

---

## 15. Accessibility Strategy

- **Keyboard navigation** — Material components already provide
  correct tab order and keyboard interaction (menus, dialogs, selects);
  the discipline is not fighting it with custom click-only handlers.
  Any genuinely custom interactive element must be a real
  button/link or carry explicit `tabindex`/keydown handling — never a
  `div` with only `(click)`.
- **Focus management** — `MatDialog`/`MatSidenav` already restore focus
  to the triggering element on close; route transitions move focus to
  the new page's `<h1>` (via the CDK's focus utilities/
  `LiveAnnouncer`) so screen-reader users aren't stranded on a
  now-vanished element.
- **ARIA** — rely on Material's built-in roles first; add explicit
  `aria-label`/`aria-describedby` only where the default is
  insufficient — e.g. an icon-only row action in the data table needs
  `aria-label="Delete employee Jane Doe"`, not just "Delete."
- **Color contrast** — the single theme (§13) is checked against WCAG
  AA at definition time (primary/accent/warn against their typical
  backgrounds) — one audit at the token level, not per component later.
- **Screen readers** — `LiveAnnouncer` (CDK) announces async outcomes
  with no visual focus change of their own: "Employee deleted," a table
  finishing a filtered reload, a snackbar's message — a purely visual
  toast is invisible to a screen-reader user unless explicitly
  announced.

---

## 16. Performance Strategy

- **Lazy loading** — every feature route lazy-loaded (§5); no feature's
  code ships until navigated to.
- **Route preloading** — `PreloadAllModules` to start; revisit with a
  selective strategy only once bundle analysis on a larger feature set
  actually justifies it.
- **Deferrable views** (`@defer`) — for genuinely below-the-fold or
  rarely-triggered UI: the employee-documents dialog's contents, a
  destructive "danger zone" section, the Dashboard's reserved widgets
  region once it holds real content — applied where it earns its keep,
  not reflexively everywhere.
- **Signals + `OnPush`** — every component defaults to
  `ChangeDetectionStrategy.OnPush`, made natural by signal inputs
  rather than requiring manual `markForCheck()` calls — avoids the
  classic enterprise-Angular trap of unbounded zone-triggered change
  detection across a large tree.
- **Image optimization** — `NgOptimizedImage` for profile pictures/
  document thumbnails actually served from Cloudinary, paired with
  Cloudinary's own URL-based resize transforms rather than shipping
  full-resolution originals into `<img>`.
- **Bundle optimization** — deliberate, minimal third-party dependencies
  (Material +, if a dashboard widget ever needs it, one charting
  library — not several competing UI kits); the Angular CLI's built-in
  esbuild production build is trusted as-is, no custom bundler config
  without a demonstrated need.

---

## 17. Feature Lifecycle

One repeatable lifecycle for every future frontend feature — every item
below is mandatory where applicable, in this order:

1. **Theory** — what the feature is and why it's needed, in plain
   language, before any design or code.
2. **Backend Contract Review** — confirm the exact real endpoint(s),
   request/response shape, and permission key(s) involved, re-verified
   against current backend source (never assumed or remembered from an
   earlier session).
3. **Architecture Discussion** — how this feature fits the layers in
   §1/§2; what's feature-local vs. promoted to `shared/`/`core/`; any
   non-obvious trade-off, discussed before implementation.
4. **UI/UX Discussion** — layout, states (loading/empty/error), which
   shared components (§9/§11) apply, naming per §10.
5. **Folder Placement** — the exact `features/<name>/` layout for this
   feature, decided before files are created.
6. **DTO Design** — the exact wire shape, verified against a live call,
   not assumed.
7. **Domain Model** — the shape the UI actually works with.
8. **Mapper** — the DTO ⇄ domain conversion functions.
9. **HTTP Service** — the thin `*.service.ts`, one method per endpoint.
10. **Store** — the signal-based service (§6) — explicitly **not**
    NgRx — coordinating the service and exposing state/`computed()`
    to components.
11. **Typed Reactive Form** (where applicable) — §9's forms approach;
    Signal Forms explicitly out of scope for now.
12. **Smart Components** — routed pages, named per §10.
13. **Presentational Components** — dumb, reusable pieces, named per
    §10.
14. **Routing** — the feature's `*.routes.ts`, lazy-loaded, wired into
    the parent route table (§5).
15. **Guards** — `permissionGuard` route `data`, and any
    feature-specific guard need.
16. **Accessibility Review** — keyboard, focus, ARIA, contrast, screen
    reader (§15), checked against this specific feature's UI.
17. **Responsive Review** — an explicit, stated decision for this
    screen's behavior at each relevant breakpoint (or explicitly
    desktop-only, never an unstated default).
18. **Performance Review** — lazy-loading/defer/`OnPush` applied where
    relevant (§16).
19. **Manual Testing against the real backend** — never mocked-only,
    the same discipline every backend feature and this session's own
    endpoint run log already followed.
20. **Documentation Updates** — this blueprint amended if the feature
    changes an architectural decision recorded here.
21. **README Updates** — `frontend/README.md` updated if endpoints,
    scripts, or setup steps changed.
22. **Handbook Chapter** — a new `handbook/frontend-NN-*.md` chapter
    (theory, architecture, security implications if any, common
    mistakes, interview prep) in the shared handbook.
23. **Git Branch Recommendation** — a named feature branch proposed
    (mirroring the backend's `feature/NN-description` convention).
24. **Commit Message** — prepared, following the same Conventional-
    Commit-ish style already used in this repo's history, **not
    pushed**, pending explicit go-ahead.
25. **Interview Questions** — a short Q&A set for this feature's key
    decisions, matching the backend handbook's own interview-prep
    sections.
26. **Future Improvements** — explicitly named, not silently implied —
    what was deliberately deferred and why.
27. **Stop and wait for explicit approval** before starting the next
    feature — non-negotiable, identical to the backend's own Rule 6.

---

## 18. Definition of Done

A frontend feature is not complete until every applicable box below is
checked — this is the verification mirror of §17's process:

- [ ] Theory and Backend Contract Review are documented, not skipped.
- [ ] The Architecture Discussion and UI/UX Discussion happened before
      implementation, with trade-offs stated.
- [ ] Folder placement matches §2's conventions.
- [ ] DTO Design reflects the real, currently-observed wire shape (not
      an assumed/idealized one).
- [ ] Domain Model and Mapper exist and isolate every DTO↔domain
      asymmetry (e.g. `salary`, dates) in one place.
- [ ] HTTP Service methods contain zero business logic.
- [ ] Store is a signal-based service exposing `computed()` views — not
      NgRx, no reducers/actions/effects.
- [ ] Typed Reactive Form used where the feature has a form (Signal
      Forms not used).
- [ ] Smart/Presentational components are named per §10 and split per
      §9.
- [ ] Routing is lazy-loaded and wired per §5.
- [ ] Guards match the real backend permission matrix exactly (checked
      against `prisma/seed.js`'s `ROLE_PERMISSIONS`, not assumed) —
      including `:any`/`:own` cases where the client can only gate on
      "has some access," never the ownership check itself.
- [ ] Accessibility Review complete: keyboard-operable, focus managed,
      ARIA labels on icon-only actions, async outcomes announced.
- [ ] Responsive Review complete: an explicit, stated decision for this
      screen, not an unstated default.
- [ ] Performance Review complete: lazy-loading/defer/`OnPush` applied
      where relevant.
- [ ] Every backend call has been exercised against the real running
      server — response shapes typed from what was actually observed.
- [ ] Loading, empty, and error states are all explicitly designed —
      not just the happy path.
- [ ] This blueprint updated if an architectural decision changed.
- [ ] `frontend/README.md` updated if endpoints, scripts, or setup
      steps changed.
- [ ] A `handbook/frontend-NN-*.md` chapter written — same rigor as
      every backend chapter.
- [ ] A git branch name proposed and a commit message prepared — not
      pushed, pending explicit go-ahead.
- [ ] Interview questions written for this feature's key decisions.
- [ ] Future improvements explicitly named, not silently implied.

---

## 19. Sequencing: What Must Happen Before Frontend Auth Code Is Written

1. ~~**Backend enhancement (§7.1)**~~ — **done.** Resolved
   `permissions: string[]` now ships on `register`/`login`/`/auth/me`,
   built with the backend's usual discipline (implementation, live
   verification, `backend/CLAUDE.md` Progress Log entry,
   `handbook/API_ENDPOINTS.md` update) and confirmed above.
2. **Angular project initialization** — scaffold `frontend/` (still
   pending your separate approval, per your explicit instruction not to
   generate CLI commands yet).
3. **`frontend/CLAUDE.md`** — written immediately after scaffolding,
   the frontend's own engineering constitution (mirroring
   `backend/CLAUDE.md`).
4. **First real feature**: Authentication (Landing → Register/Login →
   Dashboard), built only once step 1 has shipped — so
   `core/auth/session.store.ts` is written against the real, final
   `permissions` field from day one, instead of being written twice.

---

## Open Questions for Approval

1. **Third-party UI kit scope** — still no dependency beyond Angular
   Material assumed anywhere in this blueprint (no charting library yet
   — the Dashboard's widget region is reserved, not populated).
   Confirm that's still correct before `frontend/package.json` gets its
   first dependency beyond the CLI defaults.
2. Anything else you want changed before Angular initialization begins.
