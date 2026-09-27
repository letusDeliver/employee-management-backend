import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { pageOf, payslip } from '../data-access/payroll.testing';
import { PayslipService } from '../data-access/payslip.service';
import { MyPayslipsPageComponent } from './my-payslips-page.component';

describe('MyPayslipsPageComponent', () => {
  const api = { list: vi.fn() };
  const employees = { refresh: vi.fn(), ownEmployeeId: vi.fn() };
  const user = signal<{ id: string } | null>({ id: 'u-1' });

  const setup = (permissions: string[]) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SessionStore, useValue: { user, hasAnyPermission: (...keys: string[]) => keys.some((k) => permissions.includes(k)) } },
        { provide: PayslipService, useValue: api },
        { provide: EmployeeDirectoryService, useValue: employees },
      ],
    });
    const fixture = TestBed.createComponent(MyPayslipsPageComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  beforeEach(() => {
    api.list.mockReset().mockReturnValue(of(pageOf([payslip()], 1, 100)));
    employees.refresh.mockReset().mockReturnValue(of([]));
    employees.ownEmployeeId.mockReset();
  });

  describe('whose payslips are shown', () => {
    it('sends NO employee id for MANAGER / EMPLOYEE (the server scopes them) and never loads the employee directory', () => {
      const { el } = setup(['payslip:read:own']);

      expect(api.list.mock.calls[0][0].employeeId).toBeUndefined();
      expect(employees.refresh).not.toHaveBeenCalled();
      expect(el.textContent).toContain('August 2026');
    });

    it("sends the ADMIN's OWN employee id (they hold payslip:read:any), or they would see everyone's pay", () => {
      employees.ownEmployeeId.mockReturnValue('e-me');
      setup(['payslip:read:own', 'payslip:read:any']);

      expect(employees.ownEmployeeId).toHaveBeenCalledWith('u-1');
      expect(api.list.mock.calls[0][0].employeeId).toBe('e-me');
    });

    it('shows "not linked" - and fetches nothing - for an ADMIN with no employee record', () => {
      employees.ownEmployeeId.mockReturnValue(null);
      const { el } = setup(['payslip:read:own', 'payslip:read:any']);

      expect(el.textContent).toContain("Your account isn't linked to an employee record");
      expect(api.list).not.toHaveBeenCalled();
    });

    it("blocks with a Retry when the ADMIN's own record cannot be determined - never the organisation's payslips", () => {
      employees.refresh.mockReturnValue(throwError(() => new Error('down')));
      const { fixture, el } = setup(['payslip:read:own', 'payslip:read:any']);

      expect(el.textContent).toContain("Couldn't work out which employee record is yours");
      expect(api.list).not.toHaveBeenCalled();

      employees.refresh.mockReturnValue(of([]));
      employees.ownEmployeeId.mockReturnValue('e-me');
      [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Retry'))!.click();
      fixture.detectChanges();
      expect(api.list.mock.calls[0][0].employeeId).toBe('e-me');
    });
  });

  it('says "No payslips yet" when there are none', () => {
    api.list.mockReturnValue(of(pageOf([], 1, 100)));
    const { el } = setup(['payslip:read:own']);

    expect(el.textContent).toContain('No payslips yet');
  });

  it('shows a year select only when payslips span more than one year', () => {
    expect(setup(['payslip:read:own']).el.querySelector('mat-select')).toBeNull();
    TestBed.resetTestingModule();
    api.list.mockReturnValue(of(pageOf([payslip({ id: 'a' }), payslip({ id: 'b', periodYear: 2025, periodMonth: 12 })], 1, 100)));
    expect(setup(['payslip:read:own']).el.querySelector('mat-select')).not.toBeNull();
  });
});
