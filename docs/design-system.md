# Design System

**Status:** Phase 1 (Foundation) and Phase 2 (Application) both complete — every
primitive in §7 is wired into Landing, Dashboard, Account, Users, and Employees
(list/detail/form/documents dialog), verified screen-by-screen in a live browser.
The closing Design Consistency Audit (§11) found and fixed one straggler; see
[`../frontend/CLAUDE.md`](../frontend/CLAUDE.md)'s Progress Log for the full account.
Login/Register intentionally remain outside this rollout (their own established
mat-card/inline-error convention, never part of the approved migration scope) —
noted as known follow-up work, not a defect. See
[`frontend-architecture-blueprint.md`](./frontend-architecture-blueprint.md) §13/§14
for how this relates to the app's Material/Tailwind theming.

This document is the frontend's internal design system: the reusable visual language
every current and future feature inherits from, so a new feature never has to invent a
new heading size, a new card treatment, or a new empty-state layout. It complements the
architecture blueprint rather than replacing it — the blueprint covers *structure*
(layering, routing, state), this document covers *look and feel*.

---

## 1. Design Principles

1. **One visual pattern per problem.** If an existing token or component already solves
   it, reuse it — a new component is justified only when no existing primitive fits,
   not when one is merely inconvenient to reuse.
2. **Border means static, shadow means interactive.** The single rule the whole
   elevation system is built on (§4). Never combine both on the same element — that
   doubles the signal and confuses which one the user should trust.
3. **Tokens are Sass-time, not assumed CSS.** Every color/spacing/radius/elevation/
   typography/motion value lives in `frontend/src/styles/_tokens.scss` as a plain Sass
   variable. Component-scoped SCSS always Sass-interpolates the token
   (`#{tokens.$color-x}`) — never references it via `var(--color-x)` — because Tailwind
   v4 dead-code-eliminates `@theme` custom properties that no scanned utility class in
   the *same* global stylesheet ever uses; component styles live in separate bundled
   chunks the minifier can't see into. This bit the app once already (the redesign
   pass's sidebar/breadcrumb bug) — see blueprint §14. This rule extends to every token
   this document introduces, not just color.
4. **Material's own defaults are the floor, not something to fight.** Dialogs, menus,
   form-field density, and ripple/state-layer behavior all keep Material's M3 defaults.
   Bespoke styling is reserved for the gaps Material intentionally leaves open — page
   chrome, cards, empty/loading/error states, page layout.
5. **Accessibility is default behavior, not a follow-up pass.** Every primitive in this
   document ships with its accessibility behavior built in (§9) — a consumer using it
   correctly gets that behavior for free.

---

## 2. Typography

Eight named roles, defined once in `_tokens.scss` and exposed as real CSS classes in
`frontend/src/styles/_typography.scss` (`.ds-display`, `.ds-h1` … `.ds-overline`).
Applied via a literal class name in a template (`class="ds-h1"`), never via `var()` —
see Principle 3.

| Class | Size | Weight | Line-height | Use |
|---|---|---|---|---|
| `.ds-display` | 34px | 700 | 1.2 | Marketing-scale headline (Landing hero only) |
| `.ds-h1` | 24px | 600 | 1.3 | Page title — `PageHeaderComponent`'s only consumer today |
| `.ds-h2` | 18px | 600 | 1.35 | In-page section title — `SectionHeaderComponent` |
| `.ds-h3` | 15px | 600 | 1.4 | Card/subsection title |
| `.ds-body` | 14px | 400 | 1.55 | Default copy |
| `.ds-caption` | 12.5px | 400 | 1.4 | Secondary/meta text (timestamps, helper text) |
| `.ds-label` | 12px | 600 | 1.3 | Form/field labels |
| `.ds-overline` | 11px | 700 | 1.3, uppercase | Eyebrows, kickers |

Weights are restricted to **400 / 600 / 700** — exactly the Inter static weights loaded
in `index.html` (`Inter:wght@400;500;600;700`) — so the browser never has to
nearest-match or synthesize a weight that isn't actually loaded. (500 stays loaded for
Material's own internal type roles, which use it independently of this scale.)

**Migration rule:** feature pages replace one-off Tailwind text classes
(`text-2xl font-medium`, `text-lg font-medium`, `text-sm`) with the matching `.ds-*`
class as each screen is touched in Phase 2 — never a single bulk find-and-replace
across the app in one commit.

---

## 3. Color Usage

Color itself is unchanged from the redesign pass — this section documents *usage*
rules, not new values. Full palette lives in `_tokens.scss`/`_theme-colors.scss`.

- **Primary** — brand actions (primary buttons, active nav, links), and now the
  `EmptyStateComponent`/`AvatarComponent` fallback tint. Never used for large flat
  background fills outside these contexts.
- **Error / Warning** — `InlineBannerComponent`'s two tones only. There is deliberately
  no `success` inline-banner tone: every success notification is a toast
  (`NotificationService`), never an inline banner, so a third banner tone would be a
  pattern with no real consumer (Principle 1).
- **Neutral ramp** — borders, secondary text, skeleton shimmer. Always the Sass
  token (`tokens.$color-neutral-90` etc.), never a bare Tailwind `border`/`bg-gray-*`
  class — the latter resolves to Tailwind's own default gray, a different value than
  this app's neutral ramp, and was a real, fixed inconsistency (Documents dialog, Landing
  cards, the file-upload dropzone).
- **Icon color hierarchy** — neutral (on-surface-variant) by default; primary-tint
  reserved for empty-state icons, interactive-card leading icons, and the active nav
  item; success/warning/error tints only inside their matching banner, never standalone.
- **Role/status color mapping** — reserved for Phase 2 (role chips) and future status
  indicators; always reuses an existing role (primary/tertiary/success/warning), never
  a newly invented hue.

---

## 4. Elevation & Surface System

One governing rule: **a border means static, a shadow means interactive — never both
on the same element.** Utility classes live in `frontend/src/styles/_surfaces.scss`.

| Class | Background | Border | Shadow | Use |
|---|---|---|---|---|
| *(none — flat)* | canvas (`surface-container`) | none | none | Informational text blocks sitting directly on the page canvas |
| `.surface-card` | `surface-container-low` | `1px solid neutral-90` | none | Static record content — Account, Employee-detail, forms |
| `.surface-card-interactive` | `surface-container-low` | none | `elevation-1`, → `elevation-3` + `translateY(-2px)` on hover/focus-visible | Interactive/clickable cards — Dashboard quick-nav tiles, Landing feature cards |

Dialogs, menus, and the Shell's own hairline chrome (header/sidebar/breadcrumb borders)
are untouched by this system — Material's own M3 defaults are already correct for the
former, and the chrome language is its own separate, already-shipped convention (see
blueprint §13).

**"Card vs. bare canvas" rule** (closes a previously undocumented inconsistency):
record/detail/create/edit pages use `.surface-card`; list/table pages sit bare on the
canvas. See §7's Page Layout Guidelines.

---

## 5. Spacing

Unchanged from the redesign pass — the 4/8/12/16/24/32/48/64 ladder documented in
`_tokens.scss` (`$spacing-unit`), used via Tailwind's numeric utilities (`p-4`, `gap-2`,
…). Named step intent is documented in the token file itself; this document doesn't
duplicate it.

---

## 6. Motion

A small, named set of durations/easings — defined in `_tokens.scss`, applied via the
`motion-safe()` Sass mixin so `prefers-reduced-motion` is never hand-copied per
component.

| Context | Duration | Easing | Notes |
|---|---|---|---|
| Hover/focus state changes | 120ms (`$motion-duration-fast`) | ease-out | Color/background tint changes |
| Card lift (elevation change) | 150ms (`$motion-duration-standard`) | `cubic-bezier(.2,0,0,1)` (`$motion-easing-standard`) | `.surface-card-interactive`'s hover/focus transition |
| Route transitions | 200ms (`$motion-duration-route`) | ease-out | Reserved for Phase 3 — not yet wired to the router |
| Skeleton shimmer | 1.5s | ease-in-out, infinite | `LoadingSkeletonComponent` |
| Dialogs / menus | — | — | Material's own M3 defaults — never overridden |

```scss
@include tokens.motion-safe(
  box-shadow #{tokens.$motion-duration-standard} #{tokens.$motion-easing-standard},
  transform #{tokens.$motion-duration-standard} #{tokens.$motion-easing-standard}
);
```

Under `prefers-reduced-motion: reduce`, `motion-safe()` removes the `transition`
entirely — the state change (color, shadow, transform) still applies, just instantly.
`LoadingSkeletonComponent`'s shimmer `@keyframes` animation is guarded the same way
directly in its own stylesheet (a `transition` mixin doesn't apply to `animation`).

---

## 7. Component Catalog

Every shared, domain-agnostic component lives in
`frontend/src/app/shared/components/<name>/`, following the naming convention already
established in blueprint §10 (`<Purpose>Component`, no domain prefix). Each entry below
follows the same structure: Inputs, Outputs, Content projection, Variant strategy,
Accessibility behavior, Example.

### PageHeaderComponent
- **Inputs:** `title: string` (required), `description?: string`.
- **Outputs:** none.
- **Content projection:** `[pageHeaderActions]` — a permission-gated primary action
  (e.g. "+ New Employee"); omit for pages with no page-level action.
- **Variant strategy:** none — one fixed layout. Breadcrumbs are deliberately **not**
  part of this component: `BreadcrumbsComponent` already owns that globally from the
  Shell, driven by route `data.breadcrumb` (blueprint §3) — duplicating it here would
  fight that mechanism, not extend it. *(This corrects the blueprint's original v1/§9
  description of `PageHeaderComponent` as "title + breadcrumb + action slot" — the
  breadcrumb clause predates the Shell's actual breadcrumb implementation and is
  superseded by it.)*
- **Accessibility:** renders the route's one semantic `<h1>`.
- **Example:**
  ```html
  <app-page-header title="Employees">
    <a pageHeaderActions mat-flat-button color="primary" routerLink="/employees/new">
      <mat-icon>{{ icons.add }}</mat-icon> New Employee
    </a>
  </app-page-header>
  ```

### SectionHeaderComponent
- **Inputs:** `title: string` (required).
- **Outputs:** none.
- **Content projection:** `[sectionHeaderActions]` — an optional trailing link/action
  (e.g. "View all"); omit when there's nothing to link to.
- **Variant strategy:** none.
- **Accessibility:** renders `<h2>` — a page should have exactly one `<h1>` above any
  number of these.
- **Example:** `<app-section-header title="Quick navigation" />`

### InlineBannerComponent
- **Inputs:** `tone: 'error' | 'warning'` (default `'error'`), `message: string`
  (required), `icon?: string` (defaults to a tone-appropriate icon), `showRetry: boolean`
  (default `false`).
- **Outputs:** `retry: void` — emitted on the Retry button click; the button only
  renders when `showRetry` is `true`.
- **Content projection:** none — `message` is a plain string, matching the backend's
  joined-string validation-error contract (blueprint §9); never a projected template.
- **Variant strategy:** `tone` only. No `success` tone — every success notification is
  a toast, never an inline banner (Principle 1/§3).
- **Accessibility:** host renders `role="alert"`; the icon is `aria-hidden`.
- **Example:**
  ```html
  @if (employeeStore.error(); as message) {
    <app-inline-banner tone="error" [message]="message" [showRetry]="true"
                       (retry)="employeeStore.reload()" />
  }
  ```

### EmptyStateComponent
- **Inputs:** `icon: string` (required — no default; the right icon is always
  context-specific), `title: string` (required), `description?: string`.
- **Outputs:** none.
- **Content projection:** `[emptyStateAction]` — an optional primary action (e.g.
  "Add employee"); omit for a purely informational empty state.
- **Variant strategy:** none — one layout for every empty case. A filtered "no
  results" and a true "no data yet" state differ only in their text, not their
  structure.
- **Accessibility:** icon is always `aria-hidden` — decorative, the title carries the
  meaning.
- **Example:**
  ```html
  <app-empty-state [icon]="icons.badge" title="No employees yet"
                    description="Employee records will appear here once you add one.">
    <a emptyStateAction mat-flat-button color="primary" routerLink="/employees/new">
      Add employee
    </a>
  </app-empty-state>
  ```
- **Note:** deferred three times already (Features 3, 5, 6) per the blueprint's
  premature-abstraction principle (§9), until Phase 1 of the design system gave it a
  planned, imminent set of real consumers (Phase 2). See §8's Extensibility Rules for
  how this exception to that principle is meant to be read.

### LoadingSkeletonComponent
- **Inputs:** `variant: 'text' | 'row' | 'card'` (default `'text'`), `count: number`
  (default `1`).
- **Outputs:** none.
- **Content projection:** none — a placeholder shape, nothing to project.
- **Variant strategy:** `text` (single shimmering line), `row` (table-row-shaped, for
  Employees/Users list loading), `card` (one rectangular block, for Dashboard's
  quick-nav grid loading). Full-page/initial-route loads and small async actions
  (save/delete/upload) keep the existing inline-`mat-progress-spinner` convention
  unchanged — this component is specifically for "a list or card grid is about to
  appear."
- **Accessibility:** shimmering segments are `aria-hidden`; a visually-hidden
  `sr-only` "Loading…" text gives one clear screen-reader announcement instead of each
  segment being read individually.
- **Example:**
  ```html
  @if (employeeStore.loading()) {
    <app-loading-skeleton variant="row" [count]="5" />
  } @else {
    <app-employee-table ... />
  }
  ```

### AvatarComponent
- **Inputs:** `imageUrl?: string`, `name?: string` (source for initials + accessible
  label), `size: 'sm' | 'md'` (default `'md'`: 32px/64px — the two sizes this app
  actually needs today, inline/table and profile-page contexts).
- **Outputs:** none.
- **Content projection:** none.
- **Variant strategy:** `size` only. Falls back image → initials → icon.
- **Accessibility:** an image gets `alt="Profile picture for {name}"`; the
  initials/icon fallback puts `role="img"` + `aria-label` on the host instead, since
  neither the initials text nor the icon should be read literally.
- **Example:** `<app-avatar [imageUrl]="user.profileImageUrl" [name]="user.name" size="md" />`

### Existing components (unchanged, documented here for completeness)
`DataTableComponent`, `ConfirmDialogComponent`, and `FileUploadComponent` predate this
design system and already satisfy its acceptance criteria (§9) — see blueprint §9/§11
for their own contracts. Phase 2 updates their *styling* (row hover, drag-over state)
without changing their APIs.

---

## 8. Extensibility Rules

How a future feature (or future you) should extend this system rather than quietly
growing a parallel one:

1. **Reuse before you build.** Before adding new markup for a title, a banner, an
   empty list, a loading placeholder, an avatar, or a card, check this catalog first.
   If an existing primitive's *contract* fits — even if its default styling needs a
   size/tone variant — extend that component, don't hand-roll new markup next to it.
2. **A new variant is cheaper than a new component.** If a real need doesn't fit an
   existing primitive, prefer adding a variant (a new `tone`/`size`/`variant` input
   value) over building a sibling component. Only build a new shared component when
   the *shape* of the problem is genuinely different (this is exactly the reasoning
   that kept `UserTableComponent` and `DataTableComponent` separate — blueprint §9).
3. **New tokens follow Principle 3, always.** Any new spacing/color/type/motion value
   goes into `_tokens.scss` as a Sass variable first; component SCSS Sass-interpolates
   it. Never introduce a second, parallel token source.
4. **The premature-abstraction principle still applies — with one recorded
   exception.** Blueprint §9 built every prior shared component only once a real
   consumer existed; this design system's Phase 1 deliberately builds six components
   *before* any consumer, because a coherent visual language was the explicit,
   user-approved goal (see blueprint's forthcoming revision entry). That exception is
   scoped to this one Phase 1/Phase 2 rollout — it is not a general license to build
   speculative components going forward. Once Phase 2 lands, the standing rule reverts
   to "real consumer first."
5. **Document before you ship.** Any new shared component gets an entry in §7 of this
   document, in the same Inputs/Outputs/Content-projection/Variant-strategy/
   Accessibility/Example format, in the same commit that adds the component — not as a
   follow-up.

---

## 9. Component Acceptance Criteria

Every shared component in `shared/components/` — new or existing — must satisfy all
seven before it's considered done:

| Criterion | What it means here |
|---|---|
| **Responsive** | Works from mobile width up; no fixed pixel widths that overflow a narrow viewport (`AvatarComponent`'s fixed sizes are the deliberate exception — an avatar's size is a design choice, not a layout accident). |
| **Accessible** | Correct semantic element, `aria-*` attributes, and keyboard operability out of the box — a consumer using the component's public API correctly gets this for free, per Design Principle 5. |
| **Theme-aware** | Colors/spacing/type come from `_tokens.scss` (directly or via `--mat-sys-*`), never a hardcoded hex or px value invented in the component. |
| **Token-driven** | Every visual value traces to a named token — this is what makes a future dark-mode pass (roadmap Phase 4) a token-level change instead of a per-component rewrite. |
| **Reusable** | Zero feature-specific business logic or copy baked in — `EmptyStateComponent` doesn't know what "no employees" means, its caller tells it. |
| **Fully documented** | Has a §7 catalog entry in this document and a class-level doc comment in its own `.ts` file, in the same Inputs/Outputs/Content-projection/Variant-strategy/Accessibility/Example format. |
| **No feature-specific business logic** | No `HttpClient`, `Store`, or feature-model import — presentational only, matching `FileUploadComponent`/`DataTableComponent`'s existing precedent (blueprint §9). |

---

## 10. Do's and Don'ts

**Do**
- Use `.ds-*` typography classes for every new heading/label; use `PageHeaderComponent`
  for every routed page's title.
- Use `.surface-card` for static record content, `.surface-card-interactive` for
  anything clickable — never both border and shadow on the same element.
- Use `InlineBannerComponent` for every inline error/warning; use
  `NotificationService`'s toasts for success.
- Use `EmptyStateComponent` for every "nothing to show" case that isn't a loading or
  error state.
- Sass-interpolate every token in component-scoped SCSS (`#{tokens.$x}`).

**Don't**
- Don't invent a one-off heading size, border color, or spacing value "just this once"
  — add it to `_tokens.scss` if it's genuinely new, or reuse what exists if it isn't.
- Don't reference a design token via `var(--color-x)`/`var(--radius-x)` from
  component-scoped SCSS — see Principle 3.
- Don't add a `success` tone to `InlineBannerComponent`, or any other variant with no
  real consumer — see Extensibility Rule 2.
- Don't put feature/business logic inside a `shared/components/` component.
- Don't override Material's own dialog/menu motion or elevation — it's already correct.

---

## 11. Design Consistency Review

At the end of Phase 2 (once every screen has adopted these primitives), a final pass
verifies there are no remaining exceptions: every page title uses `PageHeaderComponent`,
every card follows the border-vs-shadow rule, every empty/loading/error state uses the
shared components, and no screen still carries a one-off Tailwind text class this
system was meant to replace. Findings and fixes from that pass are recorded in
`frontend/CLAUDE.md`'s Progress Log, the same way every other feature's verification
work has been recorded all along.
