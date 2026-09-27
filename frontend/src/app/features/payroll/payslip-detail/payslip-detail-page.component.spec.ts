import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { PayslipDetail } from '../data-access/payroll.models';
import { payslipDetail } from '../data-access/payroll.testing';
import { PayslipService } from '../data-access/payslip.service';
import { PayslipDetailPageComponent } from './payslip-detail-page.component';

describe('PayslipDetailPageComponent', () => {
  const api = { getById: vi.fn() };

  const setup = (result: Observable<PayslipDetail>, origin: 'payroll' | 'mine' = 'mine') => {
    api.getById.mockReset().mockReturnValue(result);
    const params = origin === 'payroll' ? { runId: 'run-1', payslipId: 'slip-1' } : { payslipId: 'slip-1' };
    const snapshot = { paramMap: convertToParamMap(params), pathFromRoot: [{ paramMap: convertToParamMap(params) }] };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot, routeConfig: { data: { origin } } } },
        { provide: PayslipService, useValue: api },
      ],
    });
    const fixture = TestBed.createComponent(PayslipDetailPageComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');
  /** The <dd> that follows the <dt> with this label. */
  const fact = (el: HTMLElement, label: string) =>
    [...el.querySelectorAll('dt')].find((dt) => dt.textContent?.trim() === label)?.nextElementSibling?.textContent?.trim();
  /** "label amount" of each line item / total row. */
  const lines = (el: HTMLElement) =>
    [...el.querySelectorAll('.line, .total')].map((row) => [...row.children].map((child) => child.textContent?.trim()).join(' '));
  const fail = (status: number) => throwError(() => new HttpErrorResponse({ status, error: { status: 'error', message: `failed ${status}` } }));

  it('reads like a document: the snapshot, the attendance, earnings, deductions and the net pay', () => {
    const el = setup(of(payslipDetail()));

    expect(api.getById).toHaveBeenCalledWith('slip-1');
    expect(text(el)).toContain('Payslip — August 2026');
    expect(fact(el, 'Name')).toBe('Asha Rao');
    expect(fact(el, 'Designation')).toBe('Analyst');
    expect(fact(el, 'Department')).toBe('Finance');
    expect(fact(el, 'Branch')).toBe('Pune');
    expect(fact(el, 'Employment type')).toBe('Full-time');
    expect(fact(el, 'Working days')).toBe('20');
    expect(fact(el, 'Paid days')).toBe('17.5');
    expect(fact(el, 'Unpaid days')).toBe('2.5');
    expect(lines(el)).toEqual([
      'Base Salary $1,000.00',
      'Unpaid Absence (2.5 days) −$125.00',
      'Gross pay $1,000.00',
      'Total deductions −$125.00',
      'Net pay $875.00',
    ]);
    expect(text(el)).toContain('A payslip is a snapshot');
  });

  it('says "No deductions", "No name on record" and "—" for what the snapshot does not have', () => {
    const el = setup(of(payslipDetail({ deductions: [], employeeName: null, branchName: null })));

    expect(text(el)).toContain('No deductions');
    expect(fact(el, 'Name')).toBe('No name on record');
    expect(fact(el, 'Branch')).toBe('—');
  });

  it('goes back to the run when opened from Payroll, and to My payslips otherwise', () => {
    expect(setup(of(payslipDetail()), 'payroll').querySelector('a.back-link')?.getAttribute('href')).toBe('/payroll/run-1');
    TestBed.resetTestingModule();
    expect(setup(of(payslipDetail()), 'mine').querySelector('a.back-link')?.getAttribute('href')).toBe('/my-payslips');
  });

  it('someone else\'s payslip (403) is its own state, distinct from not found (404) and a load error', () => {
    expect(text(setup(fail(403)))).toContain("You can't view this payslip");
    TestBed.resetTestingModule();
    const missing = text(setup(fail(404)));
    expect(missing).toContain('Payslip not found');
    expect(missing).not.toContain("You can't view");
    TestBed.resetTestingModule();
    const broken = setup(fail(500));
    expect(text(broken)).toContain('failed 500');
    expect(broken.querySelector('app-inline-banner')).not.toBeNull();
  });
});
