import { provideHttpClient } from '@angular/common/http';
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

const pagination = { page: 1, limit: 10, total: 1, totalPages: 1 };

/**
 * Wiring spec: the shared behaviour (refetch, cancellation, step-back) is
 * proven once in `master-data.store.spec.ts`. This spec proves only what is
 * Department's own - its endpoint path, its `departments`/`department`
 * response keys, its request bodies, and its wording.
 */
describe('DepartmentStore (Department wiring)', () => {
  let store: DepartmentStore;
  let http: HttpTestingController;
  const notifications = { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() };

  const expectList = (): TestRequest => http.expectOne((req) => req.method === 'GET' && req.url.endsWith('/departments'));

  beforeEach(() => {
    notifications.showSuccess.mockReset();

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

  it('lists from GET /departments with the query params and maps the `departments` key into items', () => {
    store.setFilters({ search: 'eng', status: 'ACTIVE' });

    const request = expectList();
    expect(request.request.params.get('search')).toBe('eng');
    expect(request.request.params.get('status')).toBe('ACTIVE');
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('sortBy')).toBe('createdAt');
    request.flush({ departments: [department()], pagination: { ...pagination, total: 41, totalPages: 5 } });

    expect(store.items()).toHaveLength(1);
    expect(store.items()[0].name).toBe('Engineering');
    expect(store.pagination().total).toBe(41);
  });

  it('creates via POST /departments, unwraps `department`, toasts "Department created", then refetches', () => {
    let created: Department | undefined;
    store.createRecord({ name: 'Engineering' }).subscribe((result) => (created = result));

    const post = http.expectOne((req) => req.method === 'POST' && req.url.endsWith('/departments'));
    expect(post.request.body).toEqual({ name: 'Engineering' });
    post.flush({ department: department() });

    expect(created?.id).toBe('d-1');
    expect(notifications.showSuccess).toHaveBeenCalledWith('Department created successfully.');
    expectList().flush({ departments: [], pagination });
  });

  it('updates via PATCH /departments/:id and sends null (not omitted) to clear the code', () => {
    store.updateRecord('d-1', { code: null, status: 'INACTIVE' }).subscribe();

    const patch = http.expectOne((req) => req.method === 'PATCH' && req.url.endsWith('/departments/d-1'));
    expect(patch.request.body).toEqual({ code: null, status: 'INACTIVE' });
    patch.flush({ department: department({ code: null, status: 'INACTIVE' }) });

    expect(notifications.showSuccess).toHaveBeenCalledWith('Department updated successfully.');
    expectList().flush({ departments: [], pagination });
  });

  it('deletes via DELETE /departments/:id, toasts "Department deleted", then refetches', () => {
    store.deleteRecord('d-1').subscribe();

    http.expectOne((req) => req.method === 'DELETE' && req.url.endsWith('/departments/d-1')).flush({ message: 'ok' });

    expect(notifications.showSuccess).toHaveBeenCalledWith('Department deleted successfully.');
    expectList().flush({ departments: [], pagination });
  });
});
