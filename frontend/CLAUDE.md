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
| Routing | Angular Router | ✅ Feature 0 (scaffold only; real routes per-feature) |
| HTTP | Angular `HttpClient`, functional interceptors | ✅ Feature 0 (extension point only) |
| Forms | Typed Reactive Forms (**not** Signal Forms — see blueprint §9) | Introduced per-feature |
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
- [ ] Feature 2+ — Landing Page, Auth, Dashboard, Employees, Users, Account (order TBD)

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
