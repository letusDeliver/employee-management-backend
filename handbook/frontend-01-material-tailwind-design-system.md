# Frontend Chapter 1 — Angular Material, Tailwind CSS & the Design System

## Theory

Every enterprise Angular app eventually needs an answer to "where does a
color/spacing/radius value live, and who's allowed to change it?" Get
this wrong and a project ends up with the classic anti-pattern: dozens
of components each hand-rolling slightly different blues, paddings, and
border-radii, none of them able to change consistently because none of
them share a source. This chapter builds the answer before a single
business feature exists to tempt that shortcut.

The design splits two concerns that are easy to conflate:

- **Material** owns *components* — buttons, form fields, tables — and
  the Material 3 (M3) design system's color/typography/density rules
  that make them look coherent with each other.
- **Tailwind** owns *layout* — the space between components, responsive
  breakpoints, one-off styling on bespoke (non-Material) elements.

Enterprise teams that skip this split usually end up either fighting
Material's own internal spacing with Tailwind utilities inside a
`mat-card`, or reinventing Tailwind's responsive/layout primitives in
hand-written SCSS. The blueprint (§13/§14) draws the line explicitly so
neither system encroaches on the other's territory.

## Architecture

This chapter is the physical realization of
[`docs/frontend-architecture-blueprint.md`](../docs/frontend-architecture-blueprint.md)
§13 (Material Design Strategy) and §14 (Styling Strategy) — the
blueprint had already decided *what* the rules should be; this feature's
job was to build a real, compiling, verified structure that satisfies
them. Two architectural decisions were made live, during Implementation,
that the blueprint didn't (and couldn't) specify in advance:

- **Custom M3 palette generation.** The blueprint calls for a "custom"
  theme; Angular Material's `ng add` schematic only offers 4 fixed
  palette pairs (azure-blue, rose-red, magenta-violet, cyan-orange) —
  there's no "give me an arbitrary seed color" option in that flow.
  The real mechanism turned out to be a *separate* schematic,
  `ng generate @angular/material:m3-theme`, which runs Google's Material
  Color Utilities (the HCT color-space algorithm used by Android's
  Material You) against one seed hex and produces a genuine, full tonal
  palette (every M3 tone stop, 0–100). Found by reading the real
  installed package's `schematics/collection.json`, not assumed from
  general Material knowledge.
- **The token/Tailwind bridge, without a CSS cycle.** The blueprint asks
  for "one palette, two consumers" — Material's theme and Tailwind's
  config reading the same values. The naive approach (a `_tokens.scss`
  `:root` block defining `--color-primary`, and Tailwind's `@theme`
  block *also* defining `--color-primary: var(--color-primary)`) is a
  genuine CSS custom-property cycle per spec — not a style nitpick, a
  guaranteed-invalid computed value, silently rendering transparent.
  The fix: `_tokens.scss` holds **Sass variables**, not a second runtime
  CSS layer, so the `@theme` block is the *only* place these custom
  property names get defined at runtime.

## Folder Structure

```
frontend/src/
├── styles/
│   ├── _theme-colors.scss    # GENERATED — ng generate @angular/material:m3-theme
│   ├── _material-theme.scss  # mat.theme(): color (from _theme-colors), typography, density
│   └── _tokens.scss          # Sass variables: semantic color aliases + spacing/radius/elevation
├── styles.scss                # composition root: @use theme + tokens, Tailwind @import + @theme
├── index.html                 # Roboto + Material Symbols Outlined font links
└── app/shared/
    └── icon-names.ts          # frozen ICON_NAMES object, empty until a feature needs one
```

`_theme-colors.scss` is machine-generated and carries its own "proceed
with caution" header — it's regenerated (via the same CLI command, with
a new `--primary-color`), never hand-edited, if the brand color ever
changes.

## Angular Concepts Used

- **`@angular/build:application`'s PostCSS auto-discovery** — the
  esbuild-based builder (already in use since Feature 0) picks up a
  `postcss.config.json` at the project root with zero `angular.json`
  changes. Verified by reading the builder's own bundled
  `postcss-configuration.js` before relying on it, since the older
  webpack-based builder required manual wiring and it would have been
  easy to assume that still applied.
- **Schematics beyond `ng add`** — `ng generate @angular/material:m3-theme`
  is a real, documented Material schematic most teams never discover
  because `ng add`'s interactive prompt doesn't mention it. Confirmed by
  reading `schematics/collection.json` in the actual installed package.
- **Angular CLI budgets** (`angular.json`) — the existing 500 kB
  warning / 1 MB error initial budget was checked, not assumed safe,
  after adding Material + Tailwind; the production build landed at
  330.49 kB raw / 83.90 kB estimated transfer, comfortably inside it.

## RxJS Concepts Used

None — this feature has no asynchronous data flow. Still not applicable,
same as Chapter 0.

## Signals Used

None — no new component state. The temporary verification markup added
to `app.component` (a smoke-test `<button mat-flat-button>` styled with
Tailwind utility classes) was reverted before commit; it used no signals
and left no trace in the final diff.

## Reactive Forms Concepts

None — no forms exist yet.

## Material Components Used

`MatButtonModule` and `MatIconModule` were imported *temporarily*, in
`app.component`, purely to render one real button + icon during manual
verification (confirming the custom theme's color, the compact density,
and the Material Symbols font all actually apply) — then reverted. No
Material component ships in this feature's real diff; the first genuine
consumer is whichever feature builds the first real UI.

## Routing

Not applicable — no new routes.

## State Management

Not applicable — no new Store.

## The Design Token Bridge, in Detail

This is the one genuinely new mechanism this chapter introduces, worth
spelling out precisely since it's easy to get subtly wrong:

1. `_theme-colors.scss` (generated) defines `$primary-palette` /
   `$tertiary-palette` — full M3 tonal-palette Sass maps.
2. `_material-theme.scss` feeds those into `mat.theme()`, which emits
   real CSS custom properties at runtime: `--mat-sys-primary`,
   `--mat-sys-on-primary`, `--mat-sys-error` (M3's name for "warn"),
   etc. — confirmed by reading Material's actual
   `core/tokens/m3/_md-sys-color.scss`, which lists every role name M3
   generates, rather than guessing which fixed keys exist.
3. `_tokens.scss` aliases these to semantic **Sass variables**
   (`$color-primary: var(--mat-sys-primary)`, `$color-warn:
   var(--mat-sys-error)`, ...) plus genuinely new values Material
   doesn't provide (spacing unit, radii, elevation shadows).
4. `styles.scss`'s `@theme` block interpolates those Sass variables into
   Tailwind's reserved namespaces (`--color-*`, `--spacing`, `--radius-*`,
   `--shadow-*`) — this is the *only* place these exact custom-property
   names are defined at runtime, avoiding the self-reference cycle a
   naive two-layer design would hit.

Net effect: change the seed color once (regenerate
`_theme-colors.scss`), and both `<button mat-flat-button>` and
`<div class="bg-primary">` repaint identically, with zero risk of the
two systems drifting apart.

## Best Practices

- Ran `ng add @angular/material` purely as a **scaffold** step (package
  installation, font wiring, theme-block shape) — never trusted its
  default canned palette as the real theme, since the blueprint requires
  a genuinely custom one.
- Verified the real Sass API (`define-theme()`'s expected `primary`/
  `tertiary` shape) by reading Material's actual installed
  `core/theming/_definition.scss` before writing `_material-theme.scss`,
  rather than assuming a remembered API surface.
- Picked the global density value (`-2`) by grepping every
  `clamp-density()` call site across Material's real component set,
  choosing the tightest floor found (chips, at `-2`) — guaranteeing
  every component honors the same compact setting instead of some
  components silently clamping to a looser value.
- Verified every claim against the real compiled build output, not the
  source alone: inspected `dist/frontend/browser/styles-*.css` directly
  to confirm `--mat-sys-primary` resolved to the expected generated
  shade, that Tailwind's `.bg-primary`/`.rounded-md`/`.shadow-elevation-2`
  utilities were actually emitted (not just present in `theme.css`
  unprocessed), and that the compact density measurably shrank a real
  component metric (`--mat-button-filled-container-height`).
- Used a temporary, throwaway smoke-test component addition for manual
  verification, then reverted it — keeping the feature's actual diff
  scoped to design-system files only, per the "keep commits small, never
  bundle unrelated changes" rule.

## Common Mistakes

- **Assuming `ng add`'s 4 canned palettes are the only option.** The
  real per-seed-color generator (`ng generate @angular/material:m3-theme`)
  is a separate, easy-to-miss schematic — teams that don't know it
  exists either settle for a canned palette or hand-roll M3 tone maps
  themselves.
- **Defining the same custom-property name in two places, one pointing
  at the other.** `--color-primary: var(--color-primary)` looks
  harmless in isolation but is a real CSS cycle per spec whenever two
  rules both claim that exact property name — worth knowing as a
  category of bug, not just a Tailwind-specific gotcha.
- **Assuming Tailwind v4's spacing scale is a named map.** It's a
  *single* base multiplier (`--spacing`, default `0.25rem`) that numeric
  utilities (`p-4`, `gap-2`) scale against — not `--spacing-sm`/
  `--spacing-md` keyed entries like the older v3 config-object model. A
  named-key design would have silently failed to generate the intended
  utilities.
- **Trusting the font link `ng add` writes by default.** It wires the
  legacy "Material Icons" ligature font, not "Material Symbols" — a
  real, easy-to-miss discrepancy against any blueprint that specifies
  Symbols, since both fonts work with `<mat-icon>` and the difference is
  only visible by inspecting the actual `<link>` tag or comparing
  rendered glyph styles.

## Performance Notes

Production bundle: 330.49 kB raw / 83.90 kB estimated transfer (up from
Feature 0's 232.43 kB / 63.23 kB baseline), still comfortably inside the
CLI's 500 kB warning / 1 MB error budget — no budget change needed.
Tailwind v4's JIT engine only generates utilities actually referenced in
templates, so this weight is overwhelmingly Material's own component
theme tokens/typography scale, not unused Tailwind output.

## Accessibility Notes

- Material's M3 palettes are contrast-checked by construction at every
  tone stop; the custom palette generated here inherits that guarantee
  since it went through the same official HCT generation path, not a
  hand-picked set of hex values.
- Manually confirmed keyboard focus visibility survives Tailwind's
  Preflight reset (a real risk — Preflight resets many browser
  default styles) by tabbing through the temporary verification button
  before reverting it.
- Material Symbols Outlined (not the legacy Icons font) is now the
  project's one icon font, consistent with the blueprint's `icon-names.ts`
  convention for every future icon reference.

## Security Notes

Nothing new — this feature ships no new HTTP calls, forms, or
user input handling. `npm audit` after installing Tailwind + PostCSS
still reports the same 3 moderate-severity, dev-tooling-only advisories
already recorded in Feature 0's baseline (the `@hono/node-server`
Windows path-traversal chain via `@angular/cli`'s bundled MCP support) —
no new advisories introduced by Material or Tailwind.

## A Real Discrepancy Found During This Feature

Two, both caught by reading real source before relying on it rather than
trusting general framework knowledge:

1. **`ng add`'s font link is wrong for this project.** It wires
   `family=Material+Icons` (the legacy ligature-text icon font); the
   blueprint mandates Material Symbols. Fixed by replacing the link with
   `family=Material+Symbols+Outlined` in `index.html`, and confirmed in
   the actual compiled output that the Symbols `@font-face` rule (not
   Icons) is what ships.
2. **The `--directory` option on `ng generate @angular/material:m3-theme`
   doesn't create the target folder.** Requesting `src/styles` when that
   folder didn't exist yet produced a flat file at
   `src/styles_theme-colors.scss` (directory + filename concatenated
   without a path separator) instead of `src/styles/_theme-colors.scss`.
   Caught immediately after running the command by checking where the
   file actually landed, then relocated by hand into the intended
   `styles/` folder.

## Interview Questions

- **Q: Why does Angular Material ship two different theme-generation
  flows (`ng add`'s prompt vs. `ng generate @angular/material:m3-theme`)?**
  A: `ng add`'s prompt optimizes for a 30-second happy path — pick one of
  4 pre-vetted palette pairs and move on. The M3 seed-color generator
  exists for teams with an actual brand color, running the real HCT
  algorithm to produce a full tonal palette from it. Most tutorials only
  cover the first because it's what the interactive prompt surfaces.
- **Q: What makes `--color-primary: var(--color-primary)` invalid CSS,
  and how would you actually detect it?** A: Per the CSS Custom
  Properties spec, a property that references itself in its own
  cascaded value — even indirectly — contains a cycle, and the browser
  treats it as guaranteed-invalid at computed-value time, typically
  falling back to the property's initial value. It's easy to introduce
  by accident whenever two separate stylesheets/layers both claim the
  same custom-property name with one aliasing "itself." Detecting it in
  practice means inspecting the actual computed value in DevTools (it'll
  show as unset/transparent) — static analysis of the source alone won't
  catch it if the two conflicting declarations live in different files.
- **Q: How is Tailwind v4's spacing scale different from Tailwind v3's?**
  A: v3 configured a keyed spacing object (`theme.spacing = { sm: ...,
  md: ... }`) in a JS config file. v4 is CSS-first: a single `--spacing`
  base value multiplies against a utility's numeric suffix (`p-4` = 4 ×
  `--spacing`). Named entries are still possible for genuinely distinct
  values, but the default numeric scale is generated from one number,
  not a lookup table.
- **Q: Why pick the *tightest* component's density floor as the global
  density setting, rather than the loosest?** A: Material's
  `clamp-density()` silently truncates an out-of-range density request
  to whatever that specific component supports. Choosing a value looser
  than the tightest component (e.g. `-4` when chips only go to `-2`)
  would mean chips silently render less compact than every other
  component, with no error — an inconsistency that's invisible until
  someone visually compares two components side by side. The tightest
  floor is the only value guaranteed to apply uniformly.
- **Q: Why generate `_theme-colors.scss` via a schematic instead of
  hand-writing the tonal palette?** A: The values are the output of
  Google's HCT (Hue-Chroma-Tone) perceptual color-space algorithm, which
  computes 16 tone stops per palette (with WCAG-aware contrast
  relationships already baked in) from one seed color. Hand-picking 16
  coordinated hex values per palette without that algorithm would be
  slow and very likely to violate M3's contrast guarantees somewhere.

## Key Takeaways

- A framework's "obvious" flow (`ng add`'s canned-palette prompt) is
  sometimes not the flow a specific requirement (a custom brand color)
  actually needs — it's worth checking the tool's full schematic
  collection before concluding a requirement can't be met natively.
- Bridging two styling systems around "one source of truth" sounds
  simple in a sentence and hides a real, spec-level footgun (the CSS
  custom-property self-reference cycle) the moment both systems are
  allowed to define the same variable name independently. Sass variables
  as the shared source, with exactly one runtime definition point,
  sidesteps it entirely.
- Verifying against the actual compiled build output — not just reading
  source and reasoning about it — caught nothing wrong here, but was the
  only way to be certain of that; for a feature entirely about "do these
  two systems actually talk to each other correctly," inspecting real
  generated CSS is the real test, not a stand-in for one.
