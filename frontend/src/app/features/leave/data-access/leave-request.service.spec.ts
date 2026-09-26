import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SKIP_GLOBAL_ERROR_NOTIFICATION } from '../../../core/http/http-context-tokens';
import { LeaveRequestDto } from './leave.dto';
import { LeaveRequestService } from './leave-request.service';

const dto = (overrides: Partial<LeaveRequestDto> = {}): LeaveRequestDto => ({
  id: 'r-1',
  employeeId: 'e-1',
  leaveTypeId: 't-1',
  startDate: '2026-11-02T00:00:00.000Z',
  endDate: '2026-11-06T00:00:00.000Z',
  reason: null,
  status: 'PENDING',
  durationDays: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

describe('LeaveRequestService', () => {
  let service: LeaveRequestService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(LeaveRequestService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists with only the filters that are set, and maps the `requests` key through the mapper', () => {
    let result: unknown;
    service
      .list({ page: 2, limit: 25, status: 'PENDING', employeeId: 'e-1', sortBy: 'startDate', order: 'desc', dateFrom: '2026-11-01' })
      .subscribe((value) => (result = value));

    const request = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/leave-requests'));
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('status')).toBe('PENDING');
    expect(request.request.params.get('employeeId')).toBe('e-1');
    expect(request.request.params.get('dateFrom')).toBe('2026-11-01');
    expect(request.request.params.has('leaveTypeId')).toBe(false);
    expect(request.request.params.has('dateTo')).toBe(false);

    const pagination = { page: 2, limit: 25, total: 26, totalPages: 2 };
    request.flush({ requests: [dto({ status: 'APPROVED', durationDays: '2.5' })], pagination });

    expect(result).toEqual({ items: [expect.objectContaining({ id: 'r-1', durationDays: 2.5 })], pagination });
  });

  it('creates with POST /leave-requests and maps the created request', () => {
    let result: unknown;
    service.create({ leaveTypeId: 't-1', startDate: '2026-11-02', endDate: '2026-11-06', reason: 'Trip' }).subscribe((value) => (result = value));

    const request = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/leave-requests'));
    expect(request.request.body).toEqual({ leaveTypeId: 't-1', startDate: '2026-11-02', endDate: '2026-11-06', reason: 'Trip' });
    request.flush({ request: dto() });

    expect(result).toEqual(expect.objectContaining({ id: 'r-1', durationDays: null }));
  });

  it('approves with PATCH /:id/approve, rejects with PATCH /:id/reject (and the reason), cancels with PATCH /:id/cancel', () => {
    service.approve('r-1').subscribe();
    http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/leave-requests/r-1/approve')).flush({ request: dto({ status: 'APPROVED', durationDays: '4' }) });

    service.reject('r-1', { reason: 'Coverage' }).subscribe();
    const reject = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/leave-requests/r-1/reject'));
    expect(reject.request.body).toEqual({ reason: 'Coverage' });
    reject.flush({ request: dto({ status: 'REJECTED' }) });

    service.cancel('r-1').subscribe();
    http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/leave-requests/r-1/cancel')).flush({ request: dto({ status: 'CANCELLED' }) });
  });

  it('opts EVERY request out of the global error toast, because each screen shows its failure inline', () => {
    const calls: [() => void, (r: { method: string; url: string }) => boolean][] = [
      [() => service.list({ page: 1, limit: 10, sortBy: 'startDate', order: 'desc' }).subscribe({ error: () => undefined }), (r) => r.method === 'GET'],
      [() => service.create({ leaveTypeId: 't', startDate: '2026-11-02', endDate: '2026-11-02' }).subscribe({ error: () => undefined }), (r) => r.method === 'POST'],
      [() => service.approve('r-1').subscribe({ error: () => undefined }), (r) => r.url.endsWith('/approve')],
      [() => service.reject('r-1', {}).subscribe({ error: () => undefined }), (r) => r.url.endsWith('/reject')],
      [() => service.cancel('r-1').subscribe({ error: () => undefined }), (r) => r.url.endsWith('/cancel')],
    ];

    for (const [call, match] of calls) {
      call();
      const request = http.expectOne((r) => match(r));
      expect(request.request.context.get(SKIP_GLOBAL_ERROR_NOTIFICATION)).toBe(true);
      request.flush({}, { status: 500, statusText: 'Server Error' });
    }
  });
});
