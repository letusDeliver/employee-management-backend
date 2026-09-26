import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { of } from 'rxjs';

import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { LeaveTypeDirectoryService } from '../../../core/master-data-directory/leave-type-directory.service';
import { LeaveRequestFilters } from '../data-access/leave-request.store';
import { LeaveRequestToolbarComponent } from './leave-request-toolbar.component';

interface Internals {
  form: {
    controls: {
      employeeId: { value: string | null; setValue: (v: string | null) => void };
      status: { value: string; setValue: (v: string) => void };
      leaveTypeId: { value: string; setValue: (v: string) => void };
      range: { controls: { start: { setValue: (v: Date | null) => void; value: Date | null }; end: { setValue: (v: Date | null) => void; value: Date | null } } };
    };
  };
}

describe('LeaveRequestToolbarComponent', () => {
  const employees = {
    options: signal([{ id: 'e-1', label: 'Amit Rao', detail: 'Joined Jan 5, 2024' }]),
    loading: signal(false),
    error: signal<string | null>(null),
    labelOf: () => 'Amit Rao',
    refresh: vi.fn(() => of([])),
  };
  const types = {
    entries: signal([
      { id: 't-1', name: 'Annual Leave', status: 'ACTIVE' as const },
      { id: 't-2', name: 'Old Leave', status: 'INACTIVE' as const },
    ]),
  };

  const setup = (filters: LeaveRequestFilters = {}) => {
    TestBed.configureTestingModule({
      providers: [
        provideNativeDateAdapter(),
        { provide: EmployeeDirectoryService, useValue: employees },
        { provide: LeaveTypeDirectoryService, useValue: types },
      ],
    });
    const fixture = TestBed.createComponent(LeaveRequestToolbarComponent);
    fixture.componentRef.setInput('filters', filters);
    const emitted: LeaveRequestFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((f) => emitted.push(f));
    fixture.detectChanges();
    return { fixture, emitted, form: (fixture.componentInstance as unknown as Internals).form, el: fixture.nativeElement as HTMLElement };
  };

  const clearButton = (el: HTMLElement) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Clear filters'));

  it('emits the WHOLE filter set when the employee, the status or the type changes', () => {
    const { emitted, form } = setup();

    form.controls.employeeId.setValue('e-1');
    form.controls.status.setValue('APPROVED');
    form.controls.leaveTypeId.setValue('t-1');

    expect(emitted.at(-1)).toEqual({ employeeId: 'e-1', status: 'APPROVED', leaveTypeId: 't-1', dateFrom: undefined, dateTo: undefined });
  });

  it('treats "All" as no filter', () => {
    const { emitted, form } = setup({ status: 'PENDING' });

    form.controls.status.setValue('');

    expect(emitted.at(-1)).toMatchObject({ status: undefined });
  });

  it('emits nothing for a half-picked range - only once the end is chosen, as YYYY-MM-DD', () => {
    const { emitted, form } = setup();

    form.controls.range.controls.start.setValue(new Date(2026, 10, 1));
    expect(emitted).toEqual([]);

    form.controls.range.controls.end.setValue(new Date(2026, 10, 30));
    expect(emitted).toEqual([{ employeeId: undefined, status: undefined, leaveTypeId: undefined, dateFrom: '2026-11-01', dateTo: '2026-11-30' }]);
  });

  it('never emits the same filter set twice for one action', () => {
    const { emitted, form } = setup();

    form.controls.status.setValue('APPROVED');
    form.controls.status.setValue('APPROVED');

    expect(emitted).toHaveLength(1);
  });

  it("follows the filters the page hands back (it starts on PENDING) without echoing them", () => {
    const { fixture, emitted, form } = setup();

    fixture.componentRef.setInput('filters', { status: 'PENDING', employeeId: 'e-1', dateFrom: '2026-11-01', dateTo: '2026-11-30' });
    fixture.detectChanges();

    expect(form.controls.status.value).toBe('PENDING');
    expect(form.controls.employeeId.value).toBe('e-1');
    expect(form.controls.range.controls.start.value).toEqual(new Date(2026, 10, 1));
    expect(emitted).toEqual([]);
  });

  it('offers every leave type - an inactive one too, marked, since old requests still carry it', () => {
    const { fixture, el } = setup();

    (el.querySelector('mat-select[formcontrolname=leaveTypeId] .mat-mdc-select-trigger') as HTMLElement).click();
    fixture.detectChanges();

    const options = [...document.querySelectorAll('mat-option')].map((o) => (o.textContent ?? '').trim());
    expect(options).toEqual(['All', 'Annual Leave', 'Old Leave (inactive)']);
    document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
  });

  it('shows "Clear filters" only while a filter is applied, and clearing sends an empty set', () => {
    const none = setup();
    expect(clearButton(none.el)).toBeUndefined();

    TestBed.resetTestingModule();
    const some = setup({ status: 'PENDING' });
    expect(clearButton(some.el)).toBeDefined();

    clearButton(some.el)!.click();
    expect(some.emitted.at(-1)).toEqual({ employeeId: undefined, status: undefined, leaveTypeId: undefined, dateFrom: undefined, dateTo: undefined });
  });
});
