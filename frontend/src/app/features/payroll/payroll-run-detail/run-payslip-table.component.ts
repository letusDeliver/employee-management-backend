import { CurrencyPipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

import { APP_CURRENCY } from '../../../core/config/app-currency';
import { ColumnDef } from '../../../shared/components/data-table/column-def';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { Paginated } from '../../../shared/models/paginated.model';
import { Payslip } from '../data-access/payroll.models';
import { formatDays, payslipEmployeeName, payslipRoleLine } from '../data-access/payroll-rules';

/**
 * Presentational: one page of a run's payslips. The employee is shown EXACTLY as snapshotted when
 * the run was processed (ADR-PR02) - never looked up live: a payslip must keep the name, department
 * and designation it was calculated under, even after a transfer. That is why the shared
 * `employee-cell` (a live directory lookup) is not used here.
 *
 * Only net pay is sortable: within one run the period is constant, and the server cannot sort by name.
 */
@Component({
  selector: 'app-run-payslip-table',
  imports: [CurrencyPipe, RouterLink, DataTableComponent, DataTableCellDirective, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './run-payslip-table.component.html',
  styleUrl: './run-payslip-table.component.scss',
})
export class RunPayslipTableComponent {
  protected readonly icons = ICON_NAMES;
  protected readonly currencyCode = APP_CURRENCY;

  readonly runId = input.required<string>();
  readonly rows = input.required<Payslip[]>();
  readonly loading = input(false);
  readonly pagination = input.required<Paginated>();

  readonly pageChange = output<PageEvent>();
  readonly sortChange = output<Sort>();

  protected readonly columns: ColumnDef[] = [
    { key: 'employee', header: 'Employee' },
    { key: 'days', header: 'Paid / working days', nowrap: true, align: 'end' },
    { key: 'grossPay', header: 'Gross', nowrap: true, align: 'end' },
    { key: 'totalDeductions', header: 'Deductions', nowrap: true, align: 'end' },
    { key: 'netPay', header: 'Net pay', sortable: true, nowrap: true, align: 'end' },
    { key: 'actions', header: '', stickyEnd: true },
  ];

  protected readonly name = payslipEmployeeName;
  protected readonly roleLine = payslipRoleLine;

  protected days(row: Payslip): string {
    return `${formatDays(row.paidDays)} / ${formatDays(row.workingDaysInPeriod)}`;
  }
}
