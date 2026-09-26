import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { of, throwError } from 'rxjs';

import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { AttendanceRecord, EffectiveStatus } from '../data-access/attendance.models';
import { AttendanceService } from '../data-access/attendance.service';
import { StatusLookupDialogComponent } from './status-lookup-dialog.component';

interface Internals {
  form: { controls: Record<'employeeId' | 'date', { setValue: (v: unknown) => void }> };
}

const record = (): AttendanceRecord => ({
  id: 'a-1',
  employeeId: 'e-1',
  date: '2026-09-15T00:00:00.000Z',
  checkIn: new Date(2026, 8, 15, 9, 5).toISOString(),
  checkOut: new Date(2026, 8, 15, 18, 2).toISOString(),
  isHalfDay: false,
  createdAt: '2026-09-15T09:05:00.000Z',
  updatedAt: '2026-09-15T18:02:00.000Z',
});

const result = (status: EffectiveStatus, rec: AttendanceRecord | null) => ({
  employeeId: 'e-1',
  date: '2026-09-15T00:00:00.000Z',
  status,
  record: rec,
});

describe('StatusLookupDialogComponent', () => {
  const api = { effectiveStatus: vi.fn() };
  const directory = {
    options: signal([{ id: 'e-1', label: 'Amit Rao', detail: 'Joined Jan 5, 2024' }]),
    loading: signal(false),
    error: signal<string | null>(null),
    labelOf: () => 'Amit Rao',
    refresh: vi.fn(),
  };

  const setup = () => {
    TestBed.configureTestingModule({
      providers: [
        provideNativeDateAdapter(),
        { provide: AttendanceService, useValue: api },
        { provide: EmployeeDirectoryService, useValue: directory },
      ],
    });

    const fixture: ComponentFixture<StatusLookupDialogComponent> = TestBed.createComponent(StatusLookupDialogComponent);
    fixture.detectChanges();
    return { fixture, form: (fixture.componentInstance as unknown as Internals).form, el: fixture.nativeElement as HTMLElement };
  };

  const check = (fixture: ComponentFixture<StatusLookupDialogComponent>) => {
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  beforeEach(() => api.effectiveStatus.mockReset());

  it('does not ask without an employee, and says so', () => {
    const { fixture, el } = setup();

    check(fixture);

    expect(api.effectiveStatus).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Select an employee.');
  });

  it('asks for that employee and that calendar day (YYYY-MM-DD from local parts)', () => {
    api.effectiveStatus.mockReturnValue(of(result('PRESENT', record())));
    const { fixture, form } = setup();

    form.controls.employeeId.setValue('e-1');
    form.controls.date.setValue(new Date(2026, 8, 15));
    check(fixture);

    expect(api.effectiveStatus).toHaveBeenCalledWith('2026-09-15', 'e-1');
  });

  it('shows the status as a badge with its explanation, and the punches when there is a record', () => {
    api.effectiveStatus.mockReturnValue(of(result('PRESENT', record())));
    const { fixture, form, el } = setup();

    form.controls.employeeId.setValue('e-1');
    check(fixture);

    expect(el.querySelector('app-attendance-status-badge')?.textContent).toContain('Present');
    expect(el.textContent).toContain('Checked in for the day.');
    expect(el.textContent).toContain('9:05');
    expect(el.textContent).toContain('6:02');
    expect(el.textContent).toContain('8h 57m');
  });

  it.for([
    ['HOLIDAY', 'Holiday'],
    ['WEEK_OFF', 'Week off'],
    ['ON_LEAVE', 'On leave'],
  ] as const)('on a %s day says the punches are not shown, instead of implying there are none', ([status, label]) => {
    api.effectiveStatus.mockReturnValue(of(result(status, null)));
    const { fixture, form, el } = setup();

    form.controls.employeeId.setValue('e-1');
    check(fixture);

    expect(el.querySelector('app-attendance-status-badge')?.textContent).toContain(label);
    expect(el.textContent).toContain('Punches are not shown on a holiday, week off or leave day.');
    expect(el.textContent).not.toContain('Checked in');
  });

  it('shows Absent for a day with no record at all, with dashes for the punches', () => {
    api.effectiveStatus.mockReturnValue(of(result('ABSENT', null)));
    const { fixture, form, el } = setup();

    form.controls.employeeId.setValue('e-1');
    check(fixture);

    expect(el.querySelector('app-attendance-status-badge')?.textContent).toContain('Absent');
    expect(el.textContent).not.toContain('Punches are not shown');
  });

  it("shows the server's message inline when the lookup fails, and no stale result", () => {
    api.effectiveStatus
      .mockReturnValueOnce(of(result('PRESENT', record())))
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 404, error: { status: 'error', message: 'Employee not found' } })));
    const { fixture, form, el } = setup();

    form.controls.employeeId.setValue('e-1');
    check(fixture);
    expect(el.querySelector('app-attendance-status-badge')).not.toBeNull();

    check(fixture);

    expect(el.querySelector('app-inline-banner')?.textContent).toContain('Employee not found');
    expect(el.querySelector('app-attendance-status-badge')).toBeNull();
  });
});
