import { Injectable, inject, signal } from '@angular/core';

import { createPagedList } from '../../../shared/utils/paged-list.util';
import { PerformanceReview, ReviewListQuery } from './performance.models';
import { PerformanceReviewService } from './performance-review.service';

/**
 * "My reviews" (every role) - the reviews ABOUT the caller. Provided by the page.
 *
 * WHO: an EMPLOYEE is scoped to themselves by the server, so `start()` sends no id. An ADMIN holds
 * `read:any` (unfiltered = everyone's) and a MANAGER's unfiltered list also contains the reviews they
 * write - so for both the page passes their OWN employee id, and without one `markNotLinked()` shows
 * that state and nothing is fetched.
 */
@Injectable()
export class MyReviewsStore {
  private readonly api = inject(PerformanceReviewService);

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
  readonly notLinked = signal(false);

  start(employeeId?: string): void {
    this.notLinked.set(false);
    this.list.setFilters({ employeeId });
  }

  markNotLinked(): void {
    this.notLinked.set(true);
  }

  load(): void {
    this.list.load();
  }

  setPage(page: number, limit: number): void {
    this.list.setPage(page, limit);
  }
}
