import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subscription, finalize, tap } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { Paginated } from '../../../shared/models/paginated.model';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { createListQueryState } from '../../../shared/utils/list-query-state.util';
import { DepartmentService } from './department.service';
import {
  CreateDepartmentRequest,
  Department,
  DepartmentListQuery,
  UpdateDepartmentRequest,
} from './department.models';

const DEFAULT_QUERY: DepartmentListQuery = {
  page: 1,
  limit: 10,
  sortBy: 'createdAt',
  order: 'desc',
};

const DEFAULT_PAGINATION: Paginated = { page: 1, limit: 10, total: 0, totalPages: 0 };

/**
 * Signal-based Store (blueprint §6), server-side pagination/sort/filter via
 * `createListQueryState` - same as `BranchStore`. One deliberate difference:
 * every successful mutation refetches the list instead of patching the local
 * array. With server-side paging, a locally patched row can land on the wrong
 * page or sort position, leave `pagination.total` stale, or survive an edit
 * that no longer matches the active status filter. A refetch still trusts
 * only the server's response (§6's no-optimistic-UI rule) at the cost of one
 * extra GET on a list of tens of rows.
 */
@Injectable({ providedIn: 'root' })
export class DepartmentStore {
  private readonly departmentService = inject(DepartmentService);
  private readonly notificationService = inject(NotificationService);

  readonly departments = signal<Department[]>([]);
  readonly pagination = signal<Paginated>(DEFAULT_PAGINATION);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly listQuery = createListQueryState<DepartmentListQuery>(DEFAULT_QUERY, () => this.loadList());
  readonly query = this.listQuery.query;

  // Only the latest list request may write to state - a slow earlier
  // response (e.g. an older search term) must not overwrite a newer one.
  private listSubscription: Subscription | null = null;

  loadList(): void {
    this.listSubscription?.unsubscribe();
    this.error.set(null);
    this.loading.set(true);

    this.listSubscription = this.departmentService
      .list(this.query())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ departments, pagination }) => {
          this.departments.set(departments);
          this.pagination.set(pagination);
        },
        error: (error: unknown) => this.error.set(extractErrorMessage(error)),
      });
  }

  setPage(page: number, limit: number): void {
    this.listQuery.setPage(page, limit);
  }

  setSort(sortBy: DepartmentListQuery['sortBy'], order: DepartmentListQuery['order']): void {
    this.listQuery.setSort(sortBy, order);
  }

  setFilters(filters: Partial<Pick<DepartmentListQuery, 'search' | 'status'>>): void {
    this.listQuery.setFilters(filters);
  }

  createDepartment(request: CreateDepartmentRequest): Observable<Department> {
    return this.departmentService.create(request).pipe(
      tap(() => {
        this.notificationService.showSuccess('Department created successfully.');
        this.loadList();
      }),
    );
  }

  updateDepartment(id: string, request: UpdateDepartmentRequest): Observable<Department> {
    return this.departmentService.update(id, request).pipe(
      tap(() => {
        this.notificationService.showSuccess('Department updated successfully.');
        this.loadList();
      }),
    );
  }

  deleteDepartment(id: string): Observable<void> {
    return this.departmentService.delete(id).pipe(
      tap(() => {
        this.notificationService.showSuccess('Department deleted successfully.');

        // Deleting the only row on a later page would leave that page empty
        // (the server has one fewer page now) - step back one page instead.
        const { page, limit } = this.query();
        if (page > 1 && this.departments().length === 1) {
          this.listQuery.setPage(page - 1, limit);
        } else {
          this.loadList();
        }
      }),
    );
  }
}
