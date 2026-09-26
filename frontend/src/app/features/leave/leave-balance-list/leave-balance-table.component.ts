import { Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';

import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { LeaveTypeDirectoryService } from '../../../core/master-data-directory/leave-type-directory.service';
import { ColumnDef } from '../../../shared/components/data-table/column-def';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { EmployeeCellComponent } from '../../../shared/components/employee-cell/employee-cell.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { Paginated } from '../../../shared/models/paginated.model';
import { LeaveBalance } from '../data-access/leave.models';
import { formatDays, remainingDays } from '../data-access/leave-rules';

/**
 * Presentational (§9/§10): one page of the balances ledger on the shared server-paginated
 * `DataTableComponent`. It never injects `SessionStore` - the smart page passes `canAdjust` in
 * (`leaveBalance:adjust:any`, ADMIN only). `remaining` is derived (`entitlement - consumed`), so it is
 * not sortable server-side; a negative remaining (an admin override) is shown as it is.
 */
@Component({
  selector: 'app-leave-balance-table',
  imports: [DataTableComponent, DataTableCellDirective, EmployeeCellComponent, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './leave-balance-table.component.html',
  styleUrl: './leave-balance-table.component.scss',
})
export class LeaveBalanceTableComponent {
  private readonly directory = inject(EmployeeDirectoryService);
  private readonly leaveTypes = inject(LeaveTypeDirectoryService);
  protected readonly icons = ICON_NAMES;

  readonly rows = input.required<LeaveBalance[]>();
  readonly loading = input(false);
  readonly pagination = input.required<Paginated>();
  readonly canAdjust = input(false);

  readonly pageChange = output<PageEvent>();
  readonly sortChange = output<Sort>();
  readonly adjustRequested = output<LeaveBalance>();

  // The sortable keys are the backend's own sort whitelist (`leave.validation.js`).
  protected readonly columns: ColumnDef[] = [
    { key: 'employee', header: 'Employee' },
    { key: 'type', header: 'Leave type' },
    { key: 'year', header: 'Year', sortable: true, nowrap: true },
    { key: 'entitlement', header: 'Entitlement', sortable: true, nowrap: true },
    { key: 'consumed', header: 'Used', sortable: true, nowrap: true },
    { key: 'remaining', header: 'Remaining', nowrap: true },
    { key: 'actions', header: '', stickyEnd: true },
  ];

  protected typeName(row: LeaveBalance): string {
    return this.leaveTypes.nameOf(row.leaveTypeId) ?? 'Unknown leave type';
  }

  protected days(value: number): string {
    return formatDays(value);
  }

  protected remaining(row: LeaveBalance): string {
    return formatDays(remainingDays(row));
  }

  protected isNegative(row: LeaveBalance): boolean {
    return remainingDays(row) < 0;
  }

  /** e.g. "Amit Rao, Annual Leave 2026" - what a screen reader says for the row's own button. */
  protected rowLabel(row: LeaveBalance): string {
    return `${this.directory.labelOf(row.employeeId)}, ${this.typeName(row)} ${row.year}`;
  }
}
