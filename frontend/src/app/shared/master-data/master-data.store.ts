import { inject, signal } from '@angular/core';
import { Observable, Subscription, finalize, tap } from 'rxjs';

import { NotificationService } from '../../core/notifications/notification.service';
import { Paginated } from '../models/paginated.model';
import { extractErrorMessage } from '../utils/extract-error-message.util';
import { createListQueryState } from '../utils/list-query-state.util';
import {
  CreateMasterDataRequest,
  MasterDataApi,
  MasterDataLabels,
  MasterDataListQuery,
  MasterDataRecord,
  UpdateMasterDataRequest,
} from './master-data.models';

const DEFAULT_QUERY: MasterDataListQuery = {
  page: 1,
  limit: 10,
  sortBy: 'createdAt',
  order: 'desc',
};

const DEFAULT_PAGINATION: Paginated = { page: 1, limit: 10, total: 0, totalPages: 0 };

/**
 * The shared behaviour of every master-data list screen (blueprint §6),
 * extracted from `DepartmentStore` once Designation proved a second,
 * genuinely identical consumer over a fixed backend contract. This is the
 * app's first abstract base class - deliberately narrow: a concrete domain
 * store is `providedIn: 'root'`, supplies its `api` and `labels`, and
 * inherits everything below.
 *
 * Every successful mutation refetches the list instead of patching the local
 * array. With server-side paging a locally patched row can land on the wrong
 * page or sort position, leave `pagination.total` stale, or survive an edit
 * that no longer matches the active status filter. A refetch still trusts
 * only the server's response (§6's no-optimistic-UI rule) at the cost of one
 * extra GET on a list of tens of rows.
 *
 * Initialisation-order note: field initialisers here run BEFORE the
 * subclass's, so `api` and `labels` must never be read in this class's
 * constructor/initialisers - only inside methods, which run later.
 */
export abstract class MasterDataStore<
  T extends MasterDataRecord,
  C extends CreateMasterDataRequest = CreateMasterDataRequest,
  U extends UpdateMasterDataRequest = UpdateMasterDataRequest,
> {
  protected abstract readonly api: MasterDataApi<T, C, U>;
  abstract readonly labels: MasterDataLabels;

  private readonly notificationService = inject(NotificationService);

  readonly items = signal<T[]>([]);
  readonly pagination = signal<Paginated>(DEFAULT_PAGINATION);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly listQuery = createListQueryState<MasterDataListQuery>(DEFAULT_QUERY, () => this.loadList());
  readonly query = this.listQuery.query;

  // Only the latest list request may write to state - a slow earlier
  // response (e.g. an older search term) must not overwrite a newer one.
  private listSubscription: Subscription | null = null;

  loadList(): void {
    // Unsubscribe FIRST: unsubscribing runs the old request's `finalize()`,
    // which would otherwise flip `loading` back to false right after the new
    // request set it to true.
    this.listSubscription?.unsubscribe();
    this.error.set(null);
    this.loading.set(true);

    this.listSubscription = this.api
      .list(this.query())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ items, pagination }) => {
          this.items.set(items);
          this.pagination.set(pagination);
        },
        error: (error: unknown) => this.error.set(extractErrorMessage(error)),
      });
  }

  setPage(page: number, limit: number): void {
    this.listQuery.setPage(page, limit);
  }

  setSort(sortBy: MasterDataListQuery['sortBy'], order: MasterDataListQuery['order']): void {
    this.listQuery.setSort(sortBy, order);
  }

  setFilters(filters: Partial<Pick<MasterDataListQuery, 'search' | 'status'>>): void {
    this.listQuery.setFilters(filters);
  }

  createRecord(request: C): Observable<T> {
    return this.api.create(request).pipe(
      tap(() => {
        this.notificationService.showSuccess(`${this.labels.singular} created successfully.`);
        this.loadList();
      }),
    );
  }

  updateRecord(id: string, request: U): Observable<T> {
    return this.api.update(id, request).pipe(
      tap(() => {
        this.notificationService.showSuccess(`${this.labels.singular} updated successfully.`);
        this.loadList();
      }),
    );
  }

  deleteRecord(id: string): Observable<void> {
    return this.api.delete(id).pipe(
      tap(() => {
        this.notificationService.showSuccess(`${this.labels.singular} deleted successfully.`);

        // Deleting the only row on a later page would leave that page empty
        // (the server has one fewer page now) - step back one page instead.
        const { page, limit } = this.query();
        if (page > 1 && this.items().length === 1) {
          this.listQuery.setPage(page - 1, limit);
        } else {
          this.loadList();
        }
      }),
    );
  }
}
