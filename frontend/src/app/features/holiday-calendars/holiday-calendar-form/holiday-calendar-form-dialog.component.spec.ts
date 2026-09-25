import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { HolidayCalendar } from '../data-access/holiday-calendar.models';
import { HolidayCalendarStore } from '../data-access/holiday-calendar.store';
import {
  HolidayCalendarFormDialogComponent,
  HolidayCalendarFormDialogData,
} from './holiday-calendar-form-dialog.component';

const existing: HolidayCalendar = {
  id: 'cal-1',
  name: 'India Public Holidays',
  status: 'ACTIVE',
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
};

describe('HolidayCalendarFormDialogComponent', () => {
  const store = { createRecord: vi.fn(), updateRecord: vi.fn() };
  const dialogRef = { close: vi.fn() };

  const setup = (calendar: HolidayCalendar | null): ComponentFixture<HolidayCalendarFormDialogComponent> => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { calendar } satisfies HolidayCalendarFormDialogData },
        { provide: HolidayCalendarStore, useValue: store },
      ],
    });

    const fixture = TestBed.createComponent(HolidayCalendarFormDialogComponent);
    fixture.detectChanges();
    return fixture;
  };

  const root = (fixture: ComponentFixture<HolidayCalendarFormDialogComponent>) => fixture.nativeElement as HTMLElement;

  const typeName = (fixture: ComponentFixture<HolidayCalendarFormDialogComponent>, value: string) => {
    const input = root(fixture).querySelector<HTMLInputElement>('input[formcontrolname=name]')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const submit = (fixture: ComponentFixture<HolidayCalendarFormDialogComponent>) => {
    root(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    store.createRecord.mockReset();
    store.updateRecord.mockReset();
    dialogRef.close.mockReset();
  });

  describe('create mode', () => {
    it('asks only for a name (no code, no Status field)', () => {
      const fixture = setup(null);

      expect(root(fixture).querySelector('h2')?.textContent).toContain('New Holiday Calendar');
      expect(root(fixture).querySelector('mat-select')).toBeNull();
      expect(root(fixture).querySelector('input[formcontrolname=code]')).toBeNull();
    });

    it('creates with a trimmed name and closes with the calendar', () => {
      store.createRecord.mockReturnValue(of(existing));
      const fixture = setup(null);

      typeName(fixture, '  India Public Holidays  ');
      submit(fixture);

      expect(store.createRecord).toHaveBeenCalledWith({ name: 'India Public Holidays' });
      expect(dialogRef.close).toHaveBeenCalledWith(existing);
    });

    it('blocks a blank name client-side: no request and the dialog stays open', () => {
      const fixture = setup(null);

      typeName(fixture, '   ');
      submit(fixture);

      expect(store.createRecord).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(root(fixture).textContent).toContain('Calendar name is required.');
    });

    it("shows the backend's message and stays open when the name is taken (409)", () => {
      store.createRecord.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { status: 'error', message: 'A holiday calendar with this name already exists' },
            }),
        ),
      );
      const fixture = setup(null);

      typeName(fixture, 'India Public Holidays');
      submit(fixture);

      expect(root(fixture).querySelector('app-inline-banner')?.textContent).toContain('already exists');
      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('edit mode', () => {
    it('is prefilled and offers a Status field', () => {
      const fixture = setup(existing);

      expect(root(fixture).querySelector('h2')?.textContent).toContain('Edit Holiday Calendar');
      expect(root(fixture).querySelector<HTMLInputElement>('input[formcontrolname=name]')!.value).toBe('India Public Holidays');
      expect(root(fixture).querySelector('mat-select')).not.toBeNull();
    });

    it('sends nothing and just closes when nothing changed', () => {
      const fixture = setup(existing);

      submit(fixture);

      expect(store.updateRecord).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });

    it('sends only the changed name', () => {
      store.updateRecord.mockReturnValue(of({ ...existing, name: 'India Holidays' }));
      const fixture = setup(existing);

      typeName(fixture, 'India Holidays');
      submit(fixture);

      expect(store.updateRecord).toHaveBeenCalledWith('cal-1', { name: 'India Holidays' });
    });
  });
});
