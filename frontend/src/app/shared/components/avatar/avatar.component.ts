import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { ICON_NAMES } from '../../icon-names';

/**
 * Design-system primitive (docs/design-system.md) — replaces Account's bare
 * `!h-16 !w-16 !text-6xl`-forced `mat-icon` with a real circular avatar: an image when
 * one exists, otherwise tinted initials, otherwise a fallback icon.
 *
 * API
 * - Inputs: `imageUrl` (optional), `name` (optional — source for initials and the
 *   accessible label), `size` (`'sm' | 'md'`, default `'md'`: 32px/64px, matching the
 *   two sizes this app actually needs today — inline/table and profile-page contexts).
 * - Content projection: none.
 * - Variants: `size` only.
 * - Accessibility: an image gets `alt="Profile picture for {name}"`; the
 *   initials/icon fallback instead puts `role="img"` + `aria-label` on the host,
 *   since neither the initials text nor the icon should be read literally.
 *
 * Example
 * ```html
 * <app-avatar [imageUrl]="user.profileImageUrl" [name]="user.name" size="md" />
 * ```
 */
@Component({
  selector: 'app-avatar',
  imports: [MatIconModule],
  templateUrl: './avatar.component.html',
  styleUrl: './avatar.component.scss',
})
export class AvatarComponent {
  protected readonly icons = ICON_NAMES;

  readonly imageUrl = input<string>();
  readonly name = input<string>();
  readonly size = input<'sm' | 'md'>('md');

  protected readonly initials = computed(() => {
    const name = this.name();
    if (!name?.trim()) {
      return null;
    }
    const parts = name.trim().split(/\s+/);
    const letters = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : [parts[0][0]];
    return letters.join('').toUpperCase();
  });

  protected readonly fallbackLabel = computed(() => {
    const name = this.name();
    return name ? `Profile picture for ${name}` : 'No profile picture set';
  });
}
