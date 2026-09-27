import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PayrollRun } from '../data-access/payroll.models';
import { run } from '../data-access/payroll.testing';
import { PayrollRunTableComponent } from './payroll-run-table.component';

describe('PayrollRunTableComponent', () => {
  const setup = (rows: PayrollRun[], inputs: Partial<{ canDeleteRuns: boolean; deletingIds: ReadonlySet<string> }> = {}) => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PayrollRunTableComponent);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('pagination', { page: 1, limit: 12, total: rows.length, totalPages: 1 });
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const deleteButton = (el: HTMLElement) => [...el.querySelectorAll('button')].find((b) => /^Delete/.test(b.getAttribute('aria-label') ?? ''));

  it('shows the period by name, the status in words, and links to the run', () => {
    const el = setup([run({ status: 'PROCESSING' })]);

    expect(el.textContent).toContain('August 2026');
    expect(el.textContent).toContain('Processing');
    expect(el.querySelector('a.period-link')?.getAttribute('href')).toBe('/payroll/run-1');
  });

  it('offers Delete only for a DRAFT run, and only with the permission', () => {
    expect(deleteButton(setup([run({ status: 'DRAFT' })], { canDeleteRuns: true }))).toBeDefined();
    TestBed.resetTestingModule();
    expect(deleteButton(setup([run({ status: 'PROCESSING' })], { canDeleteRuns: true }))).toBeUndefined();
    TestBed.resetTestingModule();
    expect(deleteButton(setup([run({ status: 'DRAFT' })], { canDeleteRuns: false }))).toBeUndefined();
  });

  it('replaces Delete with a spinner while that run is being deleted', () => {
    const el = setup([run()], { canDeleteRuns: true, deletingIds: new Set(['run-1']) });

    expect(deleteButton(el)).toBeUndefined();
    expect(el.querySelector('mat-progress-spinner')?.getAttribute('aria-label')).toBe('Deleting August 2026');
  });
});
