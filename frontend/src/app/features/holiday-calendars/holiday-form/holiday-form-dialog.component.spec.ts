import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { Holiday } from '../data-access/holiday-calendar.models';
import { HolidayListStore } from '../data-access/holiday-list.store';
import { HolidayFormDialogComponent, HolidayFormDialogData } from './holiday-form-dialog.component';

const existing: Holiday = {
  id: 'h-1',
  holidayCalendarId: 'cal-1',
  date: '2026-08-15T00:00:00.000Z',
  name: 'Independence Day',
  isOptional: false,
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
};

describe('HolidayFormDialogComponent', () => {
  const store = { addHoliday: vi.fn(), updateHoliday: vi.fn(), selectedYear: vi.fn() };
  const dialogRef = { close: vi.fn() };

  const setup = (holiday: Holiday | null): ComponentFixture<HolidayFormDialogComponent> => {
    TestBed.configureTestingModule({
      providers: [
        provideNativeDateAdapter(),
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { holiday, store: store as unknown as HolidayListStore } satisfies HolidayFormDialogData,
        },
      ],
    });

    const fixture = TestBed.createComponent(HolidayFormDialogComponent);
    fixture.detectChanges();
    return fixture;
  };

  const root = (fixture: ComponentFixture<HolidayFormDialogComponent>) => fixture.nativeElement as HTMLElement;

  const type = (fixture: ComponentFixture<HolidayFormDialogComponent>, control: string, value: string) => {
    const input = root(fixture).querySelector<HTMLInputElement>(`input[formcontrolname=${control}]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const submit = (fixture: ComponentFixture<HolidayFormDialogComponent>) => {
    root(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    store.addHoliday.mockReset();
    store.updateHoliday.mockReset();
    store.selectedYear.mockReset();
    store.selectedYear.mockReturnValue('ALL');
    dialogRef.close.mockReset();
  });

  describe('add mode', () => {
    it('starts empty, with the holiday unticked as optional', () => {
      const fixture = setup(null);

      expect(root(fixture).querySelector('h2')?.textContent).toContain('Add Holiday');
      expect(root(fixture).querySelector<HTMLInputElement>('input[formcontrolname=date]')!.value).toBe('');
      expect(root(fixture).querySelector<HTMLInputElement>('input[formcontrolname=name]')!.value).toBe('');
      expect(root(fixture).querySelector('mat-checkbox input')?.getAttribute('aria-checked') ?? 'false').toBe('false');
    });

    it('adds with the date as YYYY-MM-DD from local parts (no UTC shift), a trimmed name and the flag', () => {
      const added = { ...existing, id: 'h-2' };
      store.addHoliday.mockReturnValue(of(added));
      const fixture = setup(null);

      type(fixture, 'date', '8/15/2026');
      type(fixture, 'name', '  Independence Day  ');
      root(fixture).querySelector<HTMLInputElement>('mat-checkbox input')!.click();
      fixture.detectChanges();
      submit(fixture);

      expect(store.addHoliday).toHaveBeenCalledWith({ date: '2026-08-15', name: 'Independence Day', isOptional: true });
      expect(dialogRef.close).toHaveBeenCalledWith(added);
    });

    it('blocks a missing date client-side: no request, the dialog stays open, and it says so', () => {
      const fixture = setup(null);

      type(fixture, 'name', 'Diwali');
      submit(fixture);

      expect(store.addHoliday).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(root(fixture).textContent).toContain('Pick a date.');
    });

    it('blocks a blank name client-side', () => {
      const fixture = setup(null);

      type(fixture, 'date', '8/15/2026');
      type(fixture, 'name', '   ');
      submit(fixture);

      expect(store.addHoliday).not.toHaveBeenCalled();
      expect(root(fixture).textContent).toContain('Holiday name is required.');
    });

    it("shows the backend's message and keeps the dialog open when the date is already taken (409)", () => {
      store.addHoliday.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { status: 'error', message: 'A holiday already exists on this date in this calendar' },
            }),
        ),
      );
      const fixture = setup(null);

      type(fixture, 'date', '8/15/2026');
      type(fixture, 'name', 'Dup');
      submit(fixture);

      expect(root(fixture).querySelector('app-inline-banner')?.textContent).toContain('already exists on this date');
      expect(dialogRef.close).not.toHaveBeenCalled();
      // Not stuck in a "saving" state: the user can correct the date and retry.
      expect(root(fixture).querySelector('mat-progress-spinner')).toBeNull();
    });
  });

  describe('edit mode', () => {
    it('is prefilled, and shows the API\'s UTC-midnight date as the same calendar day', () => {
      const fixture = setup(existing);

      expect(root(fixture).querySelector('h2')?.textContent).toContain('Edit Holiday');
      expect(root(fixture).querySelector<HTMLInputElement>('input[formcontrolname=date]')!.value).toBe('8/15/2026');
      expect(root(fixture).querySelector<HTMLInputElement>('input[formcontrolname=name]')!.value).toBe('Independence Day');
    });

    it('sends nothing and just closes when nothing changed', () => {
      const fixture = setup(existing);

      submit(fixture);

      expect(store.updateHoliday).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });

    it('sends only the changed field', () => {
      const updated = { ...existing, name: 'Independence Day (India)' };
      store.updateHoliday.mockReturnValue(of(updated));
      const fixture = setup(existing);

      type(fixture, 'name', 'Independence Day (India)');
      submit(fixture);

      expect(store.updateHoliday).toHaveBeenCalledWith('h-1', { name: 'Independence Day (India)' });
      expect(dialogRef.close).toHaveBeenCalledWith(updated);
    });

    it('sends the moved date and nothing else', () => {
      store.updateHoliday.mockReturnValue(of(existing));
      const fixture = setup(existing);

      type(fixture, 'date', '8/16/2026');
      submit(fixture);

      expect(store.updateHoliday).toHaveBeenCalledWith('h-1', { date: '2026-08-16' });
    });
  });
});
