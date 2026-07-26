import { Injectable, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';

import { UserListItem } from '../../../core/users/user.models';
import { Paginated } from '../../../shared/models/paginated.model';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { createListQueryState } from '../../../shared/utils/list-query-state.util';
import { UserListQuery } from './user.model';
import { UserService } from './user.service';

const DEFAULT_QUERY: UserListQuery = {
  page: 1,
  limit: 10,
  sortBy: 'createdAt',
  order: 'desc',
};

const DEFAULT_PAGINATION: Paginated = { page: 1, limit: 10, total: 0, totalPages: 0 };

/**
 * Signal-based Store (blueprint §6), server-side pagination/sort/filter -
 * the real second consumer of the exact pattern `EmployeeStore` (Feature
 * 6) established, now factored through the shared `createListQueryState`
 * helper instead of duplicated by hand. Replaces the previous client-side
 * `filteredUsers` computed() - the backend now does real search/filter/
 * sort/pagination (Users Server-Side Pagination pass), so this Store's
 * job matches `EmployeeStore`'s exactly: hold the current page of data
 * and the query that produced it, never the whole table.
 */
@Injectable({ providedIn: 'root' })
export class UsersStore {
  private readonly userService = inject(UserService);

  readonly users = signal<UserListItem[]>([]);
  readonly pagination = signal<Paginated>(DEFAULT_PAGINATION);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly listQuery = createListQueryState<UserListQuery>(DEFAULT_QUERY, () => this.loadList());
  readonly query = this.listQuery.query;

  loadList(): void {
    this.error.set(null);
    this.loading.set(true);

    this.userService
      .list(this.query())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ users, pagination }) => {
          this.users.set(users);
          this.pagination.set(pagination);
        },
        error: (error: unknown) => this.error.set(extractErrorMessage(error)),
      });
  }

  setPage(page: number, limit: number): void {
    this.listQuery.setPage(page, limit);
  }

  setSort(sortBy: UserListQuery['sortBy'], order: UserListQuery['order']): void {
    this.listQuery.setSort(sortBy, order);
  }

  setFilters(filters: Partial<Pick<UserListQuery, 'search' | 'role'>>): void {
    this.listQuery.setFilters(filters);
  }

  /** Seeds the query from the URL (page-component's job) before the first `loadList()`. */
  setInitialQuery(query: UserListQuery): void {
    this.listQuery.setInitialQuery(query);
  }
}
