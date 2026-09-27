import { CurrencyPipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

import { APP_CURRENCY } from '../../../core/config/app-currency';
import { ColumnDef } from '../../../shared/components/data-table/column-def';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { Payslip } from '../data-access/payroll.models';
import { periodLabel } from '../data-access/payroll-rules';

/** One payslip a month, so a year is at most twelve rows - one page, no paging. */
export const MONTHS_PER_YEAR = 12;

/**
 * Presentational: one year of the caller's own payslips, newest month first (the store orders them).
 * No column is sortable - calendar order is the only order that makes sense for one person's pay.
 * Net pay comes right after the period: it is the figure a person looks for, and on a phone the
 * columns after it scroll out of view (the payslip page has the full breakdown).
 */
@Component({
  selector: 'app-my-payslips-table',
  imports: [CurrencyPipe, RouterLink, DataTableComponent, DataTableCellDirective, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './my-payslips-table.component.html',
  styleUrl: './my-payslips-table.component.scss',
})
export class MyPayslipsTableComponent {
  protected readonly icons = ICON_NAMES;
  protected readonly currencyCode = APP_CURRENCY;
  protected readonly pageSize = MONTHS_PER_YEAR;

  readonly rows = input.required<Payslip[]>();
  readonly loading = input(false);

  protected readonly columns: ColumnDef[] = [
    { key: 'period', header: 'Period', nowrap: true },
    { key: 'netPay', header: 'Net pay', nowrap: true, align: 'end' },
    { key: 'grossPay', header: 'Gross', nowrap: true, align: 'end' },
    { key: 'totalDeductions', header: 'Deductions', nowrap: true, align: 'end' },
    { key: 'actions', header: '', stickyEnd: true },
  ];

  protected period(row: Payslip): string {
    return periodLabel(row.periodMonth, row.periodYear);
  }
}
