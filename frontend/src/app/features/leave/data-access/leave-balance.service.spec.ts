import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SKIP_GLOBAL_ERROR_NOTIFICATION } from '../../../core/http/http-context-tokens';
import { LeaveBalanceDto } from './leave.dto';
import { LeaveBalanceService } from './leave-balance.service';

const dto = (overrides: Partial<LeaveBalanceDto> = {}): LeaveBalanceDto => ({
  id: 'b-1',
  employeeId: 'e-1',
  leaveTypeId: 't-1',
  year: 2026,
  entitlement: '9.07',
  consumed: '4',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

describe('LeaveBalanceService', () => {
  let service: LeaveBalanceService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(LeaveBalanceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists with only the filters that are set, and turns the Decimal strings into numbers', () => {
    let result: unknown;
    service.list({ page: 1, limit: 100, year: 2026, employeeId: 'e-1', sortBy: 'year', order: 'desc' }).subscribe((value) => (result = value));

    const request = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/leave-balances'));
    expect(request.request.params.get('year')).toBe('2026');
    expect(request.request.params.get('employeeId')).toBe('e-1');
    expect(request.request.params.has('leaveTypeId')).toBe(false);

    const pagination = { page: 1, limit: 100, total: 1, totalPages: 1 };
    request.flush({ balances: [dto()], pagination });

    expect(result).toEqual({ items: [expect.objectContaining({ entitlement: 9.07, consumed: 4 })], pagination });
  });

  it('adjusts with PATCH /:id and maps the result', () => {
    let result: unknown;
    service.adjust('b-1', { consumed: 3 }).subscribe((value) => (result = value));

    const request = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/leave-balances/b-1'));
    expect(request.request.body).toEqual({ consumed: 3 });
    request.flush({ balance: dto({ consumed: '3' }) });

    expect(result).toEqual(expect.objectContaining({ consumed: 3 }));
  });

  it('opts both requests out of the global error toast', () => {
    service.list({ page: 1, limit: 10, sortBy: 'year', order: 'desc' }).subscribe({ error: () => undefined });
    const list = http.expectOne((r) => r.method === 'GET');
    expect(list.request.context.get(SKIP_GLOBAL_ERROR_NOTIFICATION)).toBe(true);
    list.flush({}, { status: 500, statusText: 'Server Error' });

    service.adjust('b-1', {}).subscribe({ error: () => undefined });
    const adjust = http.expectOne((r) => r.method === 'PATCH');
    expect(adjust.request.context.get(SKIP_GLOBAL_ERROR_NOTIFICATION)).toBe(true);
    adjust.flush({}, { status: 500, statusText: 'Server Error' });
  });
});
