import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { createPagedList } from '../../../shared/utils/paged-list.util';
import {
  CreateReviewCycleRequest,
  ReviewCycle,
  ReviewCycleListQuery,
  ReviewCycleSortField,
  ReviewCycleStatus,
  UpdateReviewCycleRequest,
} from './performance.models';
import { ReviewCycleService } from './review-cycle.service';

/**
 * The review-cycle list (ADMIN). Provided by the page. Not on `MasterDataStore`: that is typed to
 * ACTIVE/INACTIVE, cycles are OPEN/CLOSED with a date range. Every mutation refetches (the server owns
 * the order and the totals); a delete steps back a page if it emptied one.
 */
@Injectable()
export class ReviewCycleListStore {
  private readonly api = inject(ReviewCycleService);
  private readonly notifications = inject(NotificationService);

  private readonly list = createPagedList<ReviewCycle, ReviewCycleListQuery>((query) => this.api.list(query), {
    page: 1,
    limit: 10,
    sortBy: 'startDate',
    order: 'desc',
  });

  readonly cycles = this.list.items;
  readonly pagination = this.list.pagination;
  readonly loading = this.list.loading;
  readonly error = this.list.error;
  readonly query = this.list.query;

  load(): void {
    this.list.load();
  }

  setSearch(search: string | undefined): void {
    this.list.setFilters({ search: search || undefined });
  }

  setStatus(status: ReviewCycleStatus | undefined): void {
    this.list.setFilters({ status });
  }

  setPage(page: number, limit: number): void {
    this.list.setPage(page, limit);
  }

  setSort(sortBy: ReviewCycleSortField, order: 'asc' | 'desc'): void {
    this.list.setSort(sortBy, order);
  }

  create(request: CreateReviewCycleRequest): Observable<ReviewCycle> {
    return this.api.create(request).pipe(
      tap(() => {
        this.notifications.showSuccess('Review cycle created.');
        this.list.load();
      }),
    );
  }

  update(id: string, request: UpdateReviewCycleRequest): Observable<ReviewCycle> {
    return this.api.update(id, request).pipe(
      tap(() => {
        this.notifications.showSuccess('Review cycle updated.');
        this.list.load();
      }),
    );
  }

  delete(id: string): Observable<void> {
    return this.api.delete(id).pipe(
      tap(() => {
        this.notifications.showSuccess('Review cycle deleted.');
        this.list.reloadAfterRemoval();
      }),
    );
  }
}
