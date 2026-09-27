import { DatePipe } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

import { ColumnDef } from '../../../shared/components/data-table/column-def';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { StatusPillComponent } from '../../../shared/components/status-pill/status-pill.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { Paginated } from '../../../shared/models/paginated.model';
import { PerformanceReview } from '../data-access/performance.models';
import { ReviewContext } from '../data-access/review-context';
import { ReviewCycleLookup } from '../data-access/review-cycle-lookup';
import { RATING_LABEL, REVIEW_STATUS_META, isAboutCaller, showManagerContent } from '../data-access/review-rules';

/**
 * Presentational: one page of reviews. A row about the caller themselves (a MANAGER's own review is in
 * their scope too) says "About you" and never shows the draft's rating; everything else is named the
 * way `ReviewContext` allows for this caller.
 */
@Component({
  selector: 'app-review-ledger-table',
  imports: [DatePipe, RouterLink, DataTableComponent, DataTableCellDirective, StatusPillComponent, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './review-ledger-table.component.html',
  styleUrl: './review-ledger-table.component.scss',
})
export class ReviewLedgerTableComponent {
  private readonly context = inject(ReviewContext);
  private readonly cycles = inject(ReviewCycleLookup);
  protected readonly icons = ICON_NAMES;

  readonly rows = input.required<PerformanceReview[]>();
  readonly loading = input(false);
  readonly pagination = input.required<Paginated>();

  readonly pageChange = output<PageEvent>();
  readonly sortChange = output<Sort>();

  // Sortable keys are the backend's own whitelist (`performance.validation.js`).
  protected readonly columns: ColumnDef[] = [
    { key: 'employee', header: 'Employee' },
    { key: 'cycle', header: 'Cycle' },
    { key: 'reviewer', header: 'Reviewer' },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'rating', header: 'Rating', nowrap: true },
    { key: 'createdAt', header: 'Created', sortable: true, nowrap: true },
    { key: 'actions', header: '', stickyEnd: true },
  ];

  protected employee(row: PerformanceReview): string {
    return this.context.subjectLabel(row, this.context.actorFor(row));
  }

  protected reviewer(row: PerformanceReview): string {
    return this.context.reviewerLabel(row, this.context.actorFor(row));
  }

  protected aboutYou(row: PerformanceReview): boolean {
    return isAboutCaller(row, this.context.actorFor(row));
  }

  protected cycle(row: PerformanceReview): string {
    return this.cycles.nameOf(row.reviewCycleId);
  }

  protected status(row: PerformanceReview) {
    return REVIEW_STATUS_META[row.status];
  }

  protected rating(row: PerformanceReview): string {
    if (!showManagerContent(row, this.context.actorFor(row))) {
      return '—';
    }
    return row.rating ? RATING_LABEL[row.rating] : '—';
  }
}
