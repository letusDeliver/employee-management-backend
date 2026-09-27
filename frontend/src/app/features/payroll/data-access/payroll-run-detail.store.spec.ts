import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { pageOf, payslip, run } from './payroll.testing';
import { PayrollRunDetailStore } from './payroll-run-detail.store';
import { PayrollRunService } from './payroll-run.service';
import { PayslipService } from './payslip.service';

const httpError = (status: number, message = 'nope') =>
  throwError(() => new HttpErrorResponse({ status, error: { status: 'error', message } }));

describe('PayrollRunDetailStore', () => {
  const runApi = { getById: vi.fn(), process: vi.fn(), finalize: vi.fn(), markPaid: vi.fn(), delete: vi.fn() };
  const payslipApi = { list: vi.fn() };
  const notifications = { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() };
  let store: PayrollRunDetailStore;

  beforeEach(() => {
    Object.values(runApi).forEach((fn) => fn.mockReset());
    payslipApi.list.mockReset().mockReturnValue(of(pageOf([payslip()])));
    runApi.getById.mockReturnValue(of(run({ payslipCount: 0 })));
    notifications.showSuccess.mockReset();
    TestBed.configureTestingModule({
      providers: [
        PayrollRunDetailStore,
        { provide: PayrollRunService, useValue: runApi },
        { provide: PayslipService, useValue: payslipApi },
        { provide: NotificationService, useValue: notifications },
      ],
    });
    store = TestBed.inject(PayrollRunDetailStore);
  });

  it("loads the run and ITS payslips, lowest net pay first (the heaviest deductions are what a reviewer checks)", () => {
    store.load('run-1');

    expect(runApi.getById).toHaveBeenCalledWith('run-1');
    expect(payslipApi.list).toHaveBeenCalledWith({ page: 1, limit: 10, sortBy: 'netPay', order: 'asc', payrollRunId: 'run-1' });
    expect(store.run()).toEqual(run({ payslipCount: 0 }));
    expect(store.payslips()).toEqual([payslip()]);
  });

  it('a 404 is "not found", not a load error', () => {
    runApi.getById.mockReturnValue(httpError(404, 'Payroll run not found'));
    store.load('gone');

    expect(store.notFound()).toBe(true);
    expect(store.error()).toBeNull();
  });

  it('any other failure is a load error with the backend message', () => {
    runApi.getById.mockReturnValue(httpError(500, 'Database down'));
    store.load('run-1');

    expect(store.notFound()).toBe(false);
    expect(store.error()).toBe('Database down');
  });

  it.each(['process', 'finalize', 'markPaid'] as const)(
    '%s refetches the run AND its payslips afterwards (processing creates them; the response has no count)',
    (action) => {
      store.load('run-1');
      runApi[action].mockReturnValue(of(run({ status: 'PROCESSING' })));
      runApi.getById.mockReturnValue(of(run({ status: 'PROCESSING', payslipCount: 23 })));

      store.perform(action).subscribe();

      expect(runApi[action]).toHaveBeenCalledWith('run-1');
      expect(runApi.getById).toHaveBeenCalledTimes(2);
      expect(payslipApi.list).toHaveBeenCalledTimes(2);
      expect(store.run()?.payslipCount).toBe(23);
      expect(notifications.showSuccess).toHaveBeenCalled();
    },
  );

  it('a refused transition (409 - moved meanwhile) refetches the run and still reports the failure', () => {
    store.load('run-1');
    runApi.finalize.mockReturnValue(httpError(409, 'Only a PROCESSING payroll run can be finalized'));
    runApi.getById.mockReturnValue(of(run({ status: 'FINALIZED' })));
    let failure: unknown;

    store.perform('finalize').subscribe({ error: (error: unknown) => (failure = error) });

    expect(failure).toBeInstanceOf(HttpErrorResponse);
    expect(runApi.getById).toHaveBeenCalledTimes(2);
    expect(store.run()?.status).toBe('FINALIZED');
    expect(notifications.showSuccess).not.toHaveBeenCalled();
  });

  it('a failed transition that is not a 409 does not refetch', () => {
    store.load('run-1');
    runApi.process.mockReturnValue(httpError(500));

    store.perform('process').subscribe({ error: () => undefined });

    expect(runApi.getById).toHaveBeenCalledTimes(1);
  });

  it('filters payslips by employee and sorts by net pay only', () => {
    store.load('run-1');
    store.setEmployee('e-9');
    expect(payslipApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ payrollRunId: 'run-1', employeeId: 'e-9', page: 1 }));

    store.setPayslipSort('desc');
    expect(payslipApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: 'netPay', order: 'desc' }));
  });

  it('delete calls the API for the loaded run', () => {
    store.load('run-1');
    runApi.delete.mockReturnValue(of(undefined));

    store.delete().subscribe();

    expect(runApi.delete).toHaveBeenCalledWith('run-1');
    expect(notifications.showSuccess).toHaveBeenCalledWith('Payroll run deleted.');
  });
});
