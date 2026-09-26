import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** The look a status can have. Wording and meaning stay with the feature that owns the status. */
export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/**
 * A status as a pill: a glyph AND the word, never colour alone (a colour cue is invisible to some
 * users). Presentational and domain-agnostic - the caller supplies the label, tone and glyph, so
 * Attendance's seven computed statuses and Leave's four request statuses share one look.
 * Extracted when Leave became the second consumer.
 */
@Component({
  selector: 'app-status-pill',
  imports: [MatIconModule],
  templateUrl: './status-pill.component.html',
  styleUrl: './status-pill.component.scss',
})
export class StatusPillComponent {
  readonly label = input.required<string>();
  readonly tone = input.required<StatusTone>();
  /** A Material Symbols glyph name. */
  readonly icon = input.required<string>();
}
