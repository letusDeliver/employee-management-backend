import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { Shift } from '../data-access/shift.models';
import { ShiftStore } from '../data-access/shift.store';
import { ShiftFormDialogComponent, ShiftFormDialogData } from './shift-form-dialog.component';

const existing: Shift = {
  id: 'sh-1',
  name: 'Day Shift',
  startTime: '09:00',
  endTime: '18:00',
  workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  status: 'ACTIVE',
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
};

describe('ShiftFormDialogComponent', () => {
  const store = { createRecord: vi.fn(), updateRecord: vi.fn() };
  const dialogRef = { close: vi.fn() };

  const setup = (shift: Shift | null): ComponentFixture<ShiftFormDialogComponent> => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { shift } satisfies ShiftFormDialogData },
        { provide: ShiftStore, useValue: store },
      ],
    });

    const fixture = TestBed.createComponent(ShiftFormDialogComponent);
    fixture.detectChanges();
    return fixture;
  };

  const root = (fixture: ComponentFixture<ShiftFormDialogComponent>) => fixture.nativeElement as HTMLElement;

  const type = (fixture: ComponentFixture<ShiftFormDialogComponent>, control: string, value: string) => {
    const input = root(fixture).querySelector<HTMLInputElement>(`input[formcontrolname=${control}]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const toggleDay = (fixture: ComponentFixture<ShiftFormDialogComponent>, fullName: string) => {
    root(fixture).querySelector<HTMLButtonElement>(`mat-button-toggle button[aria-label="${fullName}"]`)!.click();
    fixture.detectChanges();
  };

  const submit = (fixture: ComponentFixture<ShiftFormDialogComponent>) => {
    root(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    store.createRecord.mockReset();
    store.updateRecord.mockReset();
    dialogRef.close.mockReset();
  });

  describe('create mode', () => {
    it('starts from a visible 09:00-18:00 Mon-Fri default and has no Status field', () => {
      const fixture = setup(null);

      expect(root(fixture).querySelector('h2')?.textContent).toContain('New Shift');
      expect(root(fixture).querySelector('mat-select')).toBeNull();
      expect(root(fixture).querySelector<HTMLInputElement>('input[formcontrolname=startTime]')!.value).toBe('09:00');
      expect(root(fixture).querySelector<HTMLInputElement>('input[formcontrolname=endTime]')!.value).toBe('18:00');
      expect(root(fixture).querySelectorAll('mat-button-toggle.mat-button-toggle-checked')).toHaveLength(5);
    });

    it('offers all seven weekdays Monday-first, each with its FULL name for screen readers', () => {
      const fixture = setup(null);
      const buttons = [...root(fixture).querySelectorAll('mat-button-toggle button')];

      expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ]);
      expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    });

    it('creates with a trimmed name and working days in calendar order, then closes with the shift', () => {
      store.createRecord.mockReturnValue(of(existing));
      const fixture = setup(null);

      type(fixture, 'name', '  Weekend Cover  ');
      toggleDay(fixture, 'Saturday');
      submit(fixture);

      expect(store.createRecord).toHaveBeenCalledWith({
        name: 'Weekend Cover',
        startTime: '09:00',
        endTime: '18:00',
        workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
      });
      expect(dialogRef.close).toHaveBeenCalledWith(existing);
    });

    it('blocks a blank name client-side: no request and the dialog stays open', () => {
      const fixture = setup(null);

      type(fixture, 'name', '   ');
      submit(fixture);

      expect(store.createRecord).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(root(fixture).textContent).toContain('Shift name is required.');
    });

    it('blocks a shift with no working day and says so', () => {
      const fixture = setup(null);

      type(fixture, 'name', 'Empty Week');
      for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
        toggleDay(fixture, day);
      }
      submit(fixture);

      expect(store.createRecord).not.toHaveBeenCalled();
      expect(root(fixture).textContent).toContain('Select at least one working day.');
    });

    it('blocks an empty time', () => {
      const fixture = setup(null);

      type(fixture, 'name', 'No End');
      type(fixture, 'endTime', '');
      submit(fixture);

      expect(store.createRecord).not.toHaveBeenCalled();
      expect(root(fixture).textContent).toContain('End time is required.');
    });

    it("shows the backend's message and keeps the dialog open on failure (e.g. a duplicate name)", () => {
      store.createRecord.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({ status: 409, error: { status: 'error', message: 'A shift with this name already exists' } }),
        ),
      );
      const fixture = setup(null);

      type(fixture, 'name', 'Day Shift');
      submit(fixture);

      expect(root(fixture).querySelector('app-inline-banner')?.textContent).toContain('A shift with this name already exists');
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(root(fixture).querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false);
    });
  });

  describe('schedule hint (informs, never blocks)', () => {
    it('says nothing for an ordinary day shift', () => {
      const fixture = setup(null);

      expect(root(fixture).querySelector('.schedule-hint')).toBeNull();
    });

    it('explains an overnight shift once the end is earlier than the start, and still submits', () => {
      store.createRecord.mockReturnValue(of(existing));
      const fixture = setup(null);

      type(fixture, 'name', 'Night');
      type(fixture, 'startTime', '22:00');
      type(fixture, 'endTime', '06:00');

      expect(root(fixture).querySelector('.schedule-hint')?.textContent).toContain('ends the next day');

      submit(fixture);
      expect(store.createRecord).toHaveBeenCalledWith(expect.objectContaining({ startTime: '22:00', endTime: '06:00' }));
    });

    it('warns about a zero-length shift but does not block it - the backend accepts it', () => {
      store.createRecord.mockReturnValue(of(existing));
      const fixture = setup(null);

      type(fixture, 'name', 'Instant');
      type(fixture, 'endTime', '09:00');

      expect(root(fixture).querySelector('.schedule-hint')?.textContent).toContain('no length');

      submit(fixture);
      expect(store.createRecord).toHaveBeenCalled();
    });
  });

  describe('edit mode', () => {
    it('prefills every field and shows Status', () => {
      const fixture = setup(existing);

      expect(root(fixture).querySelector('h2')?.textContent).toContain('Edit Shift');
      expect(root(fixture).querySelector<HTMLInputElement>('input[formcontrolname=name]')!.value).toBe('Day Shift');
      expect(root(fixture).querySelector<HTMLInputElement>('input[formcontrolname=startTime]')!.value).toBe('09:00');
      expect(root(fixture).querySelector('mat-select')).not.toBeNull();
      expect(root(fixture).querySelectorAll('mat-button-toggle.mat-button-toggle-checked')).toHaveLength(5);
    });

    it('sends only what changed', () => {
      store.updateRecord.mockReturnValue(of({ ...existing, endTime: '17:30' }));
      const fixture = setup(existing);

      type(fixture, 'endTime', '17:30');
      submit(fixture);

      expect(store.updateRecord).toHaveBeenCalledWith('sh-1', { endTime: '17:30' });
      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('makes NO request when nothing changed - it just closes', () => {
      const fixture = setup(existing);

      submit(fixture);

      expect(store.updateRecord).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });

    it('sends working days as the full ordered list when one is added', () => {
      store.updateRecord.mockReturnValue(of(existing));
      const fixture = setup(existing);

      toggleDay(fixture, 'Sunday');
      submit(fixture);

      expect(store.updateRecord).toHaveBeenCalledWith('sh-1', {
        workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SUNDAY'],
      });
    });
  });
});
