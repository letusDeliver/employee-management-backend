import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

import { SessionStore } from '../../../core/auth/session.store';
import { ColumnDef } from '../../../shared/components/data-table/column-def';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusPillComponent } from '../../../shared/components/status-pill/status-pill.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { MyReviewsStore } from '../data-access/my-reviews.store';
import { PerformanceReview } from '../data-access/performance.models';
import { ReviewContext } from '../data-access/review-context';
import { ReviewCycleLookup } from '../data-access/review-cycle-lookup';
import { RATING_LABEL, REVIEW_STATUS_META, cycleDateRange } from '../data-access/review-rules';

/**
 * Routed at `/my-reviews` (every role - `performanceReview:read:own`): the reviews ABOUT the caller.
 *
 * WHO "my" is: an EMPLOYEE is scoped by the server. ADMIN (`read:any`) and MANAGER (whose unfiltered
 * list includes the reviews they write) first resolve their OWN employee and send that id; without a
 * record they see "not linked" and nothing is fetched; a failed lookup blocks with a Retry.
 *
 * A DRAFT's rating is never shown here - it is the reviewer's work in progress.
 */
@Component({
  selector: 'app-my-reviews-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    DataTableComponent,
    DataTableCellDirective,
    StatusPillComponent,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
  ],
  providers: [MyReviewsStore],
  templateUrl: './my-reviews-page.component.html',
  styleUrl: './my-reviews-page.component.scss',
})
export class MyReviewsPageComponent implements OnInit {
  private readonly sessionStore = inject(SessionStore);
  private readonly context = inject(ReviewContext);
  protected readonly cycles = inject(ReviewCycleLookup);
  protected readonly store = inject(MyReviewsStore);
  protected readonly icons = ICON_NAMES;

  protected readonly ownerError = signal<string | null>(null);

  protected readonly columns: ColumnDef[] = [
    { key: 'cycle', header: 'Cycle' },
    { key: 'status', header: 'Status' },
    { key: 'rating', header: 'Rating', nowrap: true },
    { key: 'createdAt', header: 'Started', nowrap: true },
    { key: 'actions', header: '', stickyEnd: true },
  ];

  ngOnInit(): void {
    this.cycles.refresh().subscribe({ error: () => undefined });
    this.resolveOwner();
  }

  /** ADMIN and MANAGER must send their own id; everyone else is scoped by the server. */
  protected resolveOwner(): void {
    this.ownerError.set(null);

    if (!this.sessionStore.hasAnyPermission('performanceReview:read:any', 'performanceReview:manage:reports')) {
      this.store.start();
      return;
    }

    this.context.load().subscribe(() => {
      if (this.context.ownState() === 'failed') {
        this.ownerError.set("Couldn't work out which employee record is yours, so your reviews can't be shown.");
        return;
      }
      const own = this.context.ownEmployeeId();
      if (own) {
        this.store.start(own);
      } else {
        this.store.markNotLinked();
      }
    });
  }

  protected onPageChange(event: PageEvent): void {
    this.store.setPage(event.pageIndex + 1, event.pageSize);
  }

  protected cycleName(row: PerformanceReview): string {
    return this.cycles.nameOf(row.reviewCycleId);
  }

  protected cycleDates(row: PerformanceReview): string | null {
    const cycle = this.cycles.get(row.reviewCycleId);
    return cycle ? cycleDateRange(cycle.startDate, cycle.endDate) : null;
  }

  protected status(row: PerformanceReview) {
    return REVIEW_STATUS_META[row.status];
  }

  protected rating(row: PerformanceReview): string {
    if (row.status === 'DRAFT') {
      return 'Not yet submitted';
    }
    return row.rating ? RATING_LABEL[row.rating] : '—';
  }
}
