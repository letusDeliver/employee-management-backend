import { signal } from '@angular/core';
import { Observable, Subscription, finalize } from 'rxjs';

import { Paginated } from '../models/paginated.model';
import { extractErrorMessage } from './extract-error-message.util';
import { ListQueryBase, createListQueryState } from './list-query-state.util';

const EMPTY_PAGINATION: Paginated = { page: 1, limit: 10, total: 0, totalPages: 0 };

/**
 * The state every server-paginated ledger repeats: the current page of rows, its pagination,
 * loading/error, and the query (page/sort/filters) with the "a filter or sort change returns to
 * page 1" rule. Extracted when Leave's three stores (requests, balances, "my requests") made it the
 * third identical consumer - `AttendanceStore` predates it and has not been moved onto it yet.
 *
 * `load()` cancels a superseded request (unsubscribing FIRST runs the old request's `finalize`, so
 * `loading` cannot flip back to false right after the new request set it) and only the latest one
 * may write to state. `reloadAfterRemoval()` is for a delete/cancel/decision that may empty the
 * page: it steps back one page instead of showing an empty later page.
 *
 * Call it in a field initialiser; `fetch` is read lazily, so it may close over an injected service.
 */
export function createPagedList<T, Q extends ListQueryBase>(
  fetch: (query: Q) => Observable<{ items: T[]; pagination: Paginated }>,
  defaultQuery: Q,
) {
  const items = signal<T[]>([]);
  const pagination = signal<Paginated>(EMPTY_PAGINATION);
  const loading = signal(false);
  const error = signal<string | null>(null);

  let subscription: Subscription | null = null;

  const state = createListQueryState<Q>(defaultQuery, () => load());

  function load(): void {
    subscription?.unsubscribe();
    error.set(null);
    loading.set(true);

    subscription = fetch(state.query())
      .pipe(finalize(() => loading.set(false)))
      .subscribe({
        next: (page) => {
          items.set(page.items);
          pagination.set(page.pagination);
        },
        error: (failure: unknown) => error.set(extractErrorMessage(failure)),
      });
  }

  function reloadAfterRemoval(): void {
    const { page, limit } = state.query();
    if (page > 1 && items().length === 1) {
      state.setPage(page - 1, limit);
    } else {
      load();
    }
  }

  return {
    items,
    pagination,
    loading,
    error,
    query: state.query,
    load,
    reloadAfterRemoval,
    setPage: state.setPage,
    setSort: state.setSort,
    setFilters: state.setFilters,
  };
}
