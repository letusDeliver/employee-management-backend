import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { NotificationService } from '../../../core/notifications/notification.service';
import { PayrollRunService } from '../data-access/payroll-run.service';
import { pageOf, run } from '../data-access/payroll.testing';
import { PayrollRunListPageComponent } from './payroll-run-list-page.component';

describe('PayrollRunListPageComponent', () => {
  const api = { list: vi.fn(), create: vi.fn(), delete: vi.fn() };
  const dialog = { open: vi.fn() };

  const setup = (permissions: string[]) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SessionStore, useValue: { hasAnyPermission: (...keys: string[]) => keys.some((k) => permissions.includes(k)) } },
        { provide: NotificationService, useValue: { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() } },
        { provide: PayrollRunService, useValue: api },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(PayrollRunListPageComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };
  const button = (el: HTMLElement, text: RegExp) => [...el.querySelectorAll('button')].find((b) => text.test(b.textContent ?? ''));

  beforeEach(() => {
    api.list.mockReset().mockReturnValue(of(pageOf([run()], 1, 12)));
    dialog.open.mockReset();
  });

  it('loads one year of runs on entry', () => {
    const { el } = setup(['payrollRun:read']);

    expect(api.list).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('August 2026');
  });

  it('offers New Run only with payrollRun:create', () => {
    expect(button(setup(['payrollRun:read', 'payrollRun:create']).el, /New Run/)).toBeDefined();
    TestBed.resetTestingModule();
    expect(button(setup(['payrollRun:read']).el, /New Run/)).toBeUndefined();
  });

  it('opens the new run once the dialog creates it', () => {
    dialog.open.mockReturnValue({ afterClosed: () => of(run({ id: 'new-run' })) });
    const { el } = setup(['payrollRun:read', 'payrollRun:create']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    button(el, /New Run/)!.click();

    expect(navigate).toHaveBeenCalledWith(['/payroll', 'new-run']);
  });

  it('stays on the list when the dialog is cancelled', () => {
    dialog.open.mockReturnValue({ afterClosed: () => of(undefined) });
    const { el } = setup(['payrollRun:read', 'payrollRun:create']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');

    button(el, /New Run/)!.click();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('says which year is empty', () => {
    api.list.mockReturnValue(of(pageOf([], 1, 12)));
    const { el } = setup(['payrollRun:read']);

    expect(el.textContent).toMatch(/No payroll runs in \d{4}/);
  });
});
