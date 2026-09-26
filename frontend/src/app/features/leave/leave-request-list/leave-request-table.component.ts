import { Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';

import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { LeaveTypeDirectoryService } from '../../../core/master-data-directory/leave-type-directory.service';
import { ColumnDef } from '../../../shared/components/data-table/column-def';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { EmployeeCellComponent } from '../../../shared/components/employee-cell/employee-cell.component';
import { StatusPillComponent } from '../../../shared/components/status-pill/status-pill.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { Paginated } from '../../../shared/models/paginated.model';
import { serverToday } from '../../../shared/utils/server-day.util';
import { LeaveRequest } from '../data-access/leave.models';
import { LEAVE_STATUS_META, canCancel, formatDateRange, formatDays } from '../data-access/leave-rules';

/**
 * Presentational (§9/§10): one page of the requests ledger on the shared server-paginated
 * `DataTableComponent`. It never injects `SessionStore` - the smart page works out WHICH rows the
 * caller may decide (ADMIN: any pending; MANAGER: only a direct report's) and passes their ids in as
 * `decidableIds`, plus whether to say "Not your report" on the pending rows that are not theirs.
 *
 * The Employee column is the shared cell (a name for an ADMIN, "Designation, Department" plus a
 * "Joined" line for a MANAGER); the type name degrades to "Unknown leave type". Cancel is offered only
 * to a caller with `leaveRequest:cancel:any` and only while the request may still be cancelled,
 * judged against the SERVER's UTC day - never the local date.
 */
@Component({
  selector: 'app-leave-request-table',
  imports: [
    DataTableComponent,
    DataTableCellDirective,
    EmployeeCellComponent,
    StatusPillComponent,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './leave-request-table.component.html',
  styleUrl: './leave-request-table.component.scss',
})
export class LeaveRequestTableComponent {
  private readonly directory = inject(EmployeeDirectoryService);
  private readonly leaveTypes = inject(LeaveTypeDirectoryService);
  protected readonly icons = ICON_NAMES;

  readonly rows = input.required<LeaveRequest[]>();
  readonly loading = input(false);
  readonly pagination = input.required<Paginated>();
  /** Ids of the PENDING rows the caller may approve or reject. */
  readonly decidableIds = input<ReadonlySet<string>>(new Set());
  /** Say "Not your report" on pending rows the caller cannot decide (a MANAGER's view). */
  readonly showNotYourReport = input(false);
  readonly canCancelAny = input(false);
  /** Rows with a decision or cancellation in flight - their buttons become a spinner. */
  readonly busyIds = input<ReadonlySet<string>>(new Set());

  readonly pageChange = output<PageEvent>();
  readonly sortChange = output<Sort>();
  readonly approveRequested = output<LeaveRequest>();
  readonly rejectRequested = output<LeaveRequest>();
  readonly cancelRequested = output<LeaveRequest>();

  // The sortable keys are the backend's own sort whitelist (`leave.validation.js`).
  protected readonly columns: ColumnDef[] = [
    { key: 'employee', header: 'Employee' },
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

  protected decidable(row: LeaveRequest): boolean {
    return this.decidableIds().has(row.id);
  }

  protected notYourReport(row: LeaveRequest): boolean {
    return this.showNotYourReport() && row.status === 'PENDING' && !this.decidable(row);
  }

  protected cancellable(row: LeaveRequest): boolean {
    return this.canCancelAny() && canCancel(row, serverToday());
  }

  /** e.g. "Amit Rao, Nov 2, 2026" - what a screen reader says for a row's own buttons. */
  protected rowLabel(row: LeaveRequest): string {
    return `${this.directory.labelOf(row.employeeId)}, ${this.dates(row)}`;
  }
}
