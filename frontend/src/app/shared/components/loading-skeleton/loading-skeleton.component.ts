import { Component, input } from '@angular/core';

/**
 * Design-system primitive (docs/design-system.md) — replaces the bare
 * `mat-progress-spinner` used for every list/table loading state today with a
 * content-shaped placeholder. Full-page/initial-route loads and small async actions
 * (save/delete/upload) keep using the existing inline-spinner convention unchanged —
 * this component is specifically for "a list or card grid is about to appear."
 *
 * API
 * - Inputs: `variant` (`'text' | 'row' | 'card'`, default `'text'`), `count` (how many
 *   placeholder instances to stack, default `1`).
 * - Content projection: none — purely a placeholder shape, nothing to project.
 * - Variants: `text` (a single shimmering line, e.g. inside a card mid-load), `row`
 *   (table-row-shaped, several segments — Employees/Users list loading), `card`
 *   (one rectangular block — Dashboard's quick-nav grid loading).
 * - Accessibility: the shimmering segments are `aria-hidden`; a visually-hidden
 *   "Loading…" text (Tailwind's `sr-only`) gives screen readers one clear
 *   announcement instead of reading each placeholder segment individually.
 *
 * Example
 * ```html
 * @if (employeeStore.loading()) {
 *   <app-loading-skeleton variant="row" [count]="5" />
 * } @else {
 *   <app-employee-table ... />
 * }
 * ```
 */
@Component({
  selector: 'app-loading-skeleton',
  imports: [],
  templateUrl: './loading-skeleton.component.html',
  styleUrl: './loading-skeleton.component.scss',
})
export class LoadingSkeletonComponent {
  readonly variant = input<'text' | 'row' | 'card'>('text');
  readonly count = input(1);

  protected readonly instances = (count: number): unknown[] => Array.from({ length: count });
}
