import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ColumnDef } from '../../../shared/components/data-table/column-def';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { Paginated } from '../../../shared/models/paginated.model';
import { Shift } from '../data-access/shift.models';
import { formatWorkingDays, isOvernight } from '../data-access/shift-schedule';

/**
 * Presentational (§9/§10): configures `DataTableComponent` with Shift's columns. Like
 * `MasterDataTableComponent` it never injects `SessionStore` - the smart page decides
 * whether the row actions render and passes `canEdit`/`canDelete` in. It is Shift's own
 * table rather than the shared one because Shift has no `code` column and shows a
 * working-days summary and a start-end range instead.
 */
@Component({
  selector: 'app-shift-table',
  imports: [
    DataTableComponent,
    DataTableCellDirective,
    DatePipe,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './shift-table.component.html',
  styleUrl: './shift-table.component.scss',
})
export class ShiftTableComponent {
  protected readonly icons = ICON_NAMES;

  readonly rows = input.required<Shift[]>();
  readonly loading = input(false);
  readonly pagination = input.required<Paginated>();
  readonly deletingIds = input<ReadonlySet<string>>(new Set());
  readonly canEdit = input(false);
  readonly canDelete = input(false);

  readonly editRequested = output<Shift>();
  readonly deleteRequested = output<Shift>();
  readonly pageChange = output<PageEvent>();
  readonly sortChange = output<Sort>();

  // `startTime` is the sortable key behind the "Hours" column: the backend has no single
  // "hours" sort, and the start is what a shift list is naturally ordered by.
  protected readonly columns: ColumnDef[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'workingDays', header: 'Working days' },
    { key: 'startTime', header: 'Hours', sortable: true },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'createdAt', header: 'Created', sortable: true },
    { key: 'actions', header: '' },
  ];

  protected workingDays(shift: Shift): string {
    return formatWorkingDays(shift.workingDays);
  }

  protected overnight(shift: Shift): boolean {
    return isOvernight(shift.startTime, shift.endTime);
  }
}
