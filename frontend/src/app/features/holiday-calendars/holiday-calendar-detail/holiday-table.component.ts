import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ICON_NAMES } from '../../../shared/icon-names';
import { Holiday } from '../data-access/holiday-calendar.models';
import { formatHolidayDate } from '../data-access/holiday-date';

/**
 * Presentational (§9/§10): one calendar's holidays, in the order the server returns them (date
 * ascending). A plain `mat-table` rather than `DataTableComponent`, whose contract is server-side
 * paging and sorting - this list is small, unpaginated and already date-ordered. Like the other
 * tables it never injects `SessionStore`: the smart page passes `canEdit` in.
 */
@Component({
  selector: 'app-holiday-table',
  imports: [MatTableModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule],
  templateUrl: './holiday-table.component.html',
  styleUrl: './holiday-table.component.scss',
})
export class HolidayTableComponent {
  protected readonly icons = ICON_NAMES;

  readonly rows = input.required<Holiday[]>();
  readonly deletingIds = input<ReadonlySet<string>>(new Set());
  readonly canEdit = input(false);

  readonly editRequested = output<Holiday>();
  readonly deleteRequested = output<Holiday>();

  protected readonly displayedColumns = ['date', 'name', 'type', 'actions'];

  protected label(holiday: Holiday): string {
    return formatHolidayDate(holiday.date);
  }
}
