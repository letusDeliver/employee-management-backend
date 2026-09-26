import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { EffectiveStatus } from '../data-access/attendance.models';
import { STATUS_META } from '../data-access/attendance-status';

/**
 * One computed attendance status as a pill: a glyph AND the word, never colour alone (a colour
 * cue is invisible to some users). Presentational - the wording and tone live in `STATUS_META`.
 */
@Component({
  selector: 'app-attendance-status-badge',
  imports: [MatIconModule],
  templateUrl: './attendance-status-badge.component.html',
  styleUrl: './attendance-status-badge.component.scss',
})
export class AttendanceStatusBadgeComponent {
  readonly status = input.required<EffectiveStatus>();

  protected readonly meta = computed(() => STATUS_META[this.status()]);
}
