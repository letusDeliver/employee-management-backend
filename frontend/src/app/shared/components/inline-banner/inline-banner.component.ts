import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { ICON_NAMES } from '../../icon-names';

export type InlineBannerTone = 'error' | 'warning';

/**
 * Design-system primitive (docs/design-system.md) — the one inline error/warning banner
 * every feature uses, replacing the copy-pasted `bg-warn`/icon `<div>` markup this
 * pattern had before (and Users' list, the one screen that never got it at all).
 *
 * API
 * - Inputs: `tone` (`'error' | 'warning'`, default `'error'`), `message` (required),
 *   `icon` (optional override — defaults to a tone-appropriate icon), `showRetry`
 *   (default `false`).
 * - Outputs: `retry` — emitted when the Retry button is clicked; the button only
 *   renders when `showRetry` is `true`.
 * - Content projection: none — `message` is a plain string input, matching the
 *   backend's joined-string validation-error contract (blueprint §9), never a
 *   projected template.
 * - Variants: `tone` only. There is deliberately no `success`/`info` tone — every
 *   success notification in this app is a toast (`NotificationService`), never an
 *   inline banner, so a third tone here would be a visual pattern with no consumer.
 * - Accessibility: host renders `role="alert"` so screen readers announce it the
 *   moment it appears; the icon is `aria-hidden`, the message text carries the meaning.
 *
 * Example
 * ```html
 * @if (employeeStore.error(); as message) {
 *   <app-inline-banner tone="error" [message]="message" [showRetry]="true"
 *                      (retry)="employeeStore.reload()" />
 * }
 * ```
 */
@Component({
  selector: 'app-inline-banner',
  imports: [MatIconModule, MatButtonModule],
  templateUrl: './inline-banner.component.html',
  styleUrl: './inline-banner.component.scss',
  host: { role: 'alert' },
})
export class InlineBannerComponent {
  protected readonly icons = ICON_NAMES;

  readonly tone = input<InlineBannerTone>('error');
  readonly message = input.required<string>();
  readonly icon = input<string>();
  readonly showRetry = input(false);

  readonly retry = output<void>();

  protected readonly resolvedIcon = computed(
    () => this.icon() ?? (this.tone() === 'warning' ? this.icons.warning : this.icons.error),
  );
}
