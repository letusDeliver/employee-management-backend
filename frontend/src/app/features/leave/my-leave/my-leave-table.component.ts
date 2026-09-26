import { Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';

import { LeaveTypeDirectoryService } from '../../../core/master-data-directory/leave-type-directory.service';
import { ColumnDef } from '../../../shared/components/data-table/column-def';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { StatusPillComponent } from '../../../shared/components/status-pill/status-pill.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { Paginated } from '../../../shared/models/paginated.model';
import { serverToday } from '../../../shared/utils/server-day.util';
import { LeaveRequest } from '../data-access/leave.models';
import { LEAVE_STATUS_META, canCancel, formatDateRange, formatDays } from '../data-access/leave-rules';

/**
 * Presentational (§9/§10): the caller's OWN requests on the shared server-paginated
 * `DataTableComponent`. Every row is the caller's, so Cancel is offered whenever the request may
 * still be cancelled - a PENDING one, or an APPROVED one that has not started, judged against the
 * SERVER's UTC day (never the local date). The type name comes from the leave-type directory and
 * degrades to "Unknown leave type"; nothing here breaks if it fails to load.
 */
@Component({
  selector: 'app-my-leave-table',
  imports: [
    DataTableComponent,
    DataTableCellDirective,
    StatusPillComponent,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './my-leave-table.component.html',
  styleUrl: './my-leave-table.component.scss',
})
export class MyLeaveTableComponent {
  private readonly leaveTypes = inject(LeaveTypeDirectoryService);
  protected readonly icons = ICON_NAMES;

  readonly rows = input.required<LeaveRequest[]>();
  readonly loading = input(false);
  readonly pagination = input.required<Paginated>();
  readonly cancellingIds = input<ReadonlySet<string>>(new Set());

  readonly pageChange = output<PageEvent>();
  readonly sortChange = output<Sort>();
  readonly cancelRequested = output<LeaveRequest>();

  // The sortable keys are the backend's own sort whitelist (`leave.validation.js`); the type is not sortable.
  protected readonly columns: ColumnDef[] = [
    { key: 'type', header: 'Leave type' },
    { key: 'startDate', header: 'Dates', sortable: true, nowrap: true },
    { key: 'durationDays', header: 'Days', nowrap: true },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'actions', header: '', stickyEnd: true },
  ];

  protected status(row: LeaveRequest) {
    return LEAVE_STATUS_META[row.status];
  }

  protected typeName(row: LeaveRequest): string {
    return this.leaveTypes.nameOf(row.leaveTypeId) ?? 'Unknown leave type';
  }

  protected dates(row: LeaveRequest): string {
    return formatDateRange(row.startDate, row.endDate);
  }

  /** Only an approved request has a duration (holidays and week-offs excluded, computed at approval). */
  protected days(row: LeaveRequest): string {
    return row.durationDays === null ? '—' : formatDays(row.durationDays);
  }

  protected cancellable(row: LeaveRequest): boolean {
    return canCancel(row, serverToday());
  }

  protected rowLabel(row: LeaveRequest): string {
    return `${this.typeName(row)}, ${this.dates(row)}`;
  }
}
