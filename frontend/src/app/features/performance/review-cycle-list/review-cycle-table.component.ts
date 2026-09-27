import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ColumnDef } from '../../../shared/components/data-table/column-def';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { StatusPillComponent } from '../../../shared/components/status-pill/status-pill.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { Paginated } from '../../../shared/models/paginated.model';
import { ReviewCycle } from '../data-access/performance.models';
import { CYCLE_STATUS_META, cycleDateRange } from '../data-access/review-rules';

/** Presentational: one page of review cycles; Edit / Delete only when `canEdit`. */
@Component({
  selector: 'app-review-cycle-table',
  imports: [
    DataTableComponent,
    DataTableCellDirective,
    StatusPillComponent,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './review-cycle-table.component.html',
})
export class ReviewCycleTableComponent {
  protected readonly icons = ICON_NAMES;

  readonly rows = input.required<ReviewCycle[]>();
  readonly loading = input(false);
  readonly pagination = input.required<Paginated>();
  readonly canEdit = input(false);
  readonly deletingIds = input<ReadonlySet<string>>(new Set());

  readonly pageChange = output<PageEvent>();
  readonly sortChange = output<Sort>();
  readonly editRequested = output<ReviewCycle>();
  readonly deleteRequested = output<ReviewCycle>();

  // Sortable keys are the backend's own whitelist (`reviewCycle.validation.js`).
  protected readonly columns: ColumnDef[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'startDate', header: 'Dates', sortable: true, nowrap: true },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'actions', header: '', stickyEnd: true },
  ];

  protected dates(row: ReviewCycle): string {
    return cycleDateRange(row.startDate, row.endDate);
  }

  protected status(row: ReviewCycle) {
    return CYCLE_STATUS_META[row.status];
  }
}
