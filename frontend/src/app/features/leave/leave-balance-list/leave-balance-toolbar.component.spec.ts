import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { LeaveTypeDirectoryService } from '../../../core/master-data-directory/leave-type-directory.service';
import { LeaveBalanceFilters } from '../data-access/leave-balance.store';
import { LeaveBalanceToolbarComponent } from './leave-balance-toolbar.component';

interface Internals {
  form: {
    controls: {
      employeeId: { value: string | null; setValue: (v: string | null) => void };
      leaveTypeId: { value: string; setValue: (v: string) => void };
      year: { value: string; setValue: (v: string) => void };
    };
  };
}

describe('LeaveBalanceToolbarComponent', () => {
  const employees = {
    options: signal([]),
    loading: signal(false),
    error: signal<string | null>(null),
    labelOf: () => 'Amit Rao',
    refresh: vi.fn(() => of([])),
  };
  const types = { entries: signal([{ id: 't-1', name: 'Annual Leave', status: 'ACTIVE' as const }]) };

  const setup = (filters: LeaveBalanceFilters = {}) => {
    TestBed.configureTestingModule({
      providers: [
        { provide: EmployeeDirectoryService, useValue: employees },
        { provide: LeaveTypeDirectoryService, useValue: types },
      ],
    });
    const fixture = TestBed.createComponent(LeaveBalanceToolbarComponent);
    fixture.componentRef.setInput('filters', filters);
    const emitted: LeaveBalanceFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((f) => emitted.push(f));
    fixture.detectChanges();
    return { fixture, emitted, form: (fixture.componentInstance as unknown as Internals).form, el: fixture.nativeElement as HTMLElement };
  };

  it('emits the whole filter set when the employee or the type changes', () => {
    const { emitted, form } = setup();

    form.controls.employeeId.setValue('e-1');
    form.controls.leaveTypeId.setValue('t-1');

    expect(emitted.at(-1)).toEqual({ employeeId: 'e-1', leaveTypeId: 't-1', year: undefined });
  });

  it('sends a year only once it is four digits - "2", "20", "202" are no filter yet, and cause no request', () => {
    const { emitted, form } = setup();

    for (const partial of ['2', '20', '202']) {
      form.controls.year.setValue(partial);
    }
    expect(emitted).toEqual([]);

    form.controls.year.setValue('2026');
    expect(emitted).toEqual([{ employeeId: undefined, leaveTypeId: undefined, year: 2026 }]);
  });

  it('refuses a non-numeric year rather than sending it', () => {
    const { emitted, form } = setup();

    form.controls.year.setValue('abcd');

    expect(emitted).toEqual([]);
  });

  it('never emits the same filter set twice', () => {
    const { emitted, form } = setup();

    form.controls.leaveTypeId.setValue('t-1');
    form.controls.leaveTypeId.setValue('t-1');

    expect(emitted).toHaveLength(1);
  });

  it('follows the filters the page hands back, without echoing them', () => {
    const { fixture, emitted, form } = setup();

    fixture.componentRef.setInput('filters', { employeeId: 'e-1', leaveTypeId: 't-1', year: 2025 });
    fixture.detectChanges();

    expect(form.controls.employeeId.value).toBe('e-1');
    expect(form.controls.leaveTypeId.value).toBe('t-1');
    expect(form.controls.year.value).toBe('2025');
    expect(emitted).toEqual([]);
  });

  it('shows "Clear filters" only while a filter is applied, and clearing sends an empty set', () => {
    const none = setup();
    expect([...none.el.querySelectorAll('button')].some((b) => b.textContent?.includes('Clear filters'))).toBe(false);

    TestBed.resetTestingModule();
    const some = setup({ year: 2026 });
    const button = [...some.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Clear filters'))!;
    button.click();

    expect(some.emitted.at(-1)).toEqual({ employeeId: undefined, leaveTypeId: undefined, year: undefined });
  });
});
