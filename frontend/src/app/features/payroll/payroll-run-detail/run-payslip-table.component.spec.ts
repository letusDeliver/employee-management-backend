import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Payslip } from '../data-access/payroll.models';
import { payslip } from '../data-access/payroll.testing';
import { RunPayslipTableComponent } from './run-payslip-table.component';

describe('RunPayslipTableComponent', () => {
  const setup = (rows: Payslip[]) => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(RunPayslipTableComponent);
    fixture.componentRef.setInput('runId', 'run-1');
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('pagination', { page: 1, limit: 10, total: rows.length, totalPages: 1 });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const cells = (el: HTMLElement) =>
    [...el.querySelectorAll('tr.mat-mdc-row')[0].querySelectorAll('td')].map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim());

  it('shows the SNAPSHOT name and role, the days, and every amount', () => {
    const el = setup([payslip()]);

    expect(el.querySelector('.employee-name')?.textContent?.trim()).toBe('Asha Rao');
    expect(el.querySelector('.role-line')?.textContent?.trim()).toBe('Analyst · Finance');
    expect(cells(el).slice(1, 5)).toEqual(['17.5 / 20', '$1,000.00', '$125.00', '$875.00']);
  });

  it('says "No name on record" for a payslip without a name - never an id', () => {
    const el = setup([payslip({ employeeName: null })]);

    expect(el.querySelector('.employee-name')?.textContent?.trim()).toBe('No name on record');
    expect(el.querySelector('.employee-name.no-name')).not.toBeNull();
    expect(el.textContent).not.toContain('e-1');
  });

  it("links each row to its payslip under the run, and right-aligns the amounts", () => {
    const el = setup([payslip()]);

    expect(el.querySelector('a[mat-icon-button]')?.getAttribute('href')).toBe('/payroll/run-1/payslips/slip-1');
    expect(el.querySelectorAll('td.cell-end')).toHaveLength(4);
    expect(el.querySelectorAll('th.cell-end')).toHaveLength(4);
  });
});
