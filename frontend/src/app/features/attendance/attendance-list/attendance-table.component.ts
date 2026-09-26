import { DatePipe } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';

import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { ColumnDef } from '../../../shared/components/data-table/column-def';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { EmployeeCellComponent } from '../../../shared/components/employee-cell/employee-cell.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { Paginated } from '../../../shared/models/paginated.model';
import { AttendanceRecord } from '../data-access/attendance.models';
import { punchLabel, recordDate, workedDuration } from '../data-access/attendance-status';

/**
 * Presentational (§9/§10): one page of the attendance ledger on the shared server-paginated
 * `DataTableComponent`. It never injects `SessionStore` - the smart page passes `canEdit` and
 * `canDelete` in, because the two need different backend permissions (`attendance:update:any`,
 * `attendance:delete:any`).
 *
 * The Employee column is a label from `EmployeeDirectoryService` (a name for an ADMIN,
 * "Designation, Department" for a MANAGER, who cannot list users). It is display-only enrichment:
 * until it loads, or when it fails, a row reads "Unknown employee" and everything else still works.
 * A record has no status of its own - the computed status exists only per employee and day (the
 * page's status lookup) - so the only flag here is `isHalfDay`, which is stored.
 */
@Component({
  selector: 'app-attendance-table',
  imports: [
    DataTableComponent,
    DataTableCellDirective,
    DatePipe,
    EmployeeCellComponent,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './attendance-table.component.html',
  styleUrl: './attendance-table.component.scss',
})
export class AttendanceTableComponent {
  private readonly directory = inject(EmployeeDirectoryService);
  protected readonly icons = ICON_NAMES;

  readonly rows = input.required<AttendanceRecord[]>();
  readonly loading = input(false);
  readonly pagination = input.required<Paginated>();
  readonly deletingIds = input<ReadonlySet<string>>(new Set());
  readonly canEdit = input(false);
  readonly canDelete = input(false);

  readonly pageChange = output<PageEvent>();
  readonly sortChange = output<Sort>();
  readonly editRequested = output<AttendanceRecord>();
  readonly deleteRequested = output<AttendanceRecord>();

  // The sortable keys are the backend's own sort whitelist (`attendance.validation.js`).
  protected readonly columns: ColumnDef[] = [
    { key: 'employee', header: 'Employee' },
    { key: 'date', header: 'Date', sortable: true, nowrap: true },
    { key: 'checkIn', header: 'Check in', sortable: true, nowrap: true },
    { key: 'checkOut', header: 'Check out', sortable: true, nowrap: true },
    { key: 'worked', header: 'Worked', nowrap: true },
    { key: 'isHalfDay', header: 'Half day', nowrap: true },
    // stickyEnd: at phone width the table scrolls sideways; Edit and Delete must stay in reach.
    { key: 'actions', header: '', stickyEnd: true },
  ];

  protected employeeLabel(row: AttendanceRecord): string {
    return this.directory.labelOf(row.employeeId);
  }

  protected day(row: AttendanceRecord): Date {
    return recordDate(row.date);
  }

  protected punch(instant: string | null, row: AttendanceRecord): string {
    return punchLabel(instant, row.date);
  }

  protected worked(row: AttendanceRecord): string {
    return workedDuration(row.checkIn, row.checkOut) ?? '—';
  }

  /** e.g. "Amit, 15 Sep 2026" - what a screen reader says for a row's own buttons. */
  protected rowLabel(row: AttendanceRecord): string {
    return `${this.employeeLabel(row)}, ${this.day(row).toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
  }
}
