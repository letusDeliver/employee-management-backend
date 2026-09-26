import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';

import { Paginated } from '../models/paginated.model';
import { createPagedList } from './paged-list.util';

interface Q {
  page: number;
  limit: number;
  sortBy: string;
  order: 'asc' | 'desc';
  status?: string;
}

const pageOf = (items: string[], page = 1, total = items.length): { items: string[]; pagination: Paginated } => ({
  items,
  pagination: { page, limit: 10, total, totalPages: Math.max(1, Math.ceil(total / 10)) },
});

describe('createPagedList', () => {
  const DEFAULT: Q = { page: 1, limit: 10, sortBy: 'date', order: 'desc' };
  let requests: { query: Q; subject: Subject<ReturnType<typeof pageOf>> }[];

  // One Subject per fetch, so a spec decides when (and whether) each request answers.
  const make = () =>
    createPagedList<string, Q>((query) => {
      const subject = new Subject<ReturnType<typeof pageOf>>();
      requests.push({ query, subject });
      return subject.asObservable();
    }, DEFAULT);

  beforeEach(() => (requests = []));

  it('loads with the default query and stores the page', () => {
    const list = make();
    list.load();

    expect(list.loading()).toBe(true);
    expect(requests[0].query).toEqual(DEFAULT);

    requests[0].subject.next(pageOf(['a', 'b']));
    requests[0].subject.complete();

    expect(list.items()).toEqual(['a', 'b']);
    expect(list.pagination().total).toBe(2);
    expect(list.loading()).toBe(false);
    expect(list.error()).toBeNull();
  });

  it('reports the failure message', () => {
    const list = make();
    list.load();
    requests[0].subject.error(new HttpErrorResponse({ status: 500, error: { status: 'error', message: 'boom' } }));

    expect(list.error()).toBe('boom');
    expect(list.loading()).toBe(false);
  });

  it('lets only the latest request write to state', () => {
    const list = make();
    list.load();
    list.load();

    // The first request's subscription was cancelled, so a late answer from it is ignored.
    requests[0].subject.next(pageOf(['stale']));
    requests[1].subject.next(pageOf(['fresh']));
    requests[1].subject.complete();

    expect(list.items()).toEqual(['fresh']);
    expect(list.loading()).toBe(false);
  });

  it('returns to page 1 and refetches when a filter or the sort changes', () => {
    const list = make();
    list.setPage(3, 10);
    expect(requests.at(-1)!.query.page).toBe(3);

    list.setFilters({ status: 'PENDING' });
    expect(requests.at(-1)!.query).toMatchObject({ page: 1, status: 'PENDING' });

    list.setPage(2, 10);
    list.setSort('status', 'asc');
    expect(requests.at(-1)!.query).toMatchObject({ page: 1, sortBy: 'status', order: 'asc' });
  });

  it('clears a filter set to undefined', () => {
    const list = make();
    list.setFilters({ status: 'PENDING' });
    list.setFilters({ status: undefined });

    expect(requests.at(-1)!.query.status).toBeUndefined();
  });

  describe('reloadAfterRemoval', () => {
    it('reloads the same page when other rows remain', () => {
      const list = make();
      list.setPage(2, 10);
      requests.at(-1)!.subject.next(pageOf(['a', 'b'], 2, 12));

      list.reloadAfterRemoval();

      expect(requests.at(-1)!.query.page).toBe(2);
    });

    it('steps back a page when the only row of a later page went', () => {
      const list = make();
      list.setPage(2, 10);
      requests.at(-1)!.subject.next(pageOf(['only'], 2, 11));

      list.reloadAfterRemoval();

      expect(requests.at(-1)!.query.page).toBe(1);
    });

    it('stays on page 1 when its last row went', () => {
      const list = make();
      list.load();
      requests.at(-1)!.subject.next(pageOf(['only']));

      list.reloadAfterRemoval();

      expect(requests.at(-1)!.query.page).toBe(1);
    });
  });
});
