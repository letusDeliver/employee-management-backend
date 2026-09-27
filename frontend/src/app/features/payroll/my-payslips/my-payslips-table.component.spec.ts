import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { payslip } from '../data-access/payroll.testing';
import { MyPayslipsTableComponent } from './my-payslips-table.component';

describe('MyPayslipsTableComponent', () => {
  it('shows the period, then net pay first, gross and deductions, and links to the payslip under My payslips', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(MyPayslipsTableComponent);
    fixture.componentRef.setInput('rows', [payslip()]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const cells = [...el.querySelectorAll('tr.mat-mdc-row td')].map((td) => (td.textContent ?? '').trim());
    expect(cells.slice(0, 4)).toEqual(['August 2026', '$875.00', '$1,000.00', '$125.00']);
    expect(el.querySelector('a.period-link')?.getAttribute('href')).toBe('/my-payslips/slip-1');
    expect(el.querySelector('a[mat-icon-button]')?.getAttribute('aria-label')).toBe('View August 2026 payslip');
  });
});
