import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { NotificationService } from '../../../core/notifications/notification.service';
import { Designation } from './designation.models';
import { DesignationStore } from './designation.store';

const designation = (overrides: Partial<Designation> = {}): Designation => ({
  id: 'ds-1',
  name: 'Backend Engineer',
  code: 'SWE',
  status: 'ACTIVE',
  createdAt: '2026-09-23T00:00:00.000Z',
  updatedAt: '2026-09-23T00:00:00.000Z',
  ...overrides,
});

const pagination = { page: 1, limit: 10, total: 1, totalPages: 1 };

/**
 * Wiring spec: the shared behaviour (refetch, cancellation, step-back) is
 * proven once in `master-data.store.spec.ts`. This spec proves only what is
 * Designation's own - its endpoint path, its `designations`/`designation`
 * response keys, its request bodies, and its wording.
 */
describe('DesignationStore (Designation wiring)', () => {
  let store: DesignationStore;
  let http: HttpTestingController;
  const notifications = { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() };

  const expectList = (): TestRequest =>
    http.expectOne((req) => req.method === 'GET' && req.url.endsWith('/designations'));

  beforeEach(() => {
    notifications.showSuccess.mockReset();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotificationService, useValue: notifications },
      ],
    });

    store = TestBed.inject(DesignationStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('has its own wording', () => {
    expect(store.labels).toEqual({ singular: 'Designation', plural: 'Designations' });
  });

  it('lists from GET /designations with the query params and maps the `designations` key into items', () => {
    store.setFilters({ search: 'engineer', status: 'ACTIVE' });

    const request = expectList();
    expect(request.request.params.get('search')).toBe('engineer');
    expect(request.request.params.get('status')).toBe('ACTIVE');
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('sortBy')).toBe('createdAt');
    request.flush({ designations: [designation()], pagination: { ...pagination, total: 41, totalPages: 5 } });

    expect(store.items()).toHaveLength(1);
    expect(store.items()[0].name).toBe('Backend Engineer');
    expect(store.pagination().total).toBe(41);
  });

  it('creates via POST /designations, unwraps `designation`, toasts "Designation created", then refetches', () => {
    let created: Designation | undefined;
    store.createRecord({ name: 'Backend Engineer' }).subscribe((result) => (created = result));

    const post = http.expectOne((req) => req.method === 'POST' && req.url.endsWith('/designations'));
    expect(post.request.body).toEqual({ name: 'Backend Engineer' });
    post.flush({ designation: designation() });

    expect(created?.id).toBe('ds-1');
    expect(notifications.showSuccess).toHaveBeenCalledWith('Designation created successfully.');
    expectList().flush({ designations: [], pagination });
  });

  it('updates via PATCH /designations/:id and sends null (not omitted) to clear the code', () => {
    store.updateRecord('ds-1', { code: null, status: 'INACTIVE' }).subscribe();

    const patch = http.expectOne((req) => req.method === 'PATCH' && req.url.endsWith('/designations/ds-1'));
    expect(patch.request.body).toEqual({ code: null, status: 'INACTIVE' });
    patch.flush({ designation: designation({ code: null, status: 'INACTIVE' }) });

    expect(notifications.showSuccess).toHaveBeenCalledWith('Designation updated successfully.');
    expectList().flush({ designations: [], pagination });
  });

  it('deletes via DELETE /designations/:id, toasts "Designation deleted", then refetches', () => {
    store.deleteRecord('ds-1').subscribe();

    http.expectOne((req) => req.method === 'DELETE' && req.url.endsWith('/designations/ds-1')).flush({ message: 'ok' });

    expect(notifications.showSuccess).toHaveBeenCalledWith('Designation deleted successfully.');
    expectList().flush({ designations: [], pagination });
  });
});
