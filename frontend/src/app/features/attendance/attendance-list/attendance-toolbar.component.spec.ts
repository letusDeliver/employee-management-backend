import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { of } from 'rxjs';

import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { AttendanceFilters, AttendanceToolbarComponent } from './attendance-toolbar.component';

interface Internals {
  form: {
    controls: {
      employeeId: { value: string | null; setValue: (v: string | null) => void };
      range: { controls: { start: { setValue: (v: Date | null) => void; value: Date | null }; end: { setValue: (v: Date | null) => void; value: Date | null } } };
    };
  };
}

describe('AttendanceToolbarComponent', () => {
  const directory = {
    options: signal([{ id: 'e-1', label: 'Amit Rao', detail: 'Joined Jan 5, 2024' }]),
    loading: signal(false),
    error: signal<string | null>(null),
    labelOf: () => 'Amit Rao',
    refresh: vi.fn(() => of([])),
  };

  const setup = (filters: AttendanceFilters = {}) => {
    TestBed.configureTestingModule({
      providers: [provideNativeDateAdapter(), { provide: EmployeeDirectoryService, useValue: directory }],
    });

    const fixture: ComponentFixture<AttendanceToolbarComponent> = TestBed.createComponent(AttendanceToolbarComponent);
    fixture.componentRef.setInput('filters', filters);
    const emitted: AttendanceFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((value) => emitted.push(value));
    fixture.detectChanges();

    const internals = fixture.componentInstance as unknown as Internals;
    return { fixture, emitted, form: internals.form, el: fixture.nativeElement as HTMLElement };
  };

  const clearButton = (el: HTMLElement) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Clear filters'));

  it('emits the whole filter set when an employee is chosen', () => {
    const { emitted, form } = setup();

    form.controls.employeeId.setValue('e-1');

    expect(emitted).toEqual([{ employeeId: 'e-1', dateFrom: undefined, dateTo: undefined }]);
  });

  it('emits nothing for a half-picked range - only once the end is chosen, as YYYY-MM-DD', () => {
    const { emitted, form } = setup();

    form.controls.range.controls.start.setValue(new Date(2026, 8, 1));
    expect(emitted).toEqual([]);

    form.controls.range.controls.end.setValue(new Date(2026, 8, 30));
    expect(emitted).toEqual([{ employeeId: undefined, dateFrom: '2026-09-01', dateTo: '2026-09-30' }]);
  });

  it('follows the filters the page hands back, without echoing them as a new change', () => {
    const { fixture, emitted, form } = setup();

    fixture.componentRef.setInput('filters', { employeeId: 'e-1', dateFrom: '2026-09-01', dateTo: '2026-09-30' });
    fixture.detectChanges();

    expect(form.controls.employeeId.value).toBe('e-1');
    expect(form.controls.range.controls.start.value).toEqual(new Date(2026, 8, 1));
    expect(form.controls.range.controls.end.value).toEqual(new Date(2026, 8, 30));
    expect(emitted).toEqual([]);
  });

  it('clears the fields when the page clears the filters', () => {
    const { fixture, form } = setup({ employeeId: 'e-1', dateFrom: '2026-09-01', dateTo: '2026-09-30' });

    fixture.componentRef.setInput('filters', {});
    fixture.detectChanges();

    expect(form.controls.employeeId.value).toBeNull();
    expect(form.controls.range.controls.start.value).toBeNull();
    expect(form.controls.range.controls.end.value).toBeNull();
  });

  it('leaves a half-picked range alone when another filter changes', () => {
    const { fixture, form } = setup();

    form.controls.range.controls.start.setValue(new Date(2026, 8, 1));
    fixture.componentRef.setInput('filters', { employeeId: 'e-1' });
    fixture.detectChanges();

    expect(form.controls.range.controls.start.value).toEqual(new Date(2026, 8, 1));
  });

  it('shows "Clear filters" only while a filter is applied, and clearing emits an empty set', () => {
    const none = setup();
    expect(clearButton(none.el)).toBeUndefined();

    TestBed.resetTestingModule();

    const some = setup({ employeeId: 'e-1' });
    expect(clearButton(some.el)).toBeDefined();

    clearButton(some.el)!.click();
    expect(some.emitted).toEqual([{ employeeId: undefined, dateFrom: undefined, dateTo: undefined }]);
  });
});
