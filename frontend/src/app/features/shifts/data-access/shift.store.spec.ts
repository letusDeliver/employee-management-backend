import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { NotificationService } from '../../../core/notifications/notification.service';
import { Shift } from './shift.models';
import { ShiftStore } from './shift.store';

const shift = (overrides: Partial<Shift> = {}): Shift => ({
  id: 'sh-1',
  name: 'Day Shift',
  startTime: '09:00',
  endTime: '18:00',
  workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  status: 'ACTIVE',
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
  ...overrides,
});

const pagination = { page: 1, limit: 10, total: 1, totalPages: 1 };

/**
 * Wiring spec: the shared behaviour (refetch, cancellation, step-back) is proven once in
 * `master-data.store.spec.ts`. This spec proves what is Shift's own - its endpoint, its
 * `shifts`/`shift` response keys, its request bodies, its sortable columns (which the
 * `code`-based master-data query does not have) and its wording.
 */
describe('ShiftStore (Shift wiring)', () => {
  let store: ShiftStore;
  let http: HttpTestingController;
  const notifications = { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() };

  const expectList = (): TestRequest => http.expectOne((req) => req.method === 'GET' && req.url.endsWith('/shifts'));

  beforeEach(() => {
    notifications.showSuccess.mockReset();

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: NotificationService, useValue: notifications }],
    });

    store = TestBed.inject(ShiftStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('has its own wording', () => {
    expect(store.labels).toEqual({ singular: 'Shift', plural: 'Shifts' });
  });

  it('lists from GET /shifts with the query params and maps the `shifts` key into items', () => {
    store.setFilters({ search: 'night', status: 'ACTIVE' });

    const request = expectList();
    expect(request.request.params.get('search')).toBe('night');
    expect(request.request.params.get('status')).toBe('ACTIVE');
    expect(request.request.params.get('sortBy')).toBe('createdAt');
    request.flush({ shifts: [shift()], pagination: { ...pagination, total: 41, totalPages: 5 } });

    expect(store.items()).toHaveLength(1);
    expect(store.items()[0].workingDays).toHaveLength(5);
    expect(store.pagination().total).toBe(41);
  });

  it('sorts by the columns Shift owns (startTime / endTime), which the code-based query lacks', () => {
    store.setSort('startTime', 'asc');

    const request = expectList();
    expect(request.request.params.get('sortBy')).toBe('startTime');
    expect(request.request.params.get('order')).toBe('asc');
    request.flush({ shifts: [], pagination });
  });

  it('creates via POST /shifts, unwraps `shift`, toasts "Shift created", then refetches', () => {
    let created: Shift | undefined;
    const body = {
      name: 'Night Shift',
      startTime: '22:00',
      endTime: '06:00',
      workingDays: ['MONDAY' as const, 'TUESDAY' as const],
    };
    store.createRecord(body).subscribe((result) => (created = result));

    const post = http.expectOne((req) => req.method === 'POST' && req.url.endsWith('/shifts'));
    expect(post.request.body).toEqual(body);
    post.flush({ shift: shift({ id: 'sh-2', ...body }) });

    expect(created?.id).toBe('sh-2');
    expect(notifications.showSuccess).toHaveBeenCalledWith('Shift created successfully.');
    expectList().flush({ shifts: [], pagination });
  });

  it('updates via PATCH /shifts/:id with only the fields given', () => {
    store.updateRecord('sh-1', { endTime: '17:30', status: 'INACTIVE' }).subscribe();

    const patch = http.expectOne((req) => req.method === 'PATCH' && req.url.endsWith('/shifts/sh-1'));
    expect(patch.request.body).toEqual({ endTime: '17:30', status: 'INACTIVE' });
    patch.flush({ shift: shift({ endTime: '17:30', status: 'INACTIVE' }) });

    expect(notifications.showSuccess).toHaveBeenCalledWith('Shift updated successfully.');
    expectList().flush({ shifts: [], pagination });
  });

  it('deletes via DELETE /shifts/:id, toasts "Shift deleted", then refetches', () => {
    store.deleteRecord('sh-1').subscribe();

    http.expectOne((req) => req.method === 'DELETE' && req.url.endsWith('/shifts/sh-1')).flush({ message: 'ok' });

    expect(notifications.showSuccess).toHaveBeenCalledWith('Shift deleted successfully.');
    expectList().flush({ shifts: [], pagination });
  });
});
