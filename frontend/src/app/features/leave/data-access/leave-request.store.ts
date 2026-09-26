import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { createPagedList } from '../../../shared/utils/paged-list.util';
import { LeaveRequest, LeaveRequestListQuery, LeaveRequestSortField, RejectLeaveRequestRequest } from './leave.models';
import { LeaveRequestService } from './leave-request.service';

/** Awaiting a decision is the reason an approver opens this page, so it is where the page starts. */
const DEFAULT_QUERY: LeaveRequestListQuery = { page: 1, limit: 10, status: 'PENDING', sortBy: 'startDate', order: 'desc' };

export type LeaveRequestFilters = Pick<Partial<LeaveRequestListQuery>, 'employeeId' | 'leaveTypeId' | 'status' | 'dateFrom' | 'dateTo'>;

/**
 * The ADMIN/MANAGER requests ledger (blueprint §6). Provided by the page, so every visit starts
 * from the default filter. After every decision or cancellation it REFETCHES rather than patching a
 * row: approving a PENDING request under a PENDING filter removes it from the page, and a patched
 * row could sit on the wrong page or leave `pagination.total` stale. Removing the last row of a
 * later page steps back one page.
 */
@Injectable()
export class LeaveRequestStore {
  private readonly api = inject(LeaveRequestService);
  private readonly notifications = inject(NotificationService);

  private readonly list = createPagedList<LeaveRequest, LeaveRequestListQuery>((query) => this.api.list(query), DEFAULT_QUERY);

  readonly requests = this.list.items;
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

  setSort(sortBy: LeaveRequestSortField, order: 'asc' | 'desc'): void {
    this.list.setSort(sortBy, order);
  }

  /** A key set to `undefined` clears that filter. */
  setFilters(filters: LeaveRequestFilters): void {
    this.list.setFilters(filters);
  }

  approve(id: string): Observable<LeaveRequest> {
    return this.api.approve(id).pipe(
      tap(() => {
        this.notifications.showSuccess('Leave request approved.');
        this.list.reloadAfterRemoval();
      }),
    );
  }

  reject(id: string, body: RejectLeaveRequestRequest): Observable<LeaveRequest> {
    return this.api.reject(id, body).pipe(
      tap(() => {
        this.notifications.showSuccess('Leave request rejected.');
        this.list.reloadAfterRemoval();
      }),
    );
  }

  cancel(id: string): Observable<LeaveRequest> {
    return this.api.cancel(id).pipe(
      tap(() => {
        this.notifications.showSuccess('Leave request cancelled.');
        this.list.reloadAfterRemoval();
      }),
    );
  }
}
