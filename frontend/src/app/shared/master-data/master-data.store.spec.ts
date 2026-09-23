import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { NotificationService } from '../../core/notifications/notification.service';
import { MasterDataApi, MasterDataLabels, MasterDataListQuery, MasterDataPage, MasterDataRecord } from './master-data.models';
import { MasterDataStore } from './master-data.store';

const record = (overrides: Partial<MasterDataRecord> = {}): MasterDataRecord => ({
  id: 'r-1',
  name: 'Engineering',
  code: 'ENG',
  status: 'ACTIVE',
  createdAt: '2026-09-23T00:00:00.000Z',
  updatedAt: '2026-09-23T00:00:00.000Z',
  ...overrides,
});

const page = (
  items: MasterDataRecord[],
  pagination: Partial<{ page: number; limit: number; total: number; totalPages: number }> = {},
): MasterDataPage<MasterDataRecord> => ({
  items,
  pagination: { page: 1, limit: 10, total: items.length, totalPages: 1, ...pagination },
});

describe('MasterDataStore', () => {
  const api = {
    list: vi.fn<(query: MasterDataListQuery) => Observable<MasterDataPage<MasterDataRecord>>>(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const notifications = { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() };

  // The smallest possible concrete store - proves the base class works when
  // a subclass supplies `api`/`labels` AFTER the base constructor has run.
  class TestStore extends MasterDataStore<MasterDataRecord> {
    protected readonly api: MasterDataApi<MasterDataRecord> = api;
    readonly labels: MasterDataLabels = { singular: 'Widget', plural: 'Widgets' };
  }

  let store: TestStore;

  const lastListQuery = (): MasterDataListQuery => api.list.mock.calls.at(-1)![0];

  beforeEach(() => {
    api.list.mockReset();
    api.create.mockReset();
    api.update.mockReset();
    api.delete.mockReset();
    notifications.showSuccess.mockReset();
    api.list.mockReturnValue(of(page([])));

    TestBed.configureTestingModule({ providers: [{ provide: NotificationService, useValue: notifications }] });
    store = TestBed.runInInjectionContext(() => new TestStore());
  });

  describe('loadList', () => {
    it('requests the default query and populates state', () => {
      api.list.mockReturnValue(of(page([record()], { total: 41, totalPages: 5 })));

      store.loadList();

      expect(api.list).toHaveBeenCalledWith({ page: 1, limit: 10, sortBy: 'createdAt', order: 'desc' });
      expect(store.items()).toHaveLength(1);
      expect(store.pagination().total).toBe(41);
      expect(store.loading()).toBe(false);
      expect(store.error()).toBeNull();
    });

    it("surfaces the backend's message on failure and stops loading", () => {
      api.list.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500, error: { status: 'error', message: 'boom' } })),
      );

      store.loadList();

      expect(store.error()).toBe('boom');
      expect(store.loading()).toBe(false);
    });

    it('lets only the latest request write state - a superseded request is unsubscribed', () => {
      const first = new Subject<MasterDataPage<MasterDataRecord>>();
      const second = new Subject<MasterDataPage<MasterDataRecord>>();
      api.list.mockReturnValueOnce(first).mockReturnValueOnce(second);

      store.loadList();
      store.loadList();

      expect(first.observed).toBe(false);
      expect(second.observed).toBe(true);

      second.next(page([record({ name: 'Newest' })]));
      second.complete();

      expect(store.items()[0].name).toBe('Newest');
    });

    it('stays loading while the latest request is in flight, even though the superseded one was cancelled', () => {
      // Guards the ordering rule: unsubscribing runs the old request's
      // finalize(), so loading must be set to true AFTER unsubscribing.
      api.list.mockReturnValueOnce(new Subject()).mockReturnValueOnce(new Subject());

      store.loadList();
      store.loadList();

      expect(store.loading()).toBe(true);
    });
  });

  describe('query changes', () => {
    it('setFilters sends search/status and resets to page 1', () => {
      store.setPage(3, 10);

      store.setFilters({ search: 'eng', status: 'ACTIVE' });

      expect(lastListQuery()).toMatchObject({ search: 'eng', status: 'ACTIVE', page: 1 });
    });

    it('setSort sends sortBy/order and resets to page 1', () => {
      store.setPage(2, 10);

      store.setSort('name', 'asc');

      expect(lastListQuery()).toMatchObject({ sortBy: 'name', order: 'asc', page: 1 });
    });
  });

  describe('mutations refetch the list instead of patching it locally', () => {
    it('create: calls the API, toasts with the label, then refetches', () => {
      api.create.mockReturnValue(of(record()));
      const listCallsBefore = api.list.mock.calls.length;
      let created: MasterDataRecord | undefined;

      store.createRecord({ name: 'Engineering' }).subscribe((result) => (created = result));

      expect(api.create).toHaveBeenCalledWith({ name: 'Engineering' });
      expect(created?.id).toBe('r-1');
      expect(notifications.showSuccess).toHaveBeenCalledWith('Widget created successfully.');
      expect(api.list.mock.calls.length).toBe(listCallsBefore + 1);
    });

    it('update: calls the API, toasts, then refetches', () => {
      api.update.mockReturnValue(of(record({ code: null })));
      const listCallsBefore = api.list.mock.calls.length;

      store.updateRecord('r-1', { code: null, status: 'INACTIVE' }).subscribe();

      expect(api.update).toHaveBeenCalledWith('r-1', { code: null, status: 'INACTIVE' });
      expect(notifications.showSuccess).toHaveBeenCalledWith('Widget updated successfully.');
      expect(api.list.mock.calls.length).toBe(listCallsBefore + 1);
    });

    it('delete: refetches the same page when the page still has other rows', () => {
      api.list.mockReturnValue(of(page([record({ id: 'a' }), record({ id: 'b' })], { page: 2, total: 12, totalPages: 2 })));
      api.delete.mockReturnValue(of(undefined));
      store.setPage(2, 10);

      store.deleteRecord('a').subscribe();

      expect(lastListQuery().page).toBe(2);
      expect(notifications.showSuccess).toHaveBeenCalledWith('Widget deleted successfully.');
    });

    it('delete: steps back one page when it removes the only row on a later page', () => {
      api.list.mockReturnValue(of(page([record({ id: 'only' })], { page: 2, total: 11, totalPages: 2 })));
      api.delete.mockReturnValue(of(undefined));
      store.setPage(2, 10);

      store.deleteRecord('only').subscribe();

      expect(lastListQuery().page).toBe(1);
    });

    it('a failed mutation neither toasts nor refetches, and the error reaches the caller', () => {
      api.create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
      const listCallsBefore = api.list.mock.calls.length;
      let caught: unknown;

      store.createRecord({ name: 'Engineering' }).subscribe({ error: (error: unknown) => (caught = error) });

      expect(caught).toBeInstanceOf(HttpErrorResponse);
      expect(notifications.showSuccess).not.toHaveBeenCalled();
      expect(api.list.mock.calls.length).toBe(listCallsBefore);
    });
  });
});
