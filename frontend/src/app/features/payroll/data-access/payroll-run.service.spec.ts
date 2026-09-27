import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SKIP_GLOBAL_ERROR_NOTIFICATION } from '../../../core/http/http-context-tokens';
import { runDto } from './payroll.testing';
import { PayrollRunService } from './payroll-run.service';

describe('PayrollRunService', () => {
  let service: PayrollRunService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PayrollRunService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists with only the filters that are set and maps the `runs` key', () => {
    let result: unknown;
    service.list({ page: 1, limit: 12, periodYear: 2026, sortBy: 'periodMonth', order: 'desc' }).subscribe((value) => (result = value));

    const request = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/payroll-runs'));
    expect(request.request.params.get('periodYear')).toBe('2026');
    expect(request.request.params.get('sortBy')).toBe('periodMonth');
    expect(request.request.params.has('status')).toBe(false);
    expect(request.request.context.get(SKIP_GLOBAL_ERROR_NOTIFICATION)).toBe(true);

    const pagination = { page: 1, limit: 12, total: 1, totalPages: 1 };
    request.flush({ runs: [runDto()], pagination });
    expect(result).toEqual({ items: [expect.objectContaining({ id: 'run-1', payslipCount: null })], pagination });
  });

  it('gets one run with its payslip count', () => {
    let result: unknown;
    service.getById('run-1').subscribe((value) => (result = value));

    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/payroll-runs/run-1')).flush({ run: runDto({ payslipCount: 23 }) });
    expect(result).toEqual(expect.objectContaining({ payslipCount: 23 }));
  });

  it('creates with POST /payroll-runs {periodMonth, periodYear}', () => {
    service.create({ periodMonth: 8, periodYear: 2026 }).subscribe();

    const request = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/payroll-runs'));
    expect(request.request.body).toEqual({ periodMonth: 8, periodYear: 2026 });
    request.flush({ run: runDto() });
  });

  it.each([
    ['process', '/process'],
    ['finalize', '/finalize'],
    ['markPaid', '/mark-paid'],
  ] as const)('%s is PATCH /payroll-runs/:id%s with an empty body', (method, suffix) => {
    let result: unknown;
    service[method]('run-1').subscribe((value) => (result = value));

    const request = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith(`/payroll-runs/run-1${suffix}`));
    expect(request.request.body).toEqual({});
    expect(request.request.context.get(SKIP_GLOBAL_ERROR_NOTIFICATION)).toBe(true);
    request.flush({ run: runDto({ status: 'PROCESSING' }) });
    expect(result).toEqual(expect.objectContaining({ status: 'PROCESSING' }));
  });

  it('deletes with DELETE /payroll-runs/:id (200 + a message)', () => {
    let done = false;
    service.delete('run-1').subscribe(() => (done = true));

    http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/payroll-runs/run-1')).flush({ message: 'Payroll run deleted successfully' });
    expect(done).toBe(true);
  });
});
