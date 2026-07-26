import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Design-system primitive (docs/design-system.md) — deferred three times across
 * Features 3, 5, and 6 per the blueprint's premature-abstraction principle (§9) until a
 * real, validated empty-list case existed; built now as part of the design-system
 * Phase 1 foundation, with Employees' "no results" and Dashboard's reserved "More"
 * region as its first real consumers (wired in Phase 2).
 *
 * API
 * - Inputs: `icon` (required — the caller supplies a Material icon name; there is no
 *   default, since the right icon is always context-specific), `title` (required),
 *   `description` (optional supporting line).
 * - Content projection: an optional primary action into `[emptyStateAction]`
 *   (e.g. "Add employee"); omit it for a purely informational empty state.
 * - Variants: none — one layout for every empty case. A filtered "no results" and a
 *   true "no data yet" state differ only in their `title`/`description` text, not
 *   their structure.
 * - Accessibility: the icon is always `aria-hidden` — it's decorative, the title
 *   carries the meaning.
 *
 * Example
 * ```html
 * <app-empty-state [icon]="icons.badge" title="No employees yet"
 *                   description="Employee records will appear here once you add one.">
 *   <a emptyStateAction mat-flat-button color="primary" routerLink="/employees/new">
 *     Add employee
 *   </a>
 * </app-empty-state>
 * ```
 */
@Component({
  selector: 'app-empty-state',
  imports: [MatIconModule],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  readonly icon = input.required<string>();
  readonly title = input.required<string>();
  readonly description = input<string>();
}
