import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { AttendanceRecord } from '../data-access/attendance.models';
import { AttendanceStore } from '../data-access/attendance.store';
import { AttendanceFormDialogComponent, AttendanceFormDialogData } from './attendance-form-dialog.component';

const at = (d: number, h: number, m: number, s = 0): string => new Date(2026, 8, d, h, m, s).toISOString();

const existing: AttendanceRecord = {
  id: 'a-1',
  employeeId: 'e-1',
  date: '2026-09-15T00:00:00.000Z',
  checkIn: at(15, 9, 5, 33),
  checkOut: at(15, 18, 2, 41),
  isHalfDay: false,
  createdAt: '2026-09-15T09:05:33.000Z',
  updatedAt: '2026-09-15T18:02:41.000Z',
};

interface Internals {
  form: {
    controls: Record<'employeeId' | 'date' | 'checkIn' | 'checkOut' | 'isHalfDay', { setValue: (v: unknown) => void; hasError: (e: string) => boolean }>;
    valid: boolean;
  };
}

describe('AttendanceFormDialogComponent', () => {
  const store = { createRecord: vi.fn(), updateRecord: vi.fn() };
  const dialogRef = { close: vi.fn() };
  const directory = {
    options: signal([{ id: 'e-1', label: 'Amit Rao', detail: 'Joined Jan 5, 2024' }]),
    loading: signal(false),
    error: signal<string | null>(null),
    labelOf: () => 'Amit Rao',
    refresh: vi.fn(),
  };

  const setup = (record: AttendanceRecord | null): { fixture: ComponentFixture<AttendanceFormDialogComponent>; form: Internals['form']; el: HTMLElement } => {
    TestBed.configureTestingModule({
      providers: [
        provideNativeDateAdapter(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: EmployeeDirectoryService, useValue: directory },
        { provide: MAT_DIALOG_DATA, useValue: { record, store: store as unknown as AttendanceStore } satisfies AttendanceFormDialogData },
      ],
    });

    const fixture = TestBed.createComponent(AttendanceFormDialogComponent);
    fixture.detectChanges();
    return { fixture, form: (fixture.componentInstance as unknown as Internals).form, el: fixture.nativeElement as HTMLElement };
  };

  const submit = (fixture: ComponentFixture<AttendanceFormDialogComponent>) => {
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };
  const submitButton = (el: HTMLElement) => el.querySelector('button[type=submit]') as HTMLButtonElement;
  const httpError = (status: number, message: string) =>
    throwError(() => new HttpErrorResponse({ status, error: { status: 'error', message } }));

  beforeEach(() => {
    store.createRecord.mockReset();
    store.updateRecord.mockReset();
    dialogRef.close.mockReset();
  });

  describe('create mode', () => {
    it('starts with an employee to pick, today (the server\'s) as the date and no punches', () => {
      const { el } = setup(null);

      expect(el.querySelector('h2')?.textContent).toContain('New Attendance Record');
      expect(el.querySelector('app-employee-picker')).not.toBeNull();
      expect(el.querySelector<HTMLInputElement>('input[formcontrolname=checkIn]')!.value).toBe('');
      expect(el.querySelector<HTMLInputElement>('input[formcontrolname=checkOut]')!.value).toBe('');
      expect(submitButton(el).textContent).toContain('Create Record');
    });

    it('does not submit without an employee, and says so', () => {
      const { fixture, el } = setup(null);

      submit(fixture);

      expect(store.createRecord).not.toHaveBeenCalled();
      expect(el.textContent).toContain('Select an employee.');
      expect(submitButton(el).disabled).toBe(true);
    });

    it('sends the date as YYYY-MM-DD and the punches as instants, with no empty punch', () => {
      store.createRecord.mockReturnValue(of(existing));
      const { fixture, form } = setup(null);

      form.controls.employeeId.setValue('e-1');
      form.controls.date.setValue(new Date(2026, 8, 15));
      form.controls.checkIn.setValue('2026-09-15T09:05');
      submit(fixture);

      expect(store.createRecord).toHaveBeenCalledWith({
        employeeId: 'e-1',
        date: '2026-09-15',
        checkIn: new Date(2026, 8, 15, 9, 5).toISOString(),
        isHalfDay: false,
      });
      expect(dialogRef.close).toHaveBeenCalledWith(existing);
    });

    it('blocks a date after the server\'s (UTC) today, exactly as the backend does', () => {
      const { fixture, form, el } = setup(null);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);

      form.controls.employeeId.setValue('e-1');
      form.controls.date.setValue(tomorrow);
      fixture.detectChanges();
      submit(fixture);

      expect(form.controls.date.hasError('matDatepickerMax')).toBe(true);
      expect(store.createRecord).not.toHaveBeenCalled();
      expect(el.textContent).toContain('The date cannot be in the future.');
    });

    it('blocks a check out before the check in, but accepts an equal one', () => {
      store.createRecord.mockReturnValue(of(existing));
      const { fixture, form, el } = setup(null);

      form.controls.employeeId.setValue('e-1');
      form.controls.date.setValue(new Date(2026, 8, 15));
      form.controls.checkIn.setValue('2026-09-15T18:00');
      form.controls.checkOut.setValue('2026-09-15T09:00');
      fixture.detectChanges();
      submit(fixture);

      expect(store.createRecord).not.toHaveBeenCalled();
      expect(el.textContent).toContain('Check out cannot be before check in.');
      expect(submitButton(el).disabled).toBe(true);

      form.controls.checkOut.setValue('2026-09-15T18:00');
      fixture.detectChanges();
      submit(fixture);

      expect(store.createRecord).toHaveBeenCalledTimes(1);
    });

    it('accepts a night shift and only notes the check out on the next day', () => {
      store.createRecord.mockReturnValue(of(existing));
      const { fixture, form, el } = setup(null);

      form.controls.employeeId.setValue('e-1');
      form.controls.date.setValue(new Date(2026, 8, 15));
      form.controls.checkIn.setValue('2026-09-15T22:00');
      form.controls.checkOut.setValue('2026-09-16T06:30');
      fixture.detectChanges();

      expect(el.textContent).toContain('On a different date than the record');
      submit(fixture);
      expect(store.createRecord).toHaveBeenCalledTimes(1);
    });

    it("shows the server's message and stays open when the create is refused", () => {
      store.createRecord.mockReturnValue(httpError(409, 'An attendance record already exists for this employee and date'));
      const { fixture, form, el } = setup(null);

      form.controls.employeeId.setValue('e-1');
      submit(fixture);

      expect(el.textContent).toContain('An attendance record already exists for this employee and date');
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(submitButton(el).disabled).toBe(false);
    });
  });

  describe('correct mode', () => {
    it('shows whose day it is, read-only, with the punches filled in at minute precision', () => {
      const { el } = setup(existing);

      expect(el.querySelector('h2')?.textContent).toContain('Correct Attendance');
      expect(el.textContent).toContain('Amit Rao');
      expect(el.textContent).toContain('Sep 15, 2026'); // the date pipe uses the app locale (en-US)
      expect(el.querySelector('app-employee-picker')).toBeNull();
      expect(el.querySelector('input[formcontrolname=date]')).toBeNull();
      expect(el.querySelector<HTMLInputElement>('input[formcontrolname=checkIn]')!.value).toBe('2026-09-15T09:05');
      expect(submitButton(el).textContent).toContain('Save Changes');
    });

    it('sends no request at all when nothing changed - even though the stored punches carry seconds', () => {
      const { fixture } = setup(existing);

      submit(fixture);

      expect(store.updateRecord).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });

    it('sends only the punch that changed', () => {
      store.updateRecord.mockReturnValue(of(existing));
      const { fixture, form } = setup(existing);

      form.controls.checkOut.setValue('2026-09-15T19:00');
      submit(fixture);

      expect(store.updateRecord).toHaveBeenCalledWith('a-1', { checkOut: new Date(2026, 8, 15, 19, 0).toISOString() });
    });

    it('clears a punch with null', () => {
      store.updateRecord.mockReturnValue(of(existing));
      const { fixture, form } = setup(existing);

      form.controls.checkOut.setValue('');
      submit(fixture);

      expect(store.updateRecord).toHaveBeenCalledWith('a-1', { checkOut: null });
    });

    it('sends the half-day flag when it is ticked', () => {
      store.updateRecord.mockReturnValue(of(existing));
      const { fixture, form } = setup(existing);

      form.controls.isHalfDay.setValue(true);
      submit(fixture);

      expect(store.updateRecord).toHaveBeenCalledWith('a-1', { isHalfDay: true });
    });

    it('blocks a correction that puts the check out before the check in', () => {
      const { fixture, form, el } = setup(existing);

      form.controls.checkOut.setValue('2026-09-15T08:00');
      fixture.detectChanges();
      submit(fixture);

      expect(store.updateRecord).not.toHaveBeenCalled();
      expect(el.textContent).toContain('Check out cannot be before check in.');
    });
  });
});
