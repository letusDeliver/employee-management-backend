import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { createPagedList } from '../../../shared/utils/paged-list.util';
import { AdjustLeaveBalanceRequest, LeaveBalance, LeaveBalanceListQuery, LeaveBalanceSortField } from './leave.models';
import { LeaveBalanceService } from './leave-balance.service';

const DEFAULT_QUERY: LeaveBalanceListQuery = { page: 1, limit: 10, sortBy: 'year', order: 'desc' };

export type LeaveBalanceFilters = Pick<Partial<LeaveBalanceListQuery>, 'employeeId' | 'leaveTypeId' | 'year'>;

/**
 * The ADMIN/MANAGER balances ledger (blueprint §6). Provided by the page, refetching after every
 * adjustment rather than patching a row. Rows exist only once a leave was first approved for that
 * employee, type and year - an empty page is a normal state, not a failure.
 */
@Injectable()
export class LeaveBalanceStore {
  private readonly api = inject(LeaveBalanceService);
  private readonly notifications = inject(NotificationService);

  private readonly list = createPagedList<LeaveBalance, LeaveBalanceListQuery>((query) => this.api.list(query), DEFAULT_QUERY);

  readonly balances = this.list.items;
  readonly pagination = this.list.pagination;
  readonly loading = this.list.loading;
  readonly error = this.list.error;
  readonly query = this.list.query;

  loadList(): void {
    this.list.load();
  }

  setPage(page: number, limit: number): void {
    this.list.setPage(page, limit);
  }

  setSort(sortBy: LeaveBalanceSortField, order: 'asc' | 'desc'): void {
    this.list.setSort(sortBy, order);
  }

  /** A key set to `undefined` clears that filter. */
  setFilters(filters: LeaveBalanceFilters): void {
    this.list.setFilters(filters);
  }

  adjust(id: string, request: AdjustLeaveBalanceRequest): Observable<LeaveBalance> {
    return this.api.adjust(id, request).pipe(
      tap(() => {
        this.notifications.showSuccess('Leave balance adjusted.');
        this.list.load();
      }),
    );
  }
}
