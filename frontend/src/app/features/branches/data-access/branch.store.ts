import { Injectable, inject, signal } from '@angular/core';
import { Observable, finalize, tap } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { Paginated } from '../../../shared/models/paginated.model';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { createListQueryState } from '../../../shared/utils/list-query-state.util';
import { BranchService } from './branch.service';
import { Branch, BranchListQuery, CreateBranchRequest, UpdateBranchRequest } from './branch.models';

const DEFAULT_QUERY: BranchListQuery = {
  page: 1,
  limit: 10,
  sortBy: 'createdAt',
  order: 'desc',
};

const DEFAULT_PAGINATION: Paginated = { page: 1, limit: 10, total: 0, totalPages: 0 };

/**
 * Signal-based Store (blueprint §6), server-side pagination/sort/filter via
 * the shared `createListQueryState` helper (the current convention - see
 * `UsersStore`, its second real consumer after `EmployeeStore`) rather than
 * hand-written query/setPage/setSort/setFilters signals.
 */
@Injectable({ providedIn: 'root' })
export class BranchStore {
  private readonly branchService = inject(BranchService);
  private readonly notificationService = inject(NotificationService);

  readonly branches = signal<Branch[]>([]);
  readonly pagination = signal<Paginated>(DEFAULT_PAGINATION);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly listQuery = createListQueryState<BranchListQuery>(DEFAULT_QUERY, () => this.loadList());
  readonly query = this.listQuery.query;

  loadList(): void {
    this.error.set(null);
    this.loading.set(true);

    this.branchService
      .list(this.query())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ branches, pagination }) => {
          this.branches.set(branches);
          this.pagination.set(pagination);
        },
        error: (error: unknown) => this.error.set(extractErrorMessage(error)),
      });
  }

  setPage(page: number, limit: number): void {
    this.listQuery.setPage(page, limit);
  }

  setSort(sortBy: BranchListQuery['sortBy'], order: BranchListQuery['order']): void {
    this.listQuery.setSort(sortBy, order);
  }

  setFilters(filters: Partial<Pick<BranchListQuery, 'search' | 'status'>>): void {
    this.listQuery.setFilters(filters);
  }

  createBranch(request: CreateBranchRequest): Observable<Branch> {
    return this.branchService.create(request).pipe(
      tap((branch) => {
        this.branches.update((current) => [branch, ...current]);
        this.notificationService.showSuccess('Branch created successfully.');
      }),
    );
  }

  updateBranch(id: string, request: UpdateBranchRequest): Observable<Branch> {
    return this.branchService.update(id, request).pipe(
      tap((branch) => {
        this.branches.update((current) => current.map((existing) => (existing.id === id ? branch : existing)));
        this.notificationService.showSuccess('Branch updated successfully.');
      }),
    );
  }

  deleteBranch(id: string): Observable<void> {
    return this.branchService.delete(id).pipe(
      tap(() => {
        this.branches.update((current) => current.filter((existing) => existing.id !== id));
        this.notificationService.showSuccess('Branch deleted successfully.');
      }),
    );
  }
}
