import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { createPagedList } from '../../../shared/utils/paged-list.util';
import {
  CreatePerformanceReviewRequest,
  PerformanceReview,
  ReviewListQuery,
  ReviewSortField,
  ReviewStatus,
} from './performance.models';
import { PerformanceReviewService } from './performance-review.service';

/**
 * "Performance reviews" - the ledger for the people who write reviews (ADMIN: all; MANAGER: what the
 * server scopes to them, which INCLUDES reviews about the manager themselves - there is no reviewer
 * filter, so those rows are labelled on screen rather than filtered out here, which would corrupt the
 * paging). Provided by the page. Newest first by default.
 */
@Injectable()
export class ReviewLedgerStore {
  private readonly api = inject(PerformanceReviewService);
  private readonly notifications = inject(NotificationService);

  private readonly list = createPagedList<PerformanceReview, ReviewListQuery>((query) => this.api.list(query), {
    page: 1,
    limit: 10,
    sortBy: 'createdAt',
    order: 'desc',
  });

  readonly reviews = this.list.items;
  readonly pagination = this.list.pagination;
  readonly loading = this.list.loading;
  readonly error = this.list.error;
  readonly query = this.list.query;

  load(): void {
    this.list.load();
  }

  setFilters(filters: { reviewCycleId?: string; status?: ReviewStatus; employeeId?: string }): void {
    this.list.setFilters(filters);
  }

  setPage(page: number, limit: number): void {
    this.list.setPage(page, limit);
  }

  setSort(sortBy: ReviewSortField, order: 'asc' | 'desc'): void {
    this.list.setSort(sortBy, order);
  }

  /** The page opens the new review (its next step - the rating - is there), so nothing is refetched. */
  create(request: CreatePerformanceReviewRequest): Observable<PerformanceReview> {
    return this.api.create(request).pipe(tap(() => this.notifications.showSuccess('Review created.')));
  }
}
