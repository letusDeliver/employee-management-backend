import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

import { ColumnDef } from '../../../shared/components/data-table/column-def';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { Paginated } from '../../../shared/models/paginated.model';
import { HolidayCalendar } from '../data-access/holiday-calendar.models';

/**
 * Presentational (§9/§10): configures `DataTableComponent` with the calendar's columns. Like the
 * other master-data tables it never injects `SessionStore` - the smart page decides whether the
 * row actions render and passes `canEdit`/`canDelete` in. The name is a link to the calendar's
 * own page, where its holidays live.
 */
@Component({
  selector: 'app-holiday-calendar-table',
  imports: [
    DataTableComponent,
    DataTableCellDirective,
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './holiday-calendar-table.component.html',
  styleUrl: './holiday-calendar-table.component.scss',
})
export class HolidayCalendarTableComponent {
  protected readonly icons = ICON_NAMES;

  readonly rows = input.required<HolidayCalendar[]>();
  readonly loading = input(false);
  readonly pagination = input.required<Paginated>();
  readonly deletingIds = input<ReadonlySet<string>>(new Set());
  readonly canEdit = input(false);
  readonly canDelete = input(false);

  readonly editRequested = output<HolidayCalendar>();
  readonly deleteRequested = output<HolidayCalendar>();
  readonly pageChange = output<PageEvent>();
  readonly sortChange = output<Sort>();

  protected readonly columns: ColumnDef[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'createdAt', header: 'Created', sortable: true },
    { key: 'actions', header: '' },
  ];
}
