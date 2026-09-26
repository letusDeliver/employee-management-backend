import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { LeaveType } from '../data-access/leave.models';
import { LeaveTypeStore } from '../data-access/leave-type.store';
import { LeaveTypeFormDialogComponent, LeaveTypeFormDialogData } from './leave-type-form-dialog.component';

const existing: LeaveType = {
  id: 't-1',
  name: 'Annual Leave',
  defaultAnnualEntitlement: 18,
  isPaid: true,
  status: 'ACTIVE',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('LeaveTypeFormDialogComponent', () => {
  const store = { createRecord: vi.fn(), updateRecord: vi.fn() };
  const dialogRef = { close: vi.fn() };

  const setup = (leaveType: LeaveType | null): { fixture: ComponentFixture<LeaveTypeFormDialogComponent>; el: HTMLElement } => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: LeaveTypeStore, useValue: store },
        { provide: MAT_DIALOG_DATA, useValue: { leaveType } satisfies LeaveTypeFormDialogData },
      ],
    });
    const fixture = TestBed.createComponent(LeaveTypeFormDialogComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const type = (fixture: ComponentFixture<LeaveTypeFormDialogComponent>, control: string, value: string) => {
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`input[formcontrolname=${control}]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = (fixture: ComponentFixture<LeaveTypeFormDialogComponent>) => {
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };
  const submitButton = (el: HTMLElement) => el.querySelector('button[type=submit]') as HTMLButtonElement;

  beforeEach(() => {
    store.createRecord.mockReset();
    store.updateRecord.mockReset();
    dialogRef.close.mockReset();
  });

  describe('create mode', () => {
    it('starts empty, paid, with no status field (a new type is always ACTIVE)', () => {
      const { el } = setup(null);

      expect(el.querySelector('h2')?.textContent).toContain('New Leave Type');
      expect(el.querySelector<HTMLInputElement>('input[formcontrolname=name]')!.value).toBe('');
      expect(el.querySelector('mat-checkbox')?.classList.contains('mat-mdc-checkbox-checked')).toBe(true);
      expect(el.textContent).not.toContain('Status');
      expect(submitButton(el).textContent).toContain('Create Leave Type');
    });

    it('blocks a blank name and a non-whole-day entitlement, with a message and a disabled submit', () => {
      const { fixture, el } = setup(null);

      submit(fixture);

      expect(store.createRecord).not.toHaveBeenCalled();
      expect(el.textContent).toContain('Leave type name is required.');
      expect(el.textContent).toContain('Enter a whole number of days from 1 to 365.');
      expect(submitButton(el).disabled).toBe(true);
    });

    it.for(['0', '366', '1.5', '-3', 'abc'])('refuses %j days', (days) => {
      const { fixture } = setup(null);
      type(fixture, 'name', 'Sick Leave');
      type(fixture, 'defaultAnnualEntitlement', days);

      submit(fixture);

      expect(store.createRecord).not.toHaveBeenCalled();
    });

    it('creates with a trimmed name, the entitlement as a number and the paid flag', () => {
      store.createRecord.mockReturnValue(of(existing));
      const { fixture } = setup(null);

      type(fixture, 'name', '  Sick Leave ');
      type(fixture, 'defaultAnnualEntitlement', '10');
      submit(fixture);

      expect(store.createRecord).toHaveBeenCalledWith({ name: 'Sick Leave', defaultAnnualEntitlement: 10, isPaid: true });
      expect(dialogRef.close).toHaveBeenCalledWith(existing);
    });

    it("shows the server's message and stays open when the create is refused (a duplicate name is a 409)", () => {
      store.createRecord.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 409, error: { status: 'error', message: 'A leave type with this name already exists' } })),
      );
      const { fixture, el } = setup(null);

      type(fixture, 'name', 'Annual Leave');
      type(fixture, 'defaultAnnualEntitlement', '18');
      submit(fixture);

      expect(el.textContent).toContain('A leave type with this name already exists');
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(submitButton(el).disabled).toBe(false);
    });
  });

  describe('edit mode', () => {
    it('is pre-filled and offers the status', () => {
      const { el } = setup(existing);

      expect(el.querySelector('h2')?.textContent).toContain('Edit Leave Type');
      expect(el.querySelector<HTMLInputElement>('input[formcontrolname=name]')!.value).toBe('Annual Leave');
      expect(el.querySelector<HTMLInputElement>('input[formcontrolname=defaultAnnualEntitlement]')!.value).toBe('18');
      expect(el.textContent).toContain('Status');
      expect(submitButton(el).textContent).toContain('Save Changes');
    });

    it('sends NO request when nothing changed', () => {
      const { fixture } = setup(existing);

      submit(fixture);

      expect(store.updateRecord).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });

    it('sends only the field that changed', () => {
      store.updateRecord.mockReturnValue(of(existing));
      const { fixture } = setup(existing);

      type(fixture, 'defaultAnnualEntitlement', '20');
      submit(fixture);

      expect(store.updateRecord).toHaveBeenCalledWith('t-1', { defaultAnnualEntitlement: 20 });
    });
  });
});
