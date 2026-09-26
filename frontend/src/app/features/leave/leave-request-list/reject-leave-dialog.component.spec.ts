import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { LeaveRequest } from '../data-access/leave.models';
import { LeaveRequestStore } from '../data-access/leave-request.store';
import { RejectLeaveDialogComponent, RejectLeaveDialogData } from './reject-leave-dialog.component';

const pending: LeaveRequest = {
  id: 'r-1',
  employeeId: 'e-1',
  leaveTypeId: 't-1',
  startDate: '2026-11-02T00:00:00.000Z',
  endDate: '2026-11-06T00:00:00.000Z',
  reason: null,
  status: 'PENDING',
  durationDays: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('RejectLeaveDialogComponent', () => {
  const store = { reject: vi.fn() };
  const dialogRef = { close: vi.fn() };

  const setup = (): { fixture: ComponentFixture<RejectLeaveDialogComponent>; el: HTMLElement } => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { request: pending, summary: 'Amit Rao - Annual Leave, Nov 2 - Nov 6', store: store as unknown as LeaveRequestStore } satisfies RejectLeaveDialogData,
        },
      ],
    });
    const fixture = TestBed.createComponent(RejectLeaveDialogComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const type = (fixture: ComponentFixture<RejectLeaveDialogComponent>, value: string) => {
    const textarea = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = value;
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = (fixture: ComponentFixture<RejectLeaveDialogComponent>) => {
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    store.reject.mockReset();
    dialogRef.close.mockReset();
  });

  it('says what it is about and is honest that the reason goes to the audit log only', () => {
    const { el } = setup();

    expect(el.textContent).toContain('Amit Rao - Annual Leave, Nov 2 - Nov 6');
    expect(el.textContent).toContain('Recorded in the audit log only');
    expect(el.textContent).toContain('The employee is not shown it');
  });

  it('rejects with NO body when the reason is blank (the backend refuses an empty string)', () => {
    store.reject.mockReturnValue(of({ ...pending, status: 'REJECTED' }));
    const { fixture } = setup();

    type(fixture, '   ');
    submit(fixture);

    expect(store.reject).toHaveBeenCalledWith('r-1', {});
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('rejects with the trimmed reason', () => {
    store.reject.mockReturnValue(of({ ...pending, status: 'REJECTED' }));
    const { fixture } = setup();

    type(fixture, '  Insufficient coverage that week ');
    submit(fixture);

    expect(store.reject).toHaveBeenCalledWith('r-1', { reason: 'Insufficient coverage that week' });
  });

  it("shows the server's refusal inline and stays open (a 403 for a request that is not the caller's report, a 409 if already decided)", () => {
    store.reject.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, error: { status: 'error', message: 'You do not have permission to decide this leave request' } })),
    );
    const { fixture, el } = setup();

    submit(fixture);

    expect(el.textContent).toContain('You do not have permission to decide this leave request');
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect((el.querySelector('button[type=submit]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('closes without a request when cancelled', () => {
    const { el } = setup();

    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Cancel')!.click();

    expect(dialogRef.close).toHaveBeenCalledWith();
    expect(store.reject).not.toHaveBeenCalled();
  });
});
