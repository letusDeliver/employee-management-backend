import { Component, input } from '@angular/core';

/**
 * Design-system primitive (docs/design-system.md) — the one page-title pattern every
 * feature page uses instead of a copy-pasted `<h1 class="text-2xl font-medium mb-4">`.
 * Breadcrumbs are deliberately not part of this component: `BreadcrumbsComponent`
 * already owns that responsibility globally from the Shell, driven by route
 * `data.breadcrumb` — duplicating it here would fight that mechanism, not extend it.
 *
 * API
 * - Inputs: `title` (required), `description` (optional, one line of supporting copy).
 * - Content projection: project a primary action (e.g. a permission-gated
 *   "+ New Employee" button) into `[pageHeaderActions]`; omit it for pages with no
 *   page-level action.
 * - Variants: none — deliberately a single fixed layout; a page needing something
 *   different isn't a page header anymore.
 * - Accessibility: renders the one semantic `<h1>` for the route.
 *
 * Example
 * ```html
 * <app-page-header title="Employees">
 *   <a pageHeaderActions mat-flat-button color="primary" routerLink="/employees/new">
 *     <mat-icon>{{ icons.add }}</mat-icon> New Employee
 *   </a>
 * </app-page-header>
 * ```
 */
@Component({
  selector: 'app-page-header',
  imports: [],
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly description = input<string>();
}
