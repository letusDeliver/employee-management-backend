import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { PayrollRunStatus } from '../data-access/payroll.models';
import { pageOf, payslip, run } from '../data-access/payroll.testing';
import { PayrollRunService } from '../data-access/payroll-run.service';
import { PayslipService } from '../data-access/payslip.service';
import { PayrollRunDetailPageComponent } from './payroll-run-detail-page.component';

const ALL = ['payrollRun:read', 'payrollRun:process', 'payrollRun:finalize', 'payrollRun:markPaid', 'payrollRun:delete'];

describe('PayrollRunDetailPageComponent', () => {
  const runApi = { getById: vi.fn(), process: vi.fn(), finalize: vi.fn(), markPaid: vi.fn(), delete: vi.fn() };
  const payslipApi = { list: vi.fn() };
  const dialog = { open: vi.fn() };
  const directory = {
    refresh: vi.fn(() => of([])),
    error: signal<string | null>(null),
    loading: signal(false),
    options: signal([]),
    labelOf: () => '',
  };

  const setup = (status: PayrollRunStatus, permissions = ALL, overrides: Partial<Parameters<typeof run>[0]> = {}) => {
    runApi.getById.mockReturnValue(of(run({ status, payslipCount: status === 'DRAFT' ? 0 : 3, ...overrides })));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ runId: 'run-1' }) } } },
        { provide: SessionStore, useValue: { hasAnyPermission: (...keys: string[]) => keys.some((k) => permissions.includes(k)) } },
        { provide: NotificationService, useValue: { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() } },
        { provide: PayrollRunService, useValue: runApi },
        { provide: PayslipService, useValue: payslipApi },
        { provide: EmployeeDirectoryService, useValue: directory },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(PayrollRunDetailPageComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };
  const button = (el: HTMLElement, text: RegExp) => [...el.querySelectorAll('button')].find((b) => text.test(b.textContent ?? ''));
  const confirmData = () => dialog.open.mock.lastCall?.[1].data;

  beforeEach(() => {
    Object.values(runApi).forEach((fn) => fn.mockReset());
    payslipApi.list.mockReset().mockReturnValue(of(pageOf([payslip()])));
    dialog.open.mockReset().mockReturnValue({ afterClosed: () => of(true) });
    directory.error.set(null);
  });

  describe('the one next action per status', () => {
    it.each([
      ['DRAFT', 'Process payroll'],
      ['PROCESSING', 'Finalize'],
      ['FINALIZED', 'Mark as paid'],
    ] as const)('%s offers exactly "%s"', (status, label) => {
      const { el } = setup(status);

      const labels = ['Process payroll', 'Finalize', 'Mark as paid'].filter((text) => button(el, new RegExp(`^\\s*${text}\\s*$`)));
      expect(labels).toEqual([label]);
    });

    it('PAID offers no action and no Delete', () => {
      const { el } = setup('PAID');

      expect(button(el, /Process payroll|Finalize|Mark as paid|Delete/)).toBeUndefined();
      expect(el.textContent).toContain('Paid. This run is complete.');
    });

    it('hides an action the caller lacks the permission for (fail closed)', () => {
      const { el } = setup('PROCESSING', ['payrollRun:read', 'payrollRun:process']);

      expect(button(el, /Finalize/)).toBeUndefined();
    });

    it('offers Delete only while DRAFT', () => {
      expect(button(setup('DRAFT').el, /Delete/)).toBeDefined();
      TestBed.resetTestingModule();
      expect(button(setup('PROCESSING').el, /Delete/)).toBeUndefined();
    });
  });

  describe('the process confirm', () => {
    it("warns - without blocking - when the month has not ended by the server's day", () => {
      const { el } = setup('DRAFT', ALL, { periodMonth: 12, periodYear: 2999 });
      runApi.process.mockReturnValue(of(run({ status: 'PROCESSING' })));

      button(el, /Process payroll/)!.click();

      expect(confirmData().title).toBe('Process December 2999 payroll?');
      expect(confirmData().message).toContain("A processed run can't be deleted or processed again.");
      expect(confirmData().message).toContain('A working day with no attendance record counts as unpaid.');
      expect(confirmData().warning).toContain("December 2999 hasn't ended yet");
      expect(runApi.process).toHaveBeenCalledWith('run-1');
    });

    it('carries no warning for a month that is over', () => {
      const { el } = setup('DRAFT', ALL, { periodMonth: 1, periodYear: 2020 });
      runApi.process.mockReturnValue(of(run({ status: 'PROCESSING' })));

      button(el, /Process payroll/)!.click();

      expect(confirmData().warning).toBeUndefined();
    });

    it('does nothing when the confirm is cancelled', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });
      const { el } = setup('DRAFT');

      button(el, /Process payroll/)!.click();

      expect(runApi.process).not.toHaveBeenCalled();
    });
  });

  it('shows the server message inline when a transition is refused', () => {
    const { fixture, el } = setup('PROCESSING');
    runApi.finalize.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { status: 'error', message: 'Only a PROCESSING payroll run can be finalized' } })),
    );

    button(el, /Finalize/)!.click();
    fixture.detectChanges();

    expect(el.textContent).toContain('Only a PROCESSING payroll run can be finalized');
  });

  it('goes back to the list after deleting a DRAFT run', () => {
    const { el } = setup('DRAFT');
    runApi.delete.mockReturnValue(of(undefined));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    button(el, /Delete/)!.click();

    expect(runApi.delete).toHaveBeenCalledWith('run-1');
    expect(navigate).toHaveBeenCalledWith(['/payroll']);
  });

  it('shows "No payslips yet" for a DRAFT run and the payslips otherwise', () => {
    expect(setup('DRAFT').el.textContent).toContain('No payslips yet');
    TestBed.resetTestingModule();
    const { el } = setup('PROCESSING');
    expect(el.textContent).toContain('Asha Rao');
    expect(el.textContent).toContain('3 payslips');
  });

  it('a missing run is its own "not found" state', () => {
    runApi.getById.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ runId: 'gone' }) } } },
        { provide: SessionStore, useValue: { hasAnyPermission: () => true } },
        { provide: NotificationService, useValue: { showSuccess: vi.fn() } },
        { provide: PayrollRunService, useValue: runApi },
        { provide: PayslipService, useValue: payslipApi },
        { provide: EmployeeDirectoryService, useValue: directory },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(PayrollRunDetailPageComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Payroll run not found');
  });
});
