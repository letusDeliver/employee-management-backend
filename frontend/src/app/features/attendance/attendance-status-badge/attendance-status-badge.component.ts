import { Component, computed, input } from '@angular/core';

import { StatusPillComponent } from '../../../shared/components/status-pill/status-pill.component';
import { EffectiveStatus } from '../data-access/attendance.models';
import { STATUS_META } from '../data-access/attendance-status';

/**
 * One computed attendance status: `STATUS_META` (this feature's wording, tone and glyph) rendered
 * through the shared `StatusPillComponent`. Presentational.
 */
@Component({
  selector: 'app-attendance-status-badge',
  imports: [StatusPillComponent],
  template: '<app-status-pill [label]="meta().label" [tone]="meta().tone" [icon]="meta().icon" />',
  styles: ':host { display: inline-block; }',
})
export class AttendanceStatusBadgeComponent {
  readonly status = input.required<EffectiveStatus>();

  protected readonly meta = computed(() => STATUS_META[this.status()]);
}
