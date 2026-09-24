import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { NotificationService } from '../../../core/notifications/notification.service';
import { makeEmployeeDto } from './employee.testing';
import { EmployeeStore } from './employee.store';

const pagination = (overrides: Partial<{ page: number; limit: number; total: number; totalPages: number }> = {}) => ({
  page: 1,
  limit: 10,
  total: 1,
  totalPages: 1,
  ...overrides,
});

describe('EmployeeStore', () => {
  let store: EmployeeStore;
  let http: HttpTestingController;
  const notifications = { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() };

  const listRequests = (): TestRequest[] => http.match((req) => req.method === 'GET' && req.url.endsWith('/employees'));

  const expectList = (): TestRequest => {
    const [request, ...rest] = listRequests();
    expect(rest).toHaveLength(0);
    return request;
  };

  beforeEach(() => {
    notifications.showSuccess.mockReset();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotificationService, useValue: notifications },
      ],
    });

    store = TestBed.inject(EmployeeStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('list', () => {
    it('requests the default query, maps the real wire shape, and populates state', () => {
      store.loadList();
      expect(store.loading()).toBe(true);

      const request = expectList();
      expect(request.request.params.get('page')).toBe('1');
      expect(request.request.params.get('limit')).toBe('10');
      expect(request.request.params.get('sortBy')).toBe('createdAt');
      expect(request.request.params.get('order')).toBe('desc');
      request.flush({
        employees: [makeEmployeeDto({ departmentId: 'dep-9', salary: '2500.5' })],
        pagination: pagination({ total: 18, totalPages: 2 }),
      });

      expect(store.employees()).toHaveLength(1);
      expect(store.employees()[0].departmentId).toBe('dep-9');
      expect(store.employees()[0].salary).toBe(2500.5);
      expect(store.pagination().total).toBe(18);
      expect(store.loading()).toBe(false);
    });

    it("surfaces the backend's message on failure and stops loading", () => {
      store.loadList();

      expectList().flush({ status: 'error', message: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(store.error()).toBe('boom');
      expect(store.loading()).toBe(false);
    });

    it('filters by the real keys (departmentId / designationId / employmentType) and resets to page 1', () => {
      store.setPage(3, 10);
      expectList().flush({ employees: [], pagination: pagination({ page: 3 }) });

      store.setFilters({ search: 'jane', departmentId: 'dep-1', designationId: 'des-2', employmentType: 'CONTRACT' });

      const request = expectList();
      expect(request.request.params.get('search')).toBe('jane');
      expect(request.request.params.get('departmentId')).toBe('dep-1');
      expect(request.request.params.get('designationId')).toBe('des-2');
      expect(request.request.params.get('employmentType')).toBe('CONTRACT');
      expect(request.request.params.get('page')).toBe('1');
      // The retired free-text filters were silently ignored by the API - they must not come back.
      expect(request.request.params.has('department')).toBe(false);
      expect(request.request.params.has('jobTitle')).toBe(false);
      request.flush({ employees: [], pagination: pagination() });
    });

    it.each(['department', 'designation', 'employmentType', 'salary', 'dateOfJoining'] as const)(
      'sorts by the backend whitelist key "%s" (never jobTitle, which is a 400)',
      (sortBy) => {
        store.setSort(sortBy, 'asc');

        const request = expectList();
        expect(request.request.params.get('sortBy')).toBe(sortBy);
        expect(request.request.params.get('order')).toBe('asc');
        request.flush({ employees: [], pagination: pagination() });
      },
    );

    it('lets only the latest request write state - a superseded request is cancelled', () => {
      store.loadList();
      store.loadList();

      const [first, second] = listRequests();
      expect(first.cancelled).toBe(true);
      expect(second.cancelled).toBe(false);

      second.flush({ employees: [makeEmployeeDto({ id: 'newest' })], pagination: pagination() });

      expect(store.employees()[0].id).toBe('newest');
    });

    it('stays loading while the latest request is in flight, even though the superseded one was cancelled', () => {
      // Guards the ordering rule: unsubscribing runs the old request's finalize(),
      // so loading must be set to true AFTER unsubscribing.
      store.loadList();
      store.loadList();

      expect(store.loading()).toBe(true);
      listRequests().forEach((request) => !request.cancelled && request.flush({ employees: [], pagination: pagination() }));
    });
  });

  describe('create', () => {
    it('POSTs the new contract (ids + enum, no free text), toasts, and touches NO list state', () => {
      let created;
      store
        .createEmployee({
          departmentId: 'dep-1',
          designationId: 'des-1',
          employmentType: 'FULL_TIME',
          salary: 1000,
          dateOfJoining: new Date(2024, 0, 1),
        })
        .subscribe((result) => (created = result));

      const post = http.expectOne((req) => req.method === 'POST' && req.url.endsWith('/employees'));
      expect(post.request.body).toMatchObject({
        departmentId: 'dep-1',
        designationId: 'des-1',
        employmentType: 'FULL_TIME',
        salary: 1000,
        dateOfJoining: '2024-01-01',
      });
      expect(post.request.body).not.toHaveProperty('department');
      expect(post.request.body).not.toHaveProperty('jobTitle');
      post.flush({ employee: makeEmployeeDto({ id: 'new-1' }) });

      expect(created).toMatchObject({ id: 'new-1' });
      expect(notifications.showSuccess).toHaveBeenCalledWith('Employee created successfully.');
      // Create navigates to the detail page and the list reloads on entry - nothing to fetch here.
      expect(listRequests()).toHaveLength(0);
      expect(store.employees()).toEqual([]);
    });
  });

  describe('update', () => {
    it('PATCHes only what it is given, refreshes the selected record, toasts, and does not refetch the list', () => {
      store.loadOne('emp-1');
      http.expectOne((req) => req.method === 'GET' && req.url.endsWith('/employees/emp-1')).flush({
        employee: makeEmployeeDto(),
      });
      expect(store.selected()?.salary).toBe(1000);

      store.updateEmployee('emp-1', { salary: 2000, branchId: null }).subscribe();

      const patch = http.expectOne((req) => req.method === 'PATCH' && req.url.endsWith('/employees/emp-1'));
      expect(patch.request.body).toEqual({ salary: 2000, branchId: null });
      patch.flush({ employee: makeEmployeeDto({ salary: '2000' }) });

      expect(store.selected()?.salary).toBe(2000);
      expect(notifications.showSuccess).toHaveBeenCalledWith('Employee updated successfully.');
      expect(listRequests()).toHaveLength(0);
    });

    it('leaves a different selected record alone', () => {
      store.loadOne('emp-2');
      http.expectOne((req) => req.url.endsWith('/employees/emp-2')).flush({ employee: makeEmployeeDto({ id: 'emp-2', salary: '5' }) });

      store.updateEmployee('emp-1', { salary: 9 }).subscribe();
      http.expectOne((req) => req.method === 'PATCH').flush({ employee: makeEmployeeDto({ id: 'emp-1', salary: '9' }) });

      expect(store.selected()?.id).toBe('emp-2');
      expect(store.selected()?.salary).toBe(5);
    });
  });

  describe('delete', () => {
    const loadRows = (rows: string[], overrides: Partial<{ page: number; total: number; totalPages: number }> = {}) => {
      store.loadList();
      expectList().flush({
        employees: rows.map((id) => makeEmployeeDto({ id })),
        pagination: pagination(overrides),
      });
    };

    it('refetches the same page when the deleted row is in the list and others remain', () => {
      store.setPage(2, 10);
      expectList().flush({ employees: [makeEmployeeDto({ id: 'a' }), makeEmployeeDto({ id: 'b' })], pagination: pagination({ page: 2, total: 12, totalPages: 2 }) });

      store.deleteEmployee('a').subscribe();
      http.expectOne((req) => req.method === 'DELETE' && req.url.endsWith('/employees/a')).flush({ message: 'ok' });

      const refetch = expectList();
      expect(refetch.request.params.get('page')).toBe('2');
      refetch.flush({ employees: [makeEmployeeDto({ id: 'b' })], pagination: pagination({ page: 2 }) });
      expect(notifications.showSuccess).toHaveBeenCalledWith('Employee deleted successfully.');
    });

    it('steps back one page when it removes the only row on a later page', () => {
      store.setPage(2, 10);
      expectList().flush({ employees: [makeEmployeeDto({ id: 'only' })], pagination: pagination({ page: 2, total: 11, totalPages: 2 }) });

      store.deleteEmployee('only').subscribe();
      http.expectOne((req) => req.method === 'DELETE').flush({ message: 'ok' });

      const refetch = expectList();
      expect(refetch.request.params.get('page')).toBe('1');
      refetch.flush({ employees: [], pagination: pagination() });
    });

    it('does NOT refetch when the deleted employee is not in the loaded list (a delete from the detail page)', () => {
      loadRows(['a', 'b']);

      store.deleteEmployee('not-in-the-list').subscribe();
      http.expectOne((req) => req.method === 'DELETE').flush({ message: 'ok' });

      expect(listRequests()).toHaveLength(0);
      expect(notifications.showSuccess).toHaveBeenCalledWith('Employee deleted successfully.');
    });

    it('a failed delete neither toasts nor refetches, and the error reaches the caller', () => {
      loadRows(['a']);
      let caught: unknown;

      store.deleteEmployee('a').subscribe({ error: (error: unknown) => (caught = error) });
      http.expectOne((req) => req.method === 'DELETE').flush({ status: 'error', message: 'nope' }, { status: 409, statusText: 'Conflict' });

      expect(caught).toBeTruthy();
      expect(notifications.showSuccess).not.toHaveBeenCalled();
      expect(listRequests()).toHaveLength(0);
    });
  });
});
