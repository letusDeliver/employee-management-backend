import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subscription, finalize, tap } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { createPagedList } from '../../../shared/utils/paged-list.util';
import { serverToday } from '../../../shared/utils/server-day.util';
import {
  CreateLeaveRequestRequest,
  LeaveBalance,
  LeaveRequest,
  LeaveRequestListQuery,
  LeaveRequestSortField,
  LeaveRequestStatus,
} from './leave.models';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveRequestService } from './leave-request.service';

const DEFAULT_QUERY: LeaveRequestListQuery = { page: 1, limit: 10, sortBy: 'startDate', order: 'desc' };

// The largest page the API allows - a person has a handful of leave types, so one page holds them all.
const BALANCE_PAGE_SIZE = 100;

/**
 * "My leave" (every role): the caller's own balances and requests. Provided by the page, so every
 * visit starts fresh.
 *
 * WHO the list is about depends on the caller. A plain EMPLOYEE is scoped to themselves BY THE
 * SERVER, so `start()` sends no employee id. But ADMIN and MANAGER hold `read:any`: an unfiltered
 * list would show EVERYONE's requests, so for them the page passes their own employee id (resolved
 * from the employee directory, which their permissions allow) and this store sends it on both
 * lists. If they have no employee record, `markNotLinked()` shows that state and nothing is fetched
 * - showing the organisation's leave under "My leave" would be wrong.
 *
 * Balances are shown for a year (default: the server's current year) and exist only once a leave
 * was first approved - none yet is a normal state.
 */
@Injectable()
export class MyLeaveStore {
  private readonly requestApi = inject(LeaveRequestService);
  private readonly balanceApi = inject(LeaveBalanceService);
  private readonly notifications = inject(NotificationService);

  private readonly list = createPagedList<LeaveRequest, LeaveRequestListQuery>((query) => this.requestApi.list(query), DEFAULT_QUERY);

  readonly requests = this.list.items;
  readonly pagination = this.list.pagination;
  readonly loading = this.list.loading;
  readonly error = this.list.error;
  readonly query = this.list.query;

  readonly balances = signal<LeaveBalance[]>([]);
  readonly balancesLoading = signal(false);
  readonly balancesError = signal<string | null>(null);
  readonly year = signal<number>(Number(serverToday().slice(0, 4)));

  /** A caller who may read everyone's leave has no employee record of their own to show. */
  readonly notLinked = signal(false);

  private employeeId: string | undefined;
  private balanceSubscription: Subscription | null = null;

  /** Loads both panels. `employeeId` is only for a caller with `:read:any` (see the class comment). */
  start(employeeId?: string): void {
    this.employeeId = employeeId;
    this.notLinked.set(false);
    this.list.setFilters({ employeeId });
    this.loadBalances();
  }

  markNotLinked(): void {
    this.notLinked.set(true);
  }

  /** Retry / refresh both panels with the same scope. */
  reload(): void {
    this.list.load();
    this.loadBalances();
  }

  loadBalances(): void {
    this.balanceSubscription?.unsubscribe();
    this.balancesError.set(null);
    this.balancesLoading.set(true);

    this.balanceSubscription = this.balanceApi
      .list({
        page: 1,
        limit: BALANCE_PAGE_SIZE,
        year: this.year(),
        employeeId: this.employeeId,
        sortBy: 'year',
        order: 'desc',
      })
      .pipe(finalize(() => this.balancesLoading.set(false)))
      .subscribe({
        next: ({ items }) => this.balances.set(items),
        error: (failure: unknown) => this.balancesError.set(extractErrorMessage(failure)),
      });
  }

  setYear(year: number): void {
    this.year.set(year);
    this.loadBalances();
  }

  setPage(page: number, limit: number): void {
    this.list.setPage(page, limit);
  }

  setSort(sortBy: LeaveRequestSortField, order: 'asc' | 'desc'): void {
    this.list.setSort(sortBy, order);
  }

  setStatus(status: LeaveRequestStatus | undefined): void {
    this.list.setFilters({ status });
  }

  /**
   * A new request is PENDING. If the status filter would hide it, the filter is cleared so the user
   * sees what they just did (the same reason Attendance's filters follow a created record).
   */
  apply(request: CreateLeaveRequestRequest): Observable<LeaveRequest> {
    return this.requestApi.create(request).pipe(
      tap(() => {
        this.notifications.showSuccess('Leave request submitted.');

        const status = this.list.query().status;
        if (status !== undefined && status !== 'PENDING') {
          this.list.setFilters({ status: undefined });
        } else {
          this.list.load();
        }
      }),
    );
  }

  /** Cancelling an APPROVED leave restores its days, so the balances are refetched too. */
  cancel(id: string): Observable<LeaveRequest> {
    return this.requestApi.cancel(id).pipe(
      tap(() => {
        this.notifications.showSuccess('Leave request cancelled.');
        this.list.reloadAfterRemoval();
        this.loadBalances();
      }),
    );
  }
}
