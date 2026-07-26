import { signal } from '@angular/core';

/**
 * The minimum shape every server-side list query needs (blueprint's
 * page/sort/filter Store pattern, first established by `EmployeeStore`).
 * `TQuery` is deliberately not required to extend this via `interface
 * extends` at the call site - callers just need a query object that has
 * at least these fields.
 */
export interface ListQueryBase {
  page: number;
  limit: number;
  sortBy: string;
  order: 'asc' | 'desc';
}

/**
 * Extracted from `EmployeeStore`'s `query`/`setPage`/`setSort`/`setFilters`
 * signals now that Users (Feature: Users Server-Side Pagination) is a
 * second real, validated consumer of the identical pattern - the
 * project's own premature-abstraction rule treats a second consumer as
 * the point extraction stops being premature (blueprint §9).
 *
 * Deliberately framework-agnostic - no `HttpClient`/Router/ActivatedRoute
 * here. `onChange` is the caller's own re-fetch (`loadList`), so this
 * helper owns only the query shape and the "changing a filter/sort
 * always resets to page 1" rule; loading/error state and the actual HTTP
 * call stay in the Store that calls this.
 */
export function createListQueryState<TQuery extends ListQueryBase>(defaultQuery: TQuery, onChange: () => void) {
  const query = signal<TQuery>(defaultQuery);

  const setPage = (page: number, limit: number): void => {
    query.update((current) => ({ ...current, page, limit }));
    onChange();
  };

  const setSort = (sortBy: TQuery['sortBy'], order: TQuery['order']): void => {
    query.update((current) => ({ ...current, sortBy, order, page: 1 }));
    onChange();
  };

  const setFilters = (filters: Partial<TQuery>): void => {
    query.update((current) => ({ ...current, ...filters, page: 1 }));
    onChange();
  };

  // Seeds the query from an external source (e.g. the page component
  // reading initial state from the URL) without triggering `onChange` -
  // the caller is expected to fetch once, explicitly, right after.
  const setInitialQuery = (initial: TQuery): void => {
    query.set(initial);
  };

  return { query, setPage, setSort, setFilters, setInitialQuery };
}
