import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subscription, finalize, tap } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { Paginated } from '../../../shared/models/paginated.model';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { createListQueryState } from '../../../shared/utils/list-query-state.util';
import {
  AttendanceListQuery,
  AttendanceRecord,
  AttendanceSortField,
  CreateAttendanceRequest,
  UpdateAttendanceRequest,
} from './attendance.models';
import { AttendanceService } from './attendance.service';

const DEFAULT_QUERY: AttendanceListQuery = { page: 1, limit: 10, sortBy: 'date', order: 'desc' };
const DEFAULT_PAGINATION: Paginated = { page: 1, limit: 10, total: 0, totalPages: 0 };

/** Does `record` fall inside the filters currently applied to the list? Dates are `YYYY-MM-DD`, compared as strings. */
export const recordMatchesQuery = (query: AttendanceListQuery, record: AttendanceRecord): boolean => {
  const day = record.date.slice(0, 10);
  return (
    (!query.employeeId || query.employeeId === record.employeeId) &&
    (!query.dateFrom || day >= query.dateFrom) &&
    (!query.dateTo || day <= query.dateTo)
  );
};

/**
 * The ADMIN/MANAGER records list (blueprint §6). Provided by the list page, not `root`: every
 * visit starts from the default filters and nothing leaks between visits. It does not extend
 * `MasterDataStore` - an attendance record has no `name` or `status`, it is a ledger row.
 *
 * Like `MasterDataStore`, every successful mutation REFETCHES instead of patching the array (a
 * patched row can land on the wrong page or sort position and leave `pagination.total` stale),
 * only the latest list request may write to state, and deleting the last row of a later page steps
 * back one page.
 *
 * One deliberate addition: after a CREATE, a record that the active filters would hide (another
 * employee, another date range) makes the filters follow it - otherwise the user saves a record
 * and sees nothing change, which reads as "it did not work".
 */
@Injectable()
export class AttendanceStore {
  private readonly api = inject(AttendanceService);
  private readonly notifications = inject(NotificationService);

  readonly records = signal<AttendanceRecord[]>([]);
  readonly pagination = signal<Paginated>(DEFAULT_PAGINATION);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly listQuery = createListQueryState<AttendanceListQuery>(DEFAULT_QUERY, () => this.loadList());
  readonly query = this.listQuery.query;

  // Only the latest list request may write to state; unsubscribing first runs the old finalize().
  private listSubscription: Subscription | null = null;

  loadList(): void {
    this.listSubscription?.unsubscribe();
    this.error.set(null);
    this.loading.set(true);

    this.listSubscription = this.api
      .list(this.query())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ records, pagination }) => {
          this.records.set(records);
          this.pagination.set(pagination);
        },
        error: (error: unknown) => this.error.set(extractErrorMessage(error)),
      });
  }

  setPage(page: number, limit: number): void {
    this.listQuery.setPage(page, limit);
  }

  setSort(sortBy: AttendanceSortField, order: 'asc' | 'desc'): void {
    this.listQuery.setSort(sortBy, order);
  }

  /** A key set to `undefined` clears that filter. */
  setFilters(filters: Pick<Partial<AttendanceListQuery>, 'employeeId' | 'dateFrom' | 'dateTo'>): void {
    this.listQuery.setFilters(filters);
  }

  createRecord(request: CreateAttendanceRequest): Observable<AttendanceRecord> {
    return this.api.create(request).pipe(
      tap((record) => {
        this.notifications.showSuccess('Attendance record created successfully.');

        if (recordMatchesQuery(this.query(), record)) {
          this.loadList();
        } else {
          this.listQuery.setFilters({ employeeId: record.employeeId, dateFrom: undefined, dateTo: undefined });
        }
      }),
    );
  }

  updateRecord(id: string, request: UpdateAttendanceRequest): Observable<AttendanceRecord> {
    return this.api.update(id, request).pipe(
      tap(() => {
        this.notifications.showSuccess('Attendance record updated successfully.');
        this.loadList();
      }),
    );
  }

  deleteRecord(id: string): Observable<void> {
    return this.api.delete(id).pipe(
      tap(() => {
        this.notifications.showSuccess('Attendance record deleted successfully.');

        const { page, limit } = this.query();
        if (page > 1 && this.records().length === 1) {
          this.listQuery.setPage(page - 1, limit);
        } else {
          this.loadList();
        }
      }),
    );
  }
}
