import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SKIP_GLOBAL_ERROR_NOTIFICATION } from '../../../core/http/http-context-tokens';
import { payslipDto } from './payroll.testing';
import { PayslipService } from './payslip.service';

describe('PayslipService', () => {
  let service: PayslipService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PayslipService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists with only the filters that are set and maps the `payslips` key through the mapper', () => {
    let result: unknown;
    service
      .list({ page: 1, limit: 10, payrollRunId: 'run-1', sortBy: 'netPay', order: 'asc' })
      .subscribe((value) => (result = value));

    const request = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/payslips'));
    expect(request.request.params.get('payrollRunId')).toBe('run-1');
    expect(request.request.params.get('sortBy')).toBe('netPay');
    expect(request.request.params.has('employeeId')).toBe(false);
    expect(request.request.context.get(SKIP_GLOBAL_ERROR_NOTIFICATION)).toBe(true);

    const pagination = { page: 1, limit: 10, total: 1, totalPages: 1 };
    request.flush({ payslips: [payslipDto()], pagination });
    expect(result).toEqual({ items: [expect.objectContaining({ id: 'slip-1', netPay: 875 })], pagination });
  });

  it('gets one payslip with its line items split by type', () => {
    let result: unknown;
    service.getById('slip-1').subscribe((value) => (result = value));

    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/payslips/slip-1')).flush({
      payslip: payslipDto({
        lineItems: [{ id: 'a', payslipId: 'slip-1', type: 'EARNING', label: 'Base Salary', amount: '1000', createdAt: '' }],
      }),
    });
    expect(result).toEqual(expect.objectContaining({ earnings: [{ id: 'a', label: 'Base Salary', amount: 1000 }], deductions: [] }));
  });
});
