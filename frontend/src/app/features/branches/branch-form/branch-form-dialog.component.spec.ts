import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { signal } from '@angular/core';

import { HolidayCalendarDirectoryService } from '../../../core/master-data-directory/holiday-calendar-directory.service';
import { DirectoryOption } from '../../../core/master-data-directory/master-data-directory';
import { Branch } from '../data-access/branch.models';
import { BranchStore } from '../data-access/branch.store';
import { BranchFormDialogComponent, BranchFormDialogData } from './branch-form-dialog.component';

const branch = (holidayCalendarId: string | null): Branch => ({
  id: 'b-1',
  name: 'Pune',
  code: 'PN',
  status: 'ACTIVE',
  holidayCalendarId,
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
});

describe('BranchFormDialogComponent - holiday calendar select', () => {
  const store = { createBranch: vi.fn(), updateBranch: vi.fn() };
  const dialogRef = { close: vi.fn() };
  const error = signal<string | null>(null);
  const optionsFor = vi.fn<(id: string | null | undefined) => DirectoryOption[]>();
  const refresh = vi.fn();

  const setup = (data: Branch | null): ComponentFixture<BranchFormDialogComponent> => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { branch: data } satisfies BranchFormDialogData },
        { provide: BranchStore, useValue: store },
        { provide: HolidayCalendarDirectoryService, useValue: { error, refresh, optionsFor } },
      ],
    });

    const fixture = TestBed.createComponent(BranchFormDialogComponent);
    fixture.detectChanges();
    return fixture;
  };

  const root = (fixture: ComponentFixture<BranchFormDialogComponent>) => fixture.nativeElement as HTMLElement;
  const select = (fixture: ComponentFixture<BranchFormDialogComponent>, value: string) => {
    // The dialog's form group is the source of truth; the select is bound to it by formControlName.
    (fixture.componentInstance as unknown as { form: { controls: { holidayCalendarId: { setValue(v: string): void } } } }).form.controls.holidayCalendarId.setValue(value);
    fixture.detectChanges();
  };
  const submit = (fixture: ComponentFixture<BranchFormDialogComponent>) => {
    root(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };
  const typeName = (fixture: ComponentFixture<BranchFormDialogComponent>, value: string) => {
    const input = root(fixture).querySelector<HTMLInputElement>('input[formcontrolname=name]')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    store.createBranch.mockReset().mockReturnValue(of(branch(null)));
    store.updateBranch.mockReset().mockReturnValue(of(branch(null)));
    dialogRef.close.mockReset();
    refresh.mockReset().mockReturnValue(of([]));
    optionsFor.mockReset().mockReturnValue([
      { id: 'cal-1', label: 'India Public Holidays', inactive: false },
      { id: 'cal-2', label: 'US Public Holidays', inactive: false },
    ]);
    error.set(null);
  });

  it('loads the calendars when the dialog opens', () => {
    setup(null);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('offers the select in create mode, defaulting to "No calendar"', () => {
    const fixture = setup(null);

    expect(root(fixture).textContent).toContain('Holiday calendar (optional)');
    expect(root(fixture).querySelector('mat-select[formcontrolname=holidayCalendarId]')).not.toBeNull();
  });

  it('asks the directory for the branch\'s CURRENT calendar so an inactive one is still shown', () => {
    setup(branch('cal-old'));

    expect(optionsFor).toHaveBeenCalledWith('cal-old');
  });

  describe('create', () => {
    it('omits holidayCalendarId when "No calendar" is chosen', () => {
      const fixture = setup(null);

      typeName(fixture, 'Pune');
      submit(fixture);

      expect(store.createBranch).toHaveBeenCalledWith({ name: 'Pune', code: undefined });
    });

    it('sends the chosen calendar', () => {
      const fixture = setup(null);

      typeName(fixture, 'Pune');
      select(fixture, 'cal-1');
      submit(fixture);

      expect(store.createBranch).toHaveBeenCalledWith({ name: 'Pune', code: undefined, holidayCalendarId: 'cal-1' });
    });
  });

  describe('edit', () => {
    it('does NOT re-send an unchanged calendar (the backend would reject a now-inactive one)', () => {
      const fixture = setup(branch('cal-old'));

      submit(fixture);

      const [, body] = store.updateBranch.mock.calls[0];
      expect(body).toEqual({ name: 'Pune', code: 'PN', status: 'ACTIVE' });
      expect('holidayCalendarId' in body).toBe(false);
    });

    it('sends the new calendar id when another one is picked', () => {
      const fixture = setup(branch('cal-1'));

      select(fixture, 'cal-2');
      submit(fixture);

      expect(store.updateBranch).toHaveBeenCalledWith('b-1', { name: 'Pune', code: 'PN', status: 'ACTIVE', holidayCalendarId: 'cal-2' });
    });

    it('sends null to clear the calendar', () => {
      const fixture = setup(branch('cal-1'));

      select(fixture, '');
      submit(fixture);

      expect(store.updateBranch).toHaveBeenCalledWith('b-1', { name: 'Pune', code: 'PN', status: 'ACTIVE', holidayCalendarId: null });
    });
  });

  describe('when the calendars could not be loaded', () => {
    it('disables only the select, explains why, and still saves the branch without touching its calendar', () => {
      error.set('boom');
      const fixture = setup(branch('cal-1'));

      const control = (fixture.componentInstance as unknown as { form: { controls: { holidayCalendarId: { disabled: boolean }; name: { disabled: boolean } } } }).form.controls;
      expect(control.holidayCalendarId.disabled).toBe(true);
      expect(control.name.disabled).toBe(false);
      expect(root(fixture).textContent).toContain('Holiday calendars could not be loaded');

      submit(fixture);

      const [, body] = store.updateBranch.mock.calls[0];
      expect('holidayCalendarId' in body).toBe(false);
    });
  });
});
