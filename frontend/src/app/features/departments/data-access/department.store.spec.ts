import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { NotificationService } from '../../../core/notifications/notification.service';
import { Department } from './department.models';
import { DepartmentStore } from './department.store';

const department = (overrides: Partial<Department> = {}): Department => ({
  id: 'd-1',
  name: 'Engineering',
  code: 'ENG',
  status: 'ACTIVE',
  createdAt: '2026-09-23T00:00:00.000Z',
  updatedAt: '2026-09-23T00:00:00.000Z',
  ...overrides,
});

const pagination = (overrides: Partial<{ page: number; limit: number; total: number; totalPages: number }> = {}) => ({
  page: 1,
  limit: 10,
  total: 1,
  totalPages: 1,
  ...overrides,
});

describe('DepartmentStore', () => {
  let store: DepartmentStore;
  let http: HttpTestingController;
  const notifications = { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() };

  const listRequests = (): TestRequest[] =>
    http.match((req) => req.method === 'GET' && req.url.endsWith('/departments'));

  const expectList = (): TestRequest => {
    const [request, ...rest] = listRequests();
    expect(rest).toHaveLength(0);
    return request;
  };

  beforeEach(() => {
    notifications.showSuccess.mockReset();
    notifications.showError.mockReset();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotificationService, useValue: notifications },
      ],
    });

    store = TestBed.inject(DepartmentStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('loadList', () => {
    it('requests the default query and populates state', () => {
      store.loadList();
      expect(store.loading()).toBe(true);

      const request = expectList();
      expect(request.request.params.get('page')).toBe('1');
      expect(request.request.params.get('limit')).toBe('10');
      expect(request.request.params.get('sortBy')).toBe('createdAt');
      expect(request.request.params.get('order')).toBe('desc');
      expect(request.request.params.has('search')).toBe(false);
      expect(request.request.params.has('status')).toBe(false);

      request.flush({ departments: [department()], pagination: pagination({ total: 41, totalPages: 5 }) });

      expect(store.departments()).toHaveLength(1);
      expect(store.pagination().total).toBe(41);
      expect(store.loading()).toBe(false);
      expect(store.error()).toBeNull();
    });

    it("surfaces the backend's message on failure and stops loading", () => {
      store.loadList();

      expectList().flush({ status: 'error', message: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(store.error()).toBe('boom');
      expect(store.loading()).toBe(false);
    });

    it('lets only the latest request write state - a superseded request is cancelled', () => {
      store.loadList();
      store.loadList();

      const [first, second] = listRequests();
      expect(first.cancelled).toBe(true);
      expect(second.cancelled).toBe(false);

      second.flush({ departments: [department({ name: 'Newest' })], pagination: pagination() });

      expect(store.departments()[0].name).toBe('Newest');
      expect(store.loading()).toBe(false);
    });
  });

  describe('query changes', () => {
    it('setFilters sends search/status and resets to page 1', () => {
      store.setPage(3, 10);
      expectList().flush({ departments: [], pagination: pagination({ page: 3 }) });

      store.setFilters({ search: 'eng', status: 'ACTIVE' });

      const request = expectList();
      expect(request.request.params.get('search')).toBe('eng');
      expect(request.request.params.get('status')).toBe('ACTIVE');
      expect(request.request.params.get('page')).toBe('1');
      request.flush({ departments: [], pagination: pagination() });
    });

    it('setSort sends sortBy/order and resets to page 1', () => {
      store.setPage(2, 10);
      expectList().flush({ departments: [], pagination: pagination({ page: 2 }) });

      store.setSort('name', 'asc');

      const request = expectList();
      expect(request.request.params.get('sortBy')).toBe('name');
      expect(request.request.params.get('order')).toBe('asc');
      expect(request.request.params.get('page')).toBe('1');
      request.flush({ departments: [], pagination: pagination() });
    });
  });

  describe('mutations refetch the list instead of patching it locally', () => {
    it('create: POSTs, toasts, then refetches', () => {
      let created: Department | undefined;
      store.createDepartment({ name: 'Engineering' }).subscribe((result) => (created = result));

      const post = http.expectOne((req) => req.method === 'POST' && req.url.endsWith('/departments'));
      expect(post.request.body).toEqual({ name: 'Engineering' });
      post.flush({ department: department() });

      expect(created?.id).toBe('d-1');
      expect(notifications.showSuccess).toHaveBeenCalledWith('Department created successfully.');
      expectList().flush({ departments: [department()], pagination: pagination() });
    });

    it('update: PATCHes, toasts, then refetches', () => {
      store.updateDepartment('d-1', { code: null, status: 'INACTIVE' }).subscribe();

      const patch = http.expectOne((req) => req.method === 'PATCH' && req.url.endsWith('/departments/d-1'));
      expect(patch.request.body).toEqual({ code: null, status: 'INACTIVE' });
      patch.flush({ department: department({ code: null, status: 'INACTIVE' }) });

      expect(notifications.showSuccess).toHaveBeenCalledWith('Department updated successfully.');
      expectList().flush({ departments: [], pagination: pagination({ total: 0, totalPages: 0 }) });
    });

    it('delete: refetches the same page when the page still has other rows', () => {
      store.setPage(2, 10);
      expectList().flush({
        departments: [department({ id: 'a' }), department({ id: 'b' })],
        pagination: pagination({ page: 2, total: 12, totalPages: 2 }),
      });

      store.deleteDepartment('a').subscribe();
      http.expectOne((req) => req.method === 'DELETE' && req.url.endsWith('/departments/a')).flush({ message: 'ok' });

      const refetch = expectList();
      expect(refetch.request.params.get('page')).toBe('2');
      refetch.flush({ departments: [department({ id: 'b' })], pagination: pagination({ page: 2, total: 11 }) });
      expect(notifications.showSuccess).toHaveBeenCalledWith('Department deleted successfully.');
    });

    it('delete: steps back one page when it removes the only row on a later page', () => {
      store.setPage(2, 10);
      expectList().flush({
        departments: [department({ id: 'only' })],
        pagination: pagination({ page: 2, total: 11, totalPages: 2 }),
      });

      store.deleteDepartment('only').subscribe();
      http.expectOne((req) => req.method === 'DELETE' && req.url.endsWith('/departments/only')).flush({ message: 'ok' });

      const refetch = expectList();
      expect(refetch.request.params.get('page')).toBe('1');
      refetch.flush({ departments: [], pagination: pagination({ total: 10 }) });
    });

    it('a failed mutation neither toasts nor refetches, and the error reaches the caller', () => {
      let caught: unknown;
      store.createDepartment({ name: 'Engineering' }).subscribe({ error: (error: unknown) => (caught = error) });

      http
        .expectOne((req) => req.method === 'POST')
        .flush(
          { status: 'error', message: 'A department with this name or code already exists' },
          { status: 409, statusText: 'Conflict' },
        );

      expect(caught).toBeInstanceOf(HttpErrorResponse);
      expect(notifications.showSuccess).not.toHaveBeenCalled();
      expect(listRequests()).toHaveLength(0);
    });
  });
});
