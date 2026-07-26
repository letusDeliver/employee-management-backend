# Project Overview

**Last updated:** 2026-07-26
**Current state:** Backend feature-complete (Dockerization and an automated
testing strategy remain open). Frontend has shipped all 6 originally-planned
features plus a full design-system rollout (Phase 1 + Phase 2). Further work
on both sides is enhancement-phase, not roadmap-phase — see §6.

This document is the onboarding entry point for a new engineer joining the
project. It explains *what the system is for* and *how the pieces fit
together* at a level above any single file. For the details this document
deliberately doesn't repeat, see:

- [`frontend-architecture-blueprint.md`](./frontend-architecture-blueprint.md) — the frontend's structural constitution (folders, routing, state, naming).
- [`design-system.md`](./design-system.md) — the frontend's visual language (tokens, typography, components).
- [`../frontend/CLAUDE.md`](../frontend/CLAUDE.md) / [`../backend/CLAUDE.md`](../backend/CLAUDE.md) — the process each side follows and the full, dated log of every feature.

---

## 1. Project Overview

The **Employee Management System** is an internal, authenticated business
application for managing a company's employee records — the kind of system
that replaces a shared spreadsheet or a pile of HR emails with a single
source of truth. It lets an organization record who works there, what
department and role they're in, what they're paid, who they report to, and
what documents (contracts, IDs, certifications) are on file for them —
while making sure only the right people can see or change any of it.

**Target users:**
- **Administrators** — full visibility and control: manage every employee
  record, manage documents, see the registered-user list.
- **Managers / privileged staff** — a subset of the same capabilities,
  scoped by permission (e.g. read access without delete access).
- **Employees** — self-service only: view their own profile, manage their
  own profile picture, and (per their own record's permissions) view their
  own employee data.

**The overall goal** is twofold, and both halves matter equally: (1) be a
genuinely useful internal HR tool, and (2) serve as a reference-quality
example of how an enterprise Angular + Node application should be
structured, documented, and evolved — every decision in this codebase is
made and recorded as if a new engineer will need to understand *why*, not
just *what*, six months from now.

---

## 2. Business Features

| Feature | What it does, from the business's perspective |
|---|---|
| **Authentication** | Anyone can register or log in. A session survives page reloads and browser restarts without ever putting a long-lived credential in reachable JavaScript storage. Logging in establishes exactly who you are and what you're allowed to do for the rest of your visit. |
| **Dashboard** | The landing page after login — a navigation hub, not a data screen. It shows only the modules a given user actually has permission to open, so an Employee and an Administrator see meaningfully different dashboards without either one being told "access denied." |
| **Users** | An admin-only directory of everyone who has registered an account, with each person's assigned role(s). Read-only today — a visibility tool, not a user-management console. |
| **Employees** | The core of the application: create, view, search, filter, sort, edit, and (soft-)delete employee records — department, job title, salary, date of joining, and who they report to. Every action is gated by the visiting user's real permissions, not just hidden by convention. |
| **Employee Documents** | Each employee record can carry supporting files (contracts, ID scans, certifications) — upload, browse, and delete, scoped to the same record-level permission as editing that employee. |
| **Account / Profile** | Every logged-in user can see their own name, email, role(s), and join date, and can upload or remove their own profile picture. Deliberately self-service and deliberately not a place to change your own name or email (no such capability exists yet — see §6). |
| **Shared functionality** | Cutting across every feature above: permission-aware navigation (menu items and buttons that simply don't appear if you can't use them), consistent empty/loading/error states, toast confirmations for successful actions, and breadcrumbs that always reflect where you are. |

---

## 3. Technical Architecture

### System shape

```
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│         Browser             │        │            PostgreSQL             │
│  ┌────────────────────────┐ │  REST  │  ┌──────────────────────────────┐ │
│  │   Angular 21 Frontend  │◄├───────►│  │   Prisma ORM                 │ │
│  │  Features / Shared /   │ │  JSON  │  │   Repository → Service →     │ │
│  │  Layout / Core         │ │        │  │   Controller → Route (Express)│ │
│  └────────────────────────┘ │        │  └──────────────────────────────┘ │
└─────────────────────────────┘        └──────────────────┬───────────────┘
                                                            │
                                                    ┌───────▼────────┐
                                                    │   Cloudinary    │
                                                    │ (file storage)  │
                                                    └─────────────────┘
```

### Frontend

- **Angular 21**, standalone components throughout — no `NgModule`s.
- **Signals** are the default for state: every feature owns a small
  `*.store.ts` service (`providedIn: 'root'` or route-scoped) holding
  `signal()` state and exposing `computed()` views. This is deliberately
  **not** NgRx — no reducers, actions, or effects. RxJS is kept only where
  the problem is genuinely a *stream* (the `HttpClient` boundary, debounced
  search input, router events).
- **Typed Reactive Forms** for every form in the app (Login/Register,
  Employee create/edit) — chosen over Angular's newer Signal Forms as a
  deliberate, documented decision, not an oversight.
- **Feature-first, layered structure** — a direct Angular translation of
  the backend's own `Route → Controller → Service → Repository` layering:

  | Layer | Contains | Analogous to (backend) |
  |---|---|---|
  | `core/` | App-wide singletons: session state, HTTP interceptors, guards, error handling, logging | `config/`, `middlewares/`, `errors/` |
  | `shared/` | Domain-agnostic, reusable building blocks: generic components, directives, pipes, validators | `utils/` |
  | `layout/` | Visual chrome only (public site vs. authenticated shell) — no business logic | — |
  | `features/` | One folder per business domain (`landing`, `auth`, `dashboard`, `account`, `users`, `employees`), each lazy-loaded | `src/modules/` |

  Dependency direction is strictly one-way: `features → shared → core`,
  never the reverse, and never one feature importing another directly.
  When two features need the same capability (e.g. Employees needing to
  resolve a user's display name, a capability Users already had), it gets
  **promoted into `core/`** rather than imported feature-to-feature.
- **Routing**: two top-level layouts selected by route — a public layout
  (landing/login/register) and an authenticated shell (everything else).
  Every feature route is lazy-loaded and permission-guarded via one shared
  `permissionGuard`, configured per route rather than hand-written per
  feature.
- **API communication**: a thin `*.service.ts` per feature wraps
  `HttpClient` and is the *only* place that touches the network; a chain of
  functional interceptors (credentials → auth → refresh → error) handles
  cookie/token attachment, silent token refresh on a 401, and centralized
  error surfacing, so no feature ever hand-rolls that logic.
- **Permission-based UI**: the backend is the only real authority — the
  frontend mirrors its decision by reading a `permissions: string[]` array
  attached to the session, then using one function
  (`hasAnyPermission(...)`) both to guard routes and to hide/show buttons
  and menu items in templates. The UI decision and the server's decision
  are the same check, run twice, never two different rules.

### Backend (for context — full detail lives in `backend/CLAUDE.md`)

Node.js + Express, following **Clean Architecture**: every request flows
`Route → Controller (thin) → Service (business logic) → Repository (Prisma
queries) → PostgreSQL`. Authentication is JWT access tokens plus an
httpOnly-cookie refresh token; authorization is a full **Role/Permission
RBAC model** (not hardcoded role checks) enforced by a
`requirePermission(...)` middleware. File uploads (Multer) are stored in
Cloudinary. Input is validated with Zod, logging is Winston/Morgan,
security headers via Helmet, and the API is documented live in Swagger.

---

## 4. Design System

The design system (fully detailed in `design-system.md`) is the frontend's
visual constitution — the reusable look-and-feel every feature draws from
so no two screens invent their own heading size or card style.

- **Philosophy**: reuse before you build (one visual pattern per problem);
  a border means *static*, a shadow means *interactive* — never both on the
  same element; Material's own M3 defaults are the floor, not something to
  fight, so custom styling is reserved for the gaps Material intentionally
  leaves open (page chrome, cards, empty/loading/error states); and
  accessibility is default behavior baked into each primitive, not a
  follow-up pass.
- **Typography**: a single Inter-based, eight-role scale (`display` down to
  `overline`), restricted to exactly the three font weights actually loaded
  in the browser — no weight the browser has to fake.
- **Color**: an M3 tonal palette generated from one brand seed color, used
  by role (primary / error / warning / neutral) rather than by hex value.
  There is deliberately no "success" banner tone — success feedback is
  always a toast, never inline, so there's exactly one pattern per kind of
  feedback.
- **Elevation & surfaces**: exactly two card treatments — a bordered,
  static `.surface-card` for record/detail/form content, and a shadowed,
  interactive `.surface-card-interactive` for genuinely clickable tiles —
  enforcing the border-vs-shadow rule structurally rather than by
  convention alone.
- **Shared UI components**: `PageHeaderComponent`, `SectionHeaderComponent`,
  `InlineBannerComponent`, `EmptyStateComponent`, `LoadingSkeletonComponent`,
  and `AvatarComponent`, alongside the pre-existing `DataTableComponent`,
  `ConfirmDialogComponent`, and `FileUploadComponent` — every one
  presentational only (no `HttpClient`, no Store, no feature-specific
  copy baked in).
- **Accessibility principles**: every primitive ships its accessibility
  behavior for free — semantic headings, `role="alert"` on banners,
  `aria-hidden` on decorative icons, and state that's never communicated
  by color alone (e.g. the active nav item also carries
  `aria-current="page"`).
- **Responsiveness**: mobile-width-up by default; no fixed pixel widths
  that can overflow a narrow viewport (the one deliberate exception being
  `AvatarComponent`'s fixed sizes, since an avatar's size is a design
  choice, not a layout accident).
- **Reusability**: every value traces back to a single token file
  (`_tokens.scss`), which is what makes a future dark theme a token-level
  change rather than a per-component rewrite — and every shared component
  is built only once a second real consumer has validated its contract,
  never speculatively (see §7).

---

## 5. Development Journey

The frontend was built one feature at a time, each carried through the
same eight-phase workflow (Theory → Architecture → Action Plan → Git →
Implementation → Review → Documentation → Git Completion), with explicit
approval required between phases:

1. **Feature 0–1** — Angular project initialization, then Angular
   Material 3 (a custom-generated theme, not a stock preset) and Tailwind
   CSS v4 wired together as the styling foundation.
2. **Feature 2** — Authentication: session state, guards, interceptors,
   Login/Register, and the application's two layout shells.
3. **Feature 3** — Real Landing Page content and a Dashboard reshaped into
   a permission-aware navigation hub.
4. **Feature 4** — Account: self-service profile viewing and profile
   picture management — also the first feature to prove the Dashboard's
   navigation mechanism actually works end-to-end.
5. **Feature 5** — Users: an admin-only, read-only directory — the first
   feature to exercise real route-level permission gating.
6. **Feature 6** — Employees: full CRUD, document management, and the
   first genuinely generic `DataTableComponent`, built only once a real
   server-side-paginated contract existed to design it against.

Each feature was followed by live-browser verification against the real
running backend (never mocked data), which repeatedly surfaced real,
previously invisible bugs — a systemic missing form-field label at high
theme density, an indistinguishable surface/background color pair, a
salary input silently discarding unparseable values — each fixed before
the feature was considered done.

Once all six originally-planned features shipped, the project entered a
dedicated **Design System** initiative: **Phase 1 (Foundation)** built the
token system and the six new shared components described in §4 *ahead of*
any consumer — a deliberate, one-time exception to the project's normal
"build shared components only once a real need exists" rule, explicitly
approved because a coherent visual language was itself the goal. **Phase 2
(Application)** then rolled those primitives out across every existing
screen (Landing, Dashboard, Account, Users, and all of Employees),
screen-by-screen, each verified live and merged only after explicit
approval — closing with a Design Consistency Audit that caught and fixed
the one remaining inconsistency.

The result is an application that evolved from a scaffolded shell into a
scalable, consistently structured, consistently styled enterprise system —
one where the *process* used to build it is as deliberately engineered as
the product itself.

---

## 6. Current State

**Fully completed:**
- Backend: authentication, full Role/Permission RBAC, Employee CRUD with
  search/pagination/filtering/sorting, audit logging, Cloudinary-backed
  file uploads, and live Swagger API documentation.
- Frontend: all 6 originally-planned features (Auth, Dashboard, Account,
  Users, Employees, Employee Documents).
- Design System: Phase 1 (Foundation) and Phase 2 (Application), rolled
  out to every screen except Login/Register (see below).

**Intentionally deferred, not defects:**
- **Login/Register** still use their original `mat-card` / inline-error
  convention rather than the newer design-system primitives — explicitly
  scoped out of the Phase 2 rollout, a known and documented follow-up.
- **Dark mode** has no palette built yet — reserved as the design system's
  own named future "Phase 4," made cheap by the token-driven approach in
  §4, but not started.

**Currently in progress:** nothing at the moment — the last completed
unit of work was an enhancement-phase pass hardening Employees'
create/edit/documents flows against real edge cases found via deliberate
manual testing (validation gaps, in-flight-request races, duplicate
delete clicks), followed by a broader UI/UX redesign pass (design tokens,
Shell chrome, forms, toasts, tooltips) and the Design System Phase 1/2
rollout described above.

**Still remaining / open roadmap items:**
- Backend **Dockerization**.
- Backend **automated testing strategy** (unit/integration) — the project
  has so far relied on live, manual, real-backend verification rather than
  a test suite.
- Login/Register's design-system migration.
- Dark mode.
- Any further business features are unplanned — the original roadmap is
  complete, so new work here would be a deliberate new initiative, not a
  gap being filled.

---

## 7. Architectural Principles

- **Feature-first development** — a feature's code lives in one
  discoverable folder, not scattered across type-based buckets.
- **One-way dependency direction** — `features → shared → core`, never
  reversed, never feature-to-feature; a shared capability gets promoted
  upward once a second real consumer needs it.
- **Presentation/business-logic separation** — smart components (pages)
  own state and orchestration via a Store; presentational components
  render inputs and emit outputs, with no `HttpClient` or Store of their
  own.
- **Premature-abstraction avoidance** — shared components and generic
  infrastructure are built only once a real, validated second consumer
  exists (`DataTableComponent` waited three features for a genuine
  server-paginated contract to design against); the design system's Phase
  1 is the one recorded, explicitly-approved exception to this rule.
- **Enrichment must never become a dependency** — optional cross-feature
  data (like resolving a user's display name on an employee record)
  improves the experience but its absence or failure must never break the
  feature it decorates; every enrichment path degrades to an honest
  fallback, never a crash.
- **Incremental, phase-gated development** — every feature passes through
  the same eight explicit phases with an approval gate before
  implementation and before commit; no phase is skipped regardless of how
  small the feature seems.
- **Accessibility by default** — built into shared primitives once, so
  every consumer gets correct semantics and keyboard behavior for free.
- **Scalability** — token-driven styling and a layered architecture mean
  systemic changes (a new theme, a new cross-cutting capability) are
  additive, not a rewrite.
- **Maintainability & consistency** — naming conventions are enforced by
  tooling configuration, not just convention, and every architectural or
  visual decision is recorded in a living document at the moment it's
  made, not reconstructed later from memory.

---

## 8. Future Vision

The near-term destination is a fully deployable, fully tested system:
the backend Dockerized and covered by an automated test suite, Login/
Register brought into the same design language as the rest of the app,
and a real dark theme delivered as the token-driven change the design
system was built to make cheap. Beyond that, further business
capability — richer employee management, notifications, reporting, or
whatever the organization needs next — is expected to arrive the same way
everything so far has: one deliberately scoped feature at a time, planned
before it's built, verified live against the real system before it's
called done, and documented so the next engineer never has to
reverse-engineer *why* a decision was made.
