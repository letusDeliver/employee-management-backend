# Frontend Chapter 0 — Angular Project Initialization

## Theory

Every application needs a foundation before it needs features. This
chapter covers the Angular equivalent of the backend's own Chapter 1
(Project Setup & Folder Structure): a real, buildable Angular workspace
with the tooling decisions made deliberately up front, and nothing
user-facing yet. The business value is entirely indirect — every
foundational decision made correctly here (strict TypeScript,
standalone components, a real folder architecture) is a decision every
future feature inherits for free; every one made carelessly is a tax
paid repeatedly, once per file, for the life of the project.

Enterprise Angular teams almost universally scaffold via the Angular
CLI rather than a hand-rolled build config — the CLI's esbuild-based
pipeline (default since Angular 17) is what the whole ecosystem
(Material, DevTools, `ng update`) assumes, and diverging from it is a
maintenance tax with no offsetting benefit for a standard business
application.

## Architecture

This chapter is the physical realization of
[`docs/frontend-architecture-blueprint.md`](../docs/frontend-architecture-blueprint.md)
§2 (Folder Structure) and §12 (Core Layer) — nothing architectural was
decided here that the blueprint hadn't already decided; this feature's
job was to give those decisions a real, compiling home. See the
blueprint for the full architecture; this chapter only covers what
Feature 0 actually built.

## Folder Structure

```
frontend/src/app/
├── app.component.ts, app.config.ts, app.routes.ts   # bootstrap shell only
├── core/
│   ├── auth/, http/, error-handling/, logging/       # empty, category-level (.gitkeep)
│   └── config/api-base-url.token.ts                  # the one piece of core/ with real content
├── shared/{components,directives,pipes,validators,models,utils}/  # empty, category-level
├── layout/{public-layout,shell}/                     # empty, category-level
└── features/                                         # empty — features arrive one at a time
```

Folders were created **at category granularity only** — mirroring the
backend's own Chapter 1 precedent, which scaffolded `middlewares/`,
`errors/`, `utils/` as empty categories but never pre-created individual
error-class stub files. Individual future components
(`shared/components/data-table/`, `features/employees/`, etc.) are not
pre-created; they arrive with whichever feature first needs them.

## Angular Concepts Used

- **Standalone APIs** (`--standalone`, Angular's default since v19) — no
  `AppModule`/`SharedModule`; every component declares its own
  `imports`.
- **`ApplicationConfig`** (`app.config.ts`) — the standalone replacement
  for `AppModule`'s `providers` array; holds
  `provideBrowserGlobalErrorListeners()`, `provideRouter(routes)`, and
  the newly added `provideHttpClient(withInterceptors([]))`.
- **`InjectionToken` with a self-providing factory** — `API_BASE_URL`
  (`providedIn: 'root'`, `factory: () => environment.apiBaseUrl`) needs
  no manual entry in `app.config.ts`'s `providers` array and is still
  fully overridable in tests via Angular's standard DI override
  mechanisms.
- **Angular CLI schematics configuration** (`angular.json`'s
  `schematics` block) — `addTypeToClassName: true` for
  component/directive/service schematics, a real, persisted setting
  that makes every future `ng generate` respect this project's naming
  convention automatically.
- **`fileReplacements`** (`angular.json`'s `development` build
  configuration) — Angular's build-time mechanism for swapping
  `environment.ts` for `environment.development.ts`; there's no browser
  equivalent of Node's `process.env`, so this is the correct place for
  environment-specific config, not a runtime service.

## RxJS Concepts Used

None yet. `HttpClient` (wired via `provideHttpClient`) returns
`Observable`s by contract, but nothing calls it yet — no service exists
to consume the stream. RxJS becomes relevant starting with whichever
feature makes its first real HTTP call.

## Signals Used

None yet, beyond the CLI's own default `app.component.ts`, which uses a
`signal()` purely for the demo `title` property in the generated
template (not application logic). The first real Store (a
signal-based feature-state service, **not** NgRx — see blueprint §6)
arrives with the first real feature.

## Reactive Forms Concepts

None yet — no forms exist. The blueprint (§9) already commits to Typed
Reactive Forms, explicitly not Signal Forms, for when a feature actually
needs one.

## Material Components Used

None — Angular Material is deliberately deferred to Feature 1, per the
approved Feature 0/Feature 1 split. This app currently has zero UI
components beyond the CLI's own default template.

## Routing

`app.routes.ts` exists but is intentionally near-empty
(`export const routes: Routes = [];`) — proving the router is correctly
wired into `provideRouter(routes)` and that the app boots, nothing more.
The full route tree from blueprint §5 (public layout, shell layout,
guards) needs components and a `SessionStore` that don't exist yet.

## State Management

Not applicable — there is no signal-based Store anywhere yet, and
nothing to manage in an app with no data.

## Best Practices

- Every `ng new` flag chosen deliberately (see cURL-equivalent command
  in the Feature 0 Progress Log entry in `frontend/CLAUDE.md`), not left
  to interactive prompts.
- Baseline verified (`ng serve` boots, real HTTP `200`) **before** any
  further edits — establishing a known-good starting point before
  layering configuration changes on top of it.
- `environment.ts`/`environment.development.ts` hold exactly one real
  value each (`apiBaseUrl`) and nothing secret — mirroring the
  backend's own `env.js`-is-the-only-reader discipline via the
  `API_BASE_URL` token.
- Dependency baseline (`npm audit`/`npm outdated`) captured and recorded
  immediately, with no reflexive upgrades applied — a snapshot, not an
  action, per explicit instruction.

## Common Mistakes

- Accepting `ng new`'s interactive defaults without reading them — in
  this exact Angular version, that would have meant silently losing the
  `Component`/`Service`/`Directive` class-name suffix convention (see
  below) without ever noticing.
- Assuming a CLI flag like `--file-name-style-guide=2016` restores the
  *class* name too — verified live that it only restores the *file*
  name; the class-name behavior is controlled by a completely separate,
  persisted `angular.json` setting (`addTypeToClassName`).
- Forgetting that `ng new` no longer scaffolds `src/environments/` by
  default (a real, recent CLI change) and hand-rolling a config service
  instead of using the still-available `ng generate environments`
  schematic, which correctly wires the `fileReplacements` build
  configuration for you.
- Writing an unanchored `.gitignore` rule like `.vscode/` at a monorepo
  root — it matches at every directory depth and can silently block a
  subproject's own deliberate file-level negations (exactly what
  happened here — see Common Mistakes → real bug, below).

## Performance Notes

Nothing measurable yet. The production bundle is entirely Angular's own
framework baseline (232.43 kB raw / 63.23 kB estimated transfer),
comfortably inside the CLI's default budgets. Every performance
strategy in blueprint §16 (lazy loading, `@defer`, `OnPush`, image
optimization) applies starting with the first real feature, not this
one.

## Accessibility Notes

`index.html`'s `<html lang="en">` and viewport meta tag were already
correct by CLI default; `<title>` was the generic "Frontend" placeholder
and was corrected to "Employee Management System" — small, easy to
forget once real features exist to distract from it. `@angular-eslint`'s
bundled `templateAccessibility` lint configuration is active from this
very first commit, catching template-level a11y issues automatically
before a single real template exists to violate them.

## Security Notes

- The access-token-in-memory / refresh-token-in-httpOnly-cookie split
  (blueprint §7) isn't built yet, but the groundwork that supports it
  — the empty `provideHttpClient(withInterceptors([]))` array — is
  already in place as a pure extension point.
- `environment.ts`/`environment.development.ts` hold zero secrets by
  design — only a public API base URL, which is visible in every
  network request anyway and carries no confidentiality requirement.
- `npm audit` surfaced 3 moderate-severity advisories, all in a
  **dev-tooling-only** dependency chain (`@angular/cli`'s new bundled
  MCP-server support → `@hono/node-server`, a Windows path-traversal
  issue) — `@angular/cli` is a devDependency, so nothing here ships in
  the built application. Recorded, not fixed, since the suggested fix
  would itself regress the pinned CLI version.

## A Real Bug Found During This Feature

Not a code bug — a **git configuration bug**, caught by verification,
not code review. The repository root's `.gitignore` (added during the
earlier monorepo restructuring) contained an unanchored `.vscode/`
rule. Git's ignore semantics mean an unanchored pattern like this
matches `.vscode/` at *every* directory depth — including
`frontend/.vscode/` — and once a directory is ignored at that level,
git won't even descend into it to honor a nested `.gitignore`'s `!`
negations. The practical effect: `frontend/.gitignore`'s deliberate
`!.vscode/tasks.json`-style rules (which exist specifically to keep
Angular's CLI-recommended `tasks.json`/`launch.json`/`extensions.json`/
`mcp.json` tracked) were silently overridden, and those files would have
been permanently excluded from every future commit without a single
error or warning.

Caught by dry-running `git add -n frontend/` and noticing the
`.vscode/*.json` files were missing from the expected staged list, then
confirmed definitively with `git check-ignore -v`. Fixed by anchoring
the root rule to `/.vscode/` and `/.idea/` (repo-root-scoped only),
letting each subproject own its own editor-file policy via its own
`.gitignore`. `backend/` has no `.vscode/` folder today, so the fix had
no visible effect there — only on `frontend/`, where it mattered.

## Interview Questions

- **Q: Why standalone components instead of NgModules for a new
  project in 2026?** A: Standalone has been Angular's own recommended
  default since v19 — less boilerplate, a clearer per-component
  dependency graph, and NgModules are the path the ecosystem is
  actively moving away from. Starting a new app on them today means
  starting behind, with no compensating benefit for a standard business
  app.
- **Q: How does `angular.json`'s `addTypeToClassName` setting differ
  from the `--file-name-style-guide` CLI flag?** A: They control two
  independent things. `--file-name-style-guide` only affects the
  *file's* name (`app.component.ts` vs. `app.ts`). `addTypeToClassName`
  is a separate, persisted schematics setting controlling whether the
  generated *class* gets a `Component`/`Service`/`Directive` suffix at
  all — verified live that even the traditional file-naming flag alone
  produces a suffix-less class name unless this second setting is also
  set.
- **Q: Why was SSR declined for this application?** A: SSR earns its
  keep for public, SEO-sensitive, first-paint-critical sites. This is
  an authenticated internal HR tool behind a login wall — nothing for a
  crawler to index — so SSR would add real complexity (server-safe
  code, hydration bugs, environment differences) with no benefit this
  application can structurally use.
- **Q: Why is `environment.ts` used as-is for production instead of a
  `environment.production.ts` file?** A: This is Angular's own current
  `ng generate environments` convention — `environment.ts` is the base/
  default file, and only the `development` build configuration gets a
  `fileReplacements` override (`environment.development.ts`). Adopting
  the CLI's real, current convention was preferred over fighting it to
  match an earlier illustrative example, and the blueprint was updated
  with a dated, explicit revision note rather than a silent edit.
- **Q: Why does the HTTP interceptors array start empty instead of
  omitting `provideHttpClient` entirely until it's needed?** A: The
  extension point is registered now so `authInterceptor`/
  `refreshInterceptor`/`errorInterceptor` can be added later as pure
  additions to that array — never a restructuring of `app.config.ts`
  itself once real features depend on it.

## Key Takeaways

- Scaffolding "just" a project is still a real feature with real
  decisions, real risks, and real bugs to find — this session caught
  two genuine, non-obvious issues (the class-naming default, and the
  `.gitignore` anchoring bug) purely by verifying against the real tool
  and the real git state instead of assuming either would behave as
  expected.
- A framework's own new defaults are worth checking explicitly before
  every major scaffold — they can silently conflict with an
  already-approved architectural decision in ways that are easy to miss
  until a much later, more expensive moment.
- "Not applicable yet" is a legitimate, honest answer for most of a
  scaffolding feature's architecture sections — stating it explicitly,
  per section, is more valuable than silently omitting sections that
  don't yet apply.
