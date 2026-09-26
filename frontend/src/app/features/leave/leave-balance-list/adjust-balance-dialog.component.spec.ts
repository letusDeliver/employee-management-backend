import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { LeaveBalance } from '../data-access/leave.models';
import { LeaveBalanceStore } from '../data-access/leave-balance.store';
import { AdjustBalanceDialogComponent, AdjustBalanceDialogData } from './adjust-balance-dialog.component';

const balance: LeaveBalance = {
  id: 'b-1',
  employeeId: 'e-1',
  leaveTypeId: 't-1',
  year: 2026,
  entitlement: 10,
  consumed: 4,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('AdjustBalanceDialogComponent', () => {
  const store = { adjust: vi.fn() };
  const dialogRef = { close: vi.fn() };

  const setup = (): { fixture: ComponentFixture<AdjustBalanceDialogComponent>; el: HTMLElement } => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { balance, summary: 'Amit Rao - Annual Leave 2026', store: store as unknown as LeaveBalanceStore } satisfies AdjustBalanceDialogData,
        },
      ],
    });
    const fixture = TestBed.createComponent(AdjustBalanceDialogComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const type = (fixture: ComponentFixture<AdjustBalanceDialogComponent>, control: string, value: string) => {
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`input[formcontrolname=${control}]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = (fixture: ComponentFixture<AdjustBalanceDialogComponent>) => {
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };
  const submitButton = (el: HTMLElement) => el.querySelector('button[type=submit]') as HTMLButtonElement;

  beforeEach(() => {
    store.adjust.mockReset();
    dialogRef.close.mockReset();
  });

  it('is pre-filled with the current numbers, says what it is about, and says it is audit-logged', () => {
    const { el } = setup();

    expect(el.textContent).toContain('Amit Rao - Annual Leave 2026');
    expect(el.textContent).toContain('recorded in the audit log');
    expect(el.querySelector<HTMLInputElement>('input[formcontrolname=entitlement]')!.value).toBe('10');
    expect(el.querySelector<HTMLInputElement>('input[formcontrolname=consumed]')!.value).toBe('4');
  });

  it('uses text inputs with a decimal keypad, not type=number (which silently reports an empty value)', () => {
    const { el } = setup();

    for (const control of ['entitlement', 'consumed']) {
      const input = el.querySelector<HTMLInputElement>(`input[formcontrolname=${control}]`)!;
      expect(input.type).toBe('text');
      expect(input.getAttribute('inputmode')).toBe('decimal');
    }
  });

  it('sends NO request when nothing changed - even if the text was retyped the same way ("10.0" is 10)', () => {
    const { fixture } = setup();

    type(fixture, 'entitlement', '10.0');
    submit(fixture);

    expect(store.adjust).not.toHaveBeenCalled();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });

  it('sends ONLY the field that changed', () => {
    store.adjust.mockReturnValue(of({ ...balance, consumed: 3 }));
    const { fixture } = setup();

    type(fixture, 'consumed', '3');
    submit(fixture);

    expect(store.adjust).toHaveBeenCalledWith('b-1', { consumed: 3 });
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it.for(['', 'abc', '-1', '1,5', '1e3'])('refuses %j, with a message and a disabled submit', (text) => {
    const { fixture, el } = setup();

    type(fixture, 'entitlement', text);
    submit(fixture);

    expect(store.adjust).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Enter a number of days, 0 or more.');
    expect(submitButton(el).disabled).toBe(true);
  });

  it('WARNS - and does not block - when more is marked used than granted (the admin override allows it)', () => {
    store.adjust.mockReturnValue(of(balance));
    const { fixture, el } = setup();

    expect(el.textContent).not.toContain('would be negative');
    type(fixture, 'consumed', '12');

    expect(el.textContent).toContain('the balance would be negative');
    expect(submitButton(el).disabled).toBe(false);

    submit(fixture);
    expect(store.adjust).toHaveBeenCalledWith('b-1', { consumed: 12 });
  });

  it("shows the server's refusal inline and stays open", () => {
    store.adjust.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, error: { status: 'error', message: 'You do not have permission to perform this action' } })),
    );
    const { fixture, el } = setup();

    type(fixture, 'entitlement', '12');
    submit(fixture);

    expect(el.textContent).toContain('You do not have permission to perform this action');
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(submitButton(el).disabled).toBe(false);
  });
});
