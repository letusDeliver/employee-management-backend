import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

import { ColumnDef } from '../../../shared/components/data-table/column-def';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { StatusPillComponent } from '../../../shared/components/status-pill/status-pill.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { Paginated } from '../../../shared/models/paginated.model';
import { PayrollRun } from '../data-access/payroll.models';
import { RUN_STATUS_META, canDelete, periodLabel } from '../data-access/payroll-rules';

/**
 * Presentational: one year of runs on the shared `DataTableComponent`. No column is sortable - the
 * order (month, newest first) is the store's fixed choice, the only one the backend gets right.
 *
 * The lifecycle actions live on the run's own page, next to its payslips, where the consequences are
 * visible; this table only opens a run or deletes a DRAFT one (the only status the server lets go).
 */
@Component({
  selector: 'app-payroll-run-table',
  imports: [
    DatePipe,
    RouterLink,
    DataTableComponent,
    DataTableCellDirective,
    StatusPillComponent,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './payroll-run-table.component.html',
  styleUrl: './payroll-run-table.component.scss',
})
export class PayrollRunTableComponent {
  protected readonly icons = ICON_NAMES;

  readonly rows = input.required<PayrollRun[]>();
  readonly loading = input(false);
  readonly pagination = input.required<Paginated>();
  readonly canDeleteRuns = input(false);
  readonly deletingIds = input<ReadonlySet<string>>(new Set());

  readonly pageChange = output<PageEvent>();
  readonly deleteRequested = output<PayrollRun>();

  protected readonly columns: ColumnDef[] = [
    { key: 'period', header: 'Period', nowrap: true },
    { key: 'status', header: 'Status' },
    { key: 'createdAt', header: 'Created', nowrap: true },
    { key: 'actions', header: '', stickyEnd: true },
  ];

  protected period(row: PayrollRun): string {
    return periodLabel(row.periodMonth, row.periodYear);
  }

  protected status(row: PayrollRun) {
    return RUN_STATUS_META[row.status];
  }

  protected deletable(row: PayrollRun): boolean {
    return this.canDeleteRuns() && canDelete(row);
  }
}
