import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { LeaveTypeDirectoryService } from '../../../core/master-data-directory/leave-type-directory.service';
import { LeaveRequest } from '../data-access/leave.models';
import { MyLeaveStore } from '../data-access/my-leave.store';
import { ApplyLeaveDialogComponent, ApplyLeaveDialogData } from './apply-leave-dialog.component';

interface Internals {
  form: {
    controls: {
      leaveTypeId: { setValue: (v: string | null) => void };
      range: { controls: { start: { setValue: (v: Date | null) => void }; end: { setValue: (v: Date | null) => void } } };
      reason: { setValue: (v: string) => void };
    };
  };
}

const created: LeaveRequest = {
  id: 'r-1',
  employeeId: 'e-me',
  leaveTypeId: 't-1',
  startDate: '2026-11-02T00:00:00.000Z',
  endDate: '2026-11-06T00:00:00.000Z',
  reason: null,
  status: 'PENDING',
  durationDays: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('ApplyLeaveDialogComponent', () => {
  const store = { apply: vi.fn() };
  const dialogRef = { close: vi.fn() };
  const types = {
    active: signal([
      { id: 't-1', name: 'Annual Leave', status: 'ACTIVE' as const },
      { id: 't-2', name: 'Sick Leave', status: 'ACTIVE' as const },
    ]),
    loading: signal(false),
    loaded: signal(true),
    error: signal<string | null>(null),
    refresh: vi.fn(() => of([])),
  };

  const setup = (): { fixture: ComponentFixture<ApplyLeaveDialogComponent>; form: Internals['form']; el: HTMLElement } => {
    TestBed.configureTestingModule({
      providers: [
        provideNativeDateAdapter(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: LeaveTypeDirectoryService, useValue: types },
        { provide: MAT_DIALOG_DATA, useValue: { store: store as unknown as MyLeaveStore } satisfies ApplyLeaveDialogData },
      ],
    });
    const fixture = TestBed.createComponent(ApplyLeaveDialogComponent);
    fixture.detectChanges();
    return { fixture, form: (fixture.componentInstance as unknown as Internals).form, el: fixture.nativeElement as HTMLElement };
  };

  const submit = (fixture: ComponentFixture<ApplyLeaveDialogComponent>) => {
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };
  const submitButton = (el: HTMLElement) => el.querySelector('button[type=submit]') as HTMLButtonElement;
  const httpError = (status: number, message: string) => throwError(() => new HttpErrorResponse({ status, error: { status: 'error', message } }));

  beforeEach(() => {
    store.apply.mockReset();
    dialogRef.close.mockReset();
    types.refresh.mockClear();
    types.loading.set(false);
    types.loaded.set(true);
    types.error.set(null);
    types.active.set([
      { id: 't-1', name: 'Annual Leave', status: 'ACTIVE' },
      { id: 't-2', name: 'Sick Leave', status: 'ACTIVE' },
    ]);
  });

  it('does not submit an empty form, and says what is missing, with the button disabled', () => {
    const { fixture, el } = setup();

    submit(fixture);

    expect(store.apply).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Choose a leave type.');
    expect(el.textContent).toContain('Pick the first and last day');
    expect(submitButton(el).disabled).toBe(true);
  });

  it('sends the range as YYYY-MM-DD, a trimmed reason, and closes with the created request', () => {
    store.apply.mockReturnValue(of(created));
    const { fixture, form } = setup();

    form.controls.leaveTypeId.setValue('t-1');
    form.controls.range.controls.start.setValue(new Date(2026, 10, 2));
    form.controls.range.controls.end.setValue(new Date(2026, 10, 6));
    form.controls.reason.setValue('  Family trip ');
    submit(fixture);

    expect(store.apply).toHaveBeenCalledWith({ leaveTypeId: 't-1', startDate: '2026-11-02', endDate: '2026-11-06', reason: 'Family trip' });
    expect(dialogRef.close).toHaveBeenCalledWith(created);
  });

  it('omits a blank reason and accepts a single-day range', () => {
    store.apply.mockReturnValue(of(created));
    const { fixture, form } = setup();

    form.controls.leaveTypeId.setValue('t-1');
    form.controls.range.controls.start.setValue(new Date(2026, 10, 2));
    form.controls.range.controls.end.setValue(new Date(2026, 10, 2));
    submit(fixture);

    const [request] = store.apply.mock.calls[0];
    expect(request).not.toHaveProperty('reason');
    expect(request.startDate).toBe(request.endDate);
  });

  it('refuses a last day before the first, with a message', () => {
    const { fixture, form, el } = setup();

    form.controls.leaveTypeId.setValue('t-1');
    form.controls.range.controls.start.setValue(new Date(2026, 10, 6));
    form.controls.range.controls.end.setValue(new Date(2026, 10, 2));
    submit(fixture);

    expect(store.apply).not.toHaveBeenCalled();
    expect(el.textContent).toContain('The last day cannot be before the first.');
  });

  it("shows the server's refusal inline and stays open (an overlap is a 409, no employee record a 400)", () => {
    store.apply.mockReturnValue(httpError(409, 'This employee already has a pending or approved leave request overlapping these dates'));
    const { fixture, form, el } = setup();

    form.controls.leaveTypeId.setValue('t-1');
    form.controls.range.controls.start.setValue(new Date(2026, 10, 2));
    form.controls.range.controls.end.setValue(new Date(2026, 10, 6));
    submit(fixture);

    expect(el.textContent).toContain('overlapping these dates');
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(submitButton(el).disabled).toBe(false);

    store.apply.mockReturnValue(httpError(400, 'No employee record linked to this account'));
    submit(fixture);
    expect(el.textContent).toContain('No employee record linked to this account');
  });

  describe('the leave type is MANDATORY, so a failed load BLOCKS the form', () => {
    it('shows the reason with a Retry, and disables Submit', () => {
      types.error.set('down');
      const { fixture, el } = setup();

      expect(el.textContent).toContain("Couldn't load leave types: down");
      expect(submitButton(el).disabled).toBe(true);

      types.refresh.mockClear();
      [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Retry'))!.click();
      fixture.detectChanges();
      expect(types.refresh).toHaveBeenCalledTimes(1);
    });

    it('disables Submit while the types are loading', () => {
      types.loading.set(true);
      const { el } = setup();

      expect(submitButton(el).disabled).toBe(true);
    });

    it('says so when there is no active type to choose', () => {
      types.active.set([]);
      const { el } = setup();

      expect(el.textContent).toContain('No leave types are available');
    });

    it('asks the directory to load when the dialog is opened before it has', () => {
      types.loaded.set(false);
      setup();

      expect(types.refresh).toHaveBeenCalledTimes(1);
    });
  });

  it('does NOT promise a day count - the server works it out only at approval', () => {
    const { el } = setup();

    expect(el.textContent).toContain('worked out when the request is approved');
    expect(el.textContent).not.toMatch(/\bdays? will be\b/i);
  });
});
