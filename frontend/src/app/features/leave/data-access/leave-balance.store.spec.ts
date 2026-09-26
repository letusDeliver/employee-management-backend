import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { NotificationService } from '../../../core/notifications/notification.service';
import { LeaveBalanceDto } from './leave.dto';
import { LeaveBalanceStore } from './leave-balance.store';

const dto = (id: string, overrides: Partial<LeaveBalanceDto> = {}): LeaveBalanceDto => ({
  id,
  employeeId: 'e-1',
  leaveTypeId: 't-1',
  year: 2026,
  entitlement: '10',
  consumed: '4',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

const page = (balances: LeaveBalanceDto[]) => ({
  balances,
  pagination: { page: 1, limit: 10, total: balances.length, totalPages: 1 },
});

describe('LeaveBalanceStore', () => {
  let store: LeaveBalanceStore;
  let http: HttpTestingController;
  const notifications = { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() };
  const expectList = (): TestRequest => http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/leave-balances'));

  beforeEach(() => {
    notifications.showSuccess.mockReset();
    TestBed.configureTestingModule({
      providers: [LeaveBalanceStore, provideHttpClient(), provideHttpClientTesting(), { provide: NotificationService, useValue: notifications }],
    });
    store = TestBed.inject(LeaveBalanceStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the newest year first and stores numbers, not Decimal strings', () => {
    store.loadList();

    const request = expectList();
    expect(request.request.params.get('sortBy')).toBe('year');
    expect(request.request.params.get('order')).toBe('desc');
    request.flush(page([dto('b-1', { entitlement: '9.07' })]));

    expect(store.balances()[0].entitlement).toBe(9.07);
  });

  it('an empty page is a normal state (a balance exists only once a leave was first approved)', () => {
    store.loadList();
    expectList().flush(page([]));

    expect(store.balances()).toEqual([]);
    expect(store.error()).toBeNull();
  });

  it('filters by employee, type and year, back on page 1', () => {
    store.setPage(2, 10);
    expectList().flush(page([]));

    store.setFilters({ employeeId: 'e-1', leaveTypeId: 't-1', year: 2025 });
    const request = expectList();

    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('year')).toBe('2025');
    request.flush(page([]));
  });

  it('adjusts, says so, and REFETCHES', () => {
    store.adjust('b-1', { consumed: 3 }).subscribe();
    const patch = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/leave-balances/b-1'));
    expect(patch.request.body).toEqual({ consumed: 3 });
    patch.flush({ balance: dto('b-1', { consumed: '3' }) });

    expectList().flush(page([dto('b-1', { consumed: '3' })]));
    expect(notifications.showSuccess).toHaveBeenCalledWith('Leave balance adjusted.');
    expect(store.balances()[0].consumed).toBe(3);
  });

  it('hands a refusal to the caller without notifying', () => {
    let failed = false;
    store.adjust('b-1', {}).subscribe({ error: () => (failed = true) });
    http.expectOne((r) => r.method === 'PATCH').flush({ status: 'error', message: 'no' }, { status: 400, statusText: 'Bad Request' });

    expect(failed).toBe(true);
    expect(notifications.showSuccess).not.toHaveBeenCalled();
  });
});
