import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { createPagedList } from '../../../shared/utils/paged-list.util';
import { serverToday } from '../../../shared/utils/server-day.util';
import { CreatePayrollRunRequest, PayrollRun, PayrollRunListQuery, PayrollRunStatus } from './payroll.models';
import { PayrollRunService } from './payroll-run.service';

/** A year holds at most twelve runs, so one page shows a whole year. */
const RUNS_PER_YEAR = 12;

/**
 * The payroll-run list (ADMIN). Provided by the page, so every visit starts fresh.
 *
 * The backend sorts by ONE key with `id` as the tie-break, so `sortBy=periodYear` returns a year's
 * months in id order, not calendar order. The list therefore ALWAYS filters to one year and sorts by
 * `periodMonth` - exact within a year, and a year fits on one page.
 */
@Injectable()
export class PayrollRunListStore {
  private readonly api = inject(PayrollRunService);
  private readonly notifications = inject(NotificationService);

  private readonly list = createPagedList<PayrollRun, PayrollRunListQuery>((query) => this.api.list(query), {
    page: 1,
    limit: RUNS_PER_YEAR,
    periodYear: Number(serverToday().slice(0, 4)),
    sortBy: 'periodMonth',
    order: 'desc',
  });

  readonly runs = this.list.items;
  readonly pagination = this.list.pagination;
  readonly loading = this.list.loading;
  readonly error = this.list.error;
  readonly query = this.list.query;

  load(): void {
    this.list.load();
  }

  setYear(periodYear: number): void {
    this.list.setFilters({ periodYear });
  }

  setStatus(status: PayrollRunStatus | undefined): void {
    this.list.setFilters({ status });
  }

  setPage(page: number, limit: number): void {
    this.list.setPage(page, limit);
  }

  /** The page navigates to the new run (its next step is there), so nothing is refetched here. */
  create(request: CreatePayrollRunRequest): Observable<PayrollRun> {
    return this.api.create(request).pipe(tap(() => this.notifications.showSuccess('Payroll run created.')));
  }

  delete(id: string): Observable<void> {
    return this.api.delete(id).pipe(
      tap(() => {
        this.notifications.showSuccess('Payroll run deleted.');
        this.list.reloadAfterRemoval();
      }),
    );
  }
}
