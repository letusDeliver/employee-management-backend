import { Component, input } from '@angular/core';

/**
 * Design-system primitive (docs/design-system.md) — a smaller sibling of
 * `PageHeaderComponent` for in-page subsections (e.g. Dashboard's "Quick navigation").
 *
 * API
 * - Inputs: `title` (required).
 * - Content projection: an optional trailing link/action into `[sectionHeaderActions]`
 *   (e.g. a "View all" link); omit it when the section has nothing to link to.
 * - Variants: none.
 * - Accessibility: renders an `<h2>` — a page should have exactly one `<h1>`
 *   (from `PageHeaderComponent`) above any number of these.
 *
 * Example
 * ```html
 * <app-section-header title="Quick navigation" />
 * ```
 */
@Component({
  selector: 'app-section-header',
  imports: [],
  templateUrl: './section-header.component.html',
  styleUrl: './section-header.component.scss',
})
export class SectionHeaderComponent {
  readonly title = input.required<string>();
}
