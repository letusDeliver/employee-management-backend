import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNativeDateAdapter } from '@angular/material/core';
import { of, throwError } from 'rxjs';

import { ReviewCycle } from '../data-access/performance.models';
import { cycle } from '../data-access/performance.testing';
import { ReviewCycleDialogComponent } from './review-cycle-dialog.component';

describe('ReviewCycleDialogComponent', () => {
  const store = { create: vi.fn(), update: vi.fn() };
  const dialogRef = { close: vi.fn() };

  const setup = (existing: ReviewCycle | null) => {
    TestBed.configureTestingModule({
      providers: [
        provideNativeDateAdapter(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { cycle: existing, store } },
      ],
    });
    const fixture = TestBed.createComponent(ReviewCycleDialogComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as { form: { controls: Record<string, { setValue: (v: unknown) => void }> } };
    const submit = () => {
      (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
    };
    return { fixture, el: fixture.nativeElement as HTMLElement, controls: component.form.controls, submit };
  };

  beforeEach(() => {
    store.create.mockReset();
    store.update.mockReset();
    dialogRef.close.mockReset();
  });

  it('creates with local calendar dates and no status field', () => {
    store.create.mockReturnValue(of(cycle()));
    const { el, controls, submit } = setup(null);
    expect(el.querySelector('mat-select[formcontrolname=status]')).toBeNull();

    controls['name'].setValue(' H1 2026 ');
    controls['startDate'].setValue(new Date(2026, 0, 1));
    controls['endDate'].setValue(new Date(2026, 5, 30));
    submit();

    expect(store.create).toHaveBeenCalledWith({ name: 'H1 2026', startDate: '2026-01-01', endDate: '2026-06-30' });
  });

  it('shows "Must not be before the start" on the END field and sends nothing', () => {
    const { el, controls, submit } = setup(null);
    controls['name'].setValue('H1');
    controls['startDate'].setValue(new Date(2026, 5, 30));
    controls['endDate'].setValue(new Date(2026, 0, 1));
    submit();

    expect(el.textContent).toContain('Must not be before the start.');
    expect(store.create).not.toHaveBeenCalled();
  });

  it('an edit sends only the status when only the status changed, and nothing when nothing did', () => {
    store.update.mockReturnValue(of(cycle({ status: 'CLOSED' })));
    const first = setup(cycle());
    first.submit();
    expect(store.update).not.toHaveBeenCalled();
    expect(dialogRef.close).toHaveBeenCalled();

    TestBed.resetTestingModule();
    const second = setup(cycle());
    second.controls['status'].setValue('CLOSED');
    second.submit();
    expect(store.update).toHaveBeenCalledWith('c-1', { status: 'CLOSED' });
  });

  it("keeps the dialog open and shows the backend's message (a duplicate name ignoring case)", () => {
    store.create.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { status: 'error', message: 'A review cycle with this name already exists' } })),
    );
    const { el, controls, submit } = setup(null);
    controls['name'].setValue('h1 2026');
    controls['startDate'].setValue(new Date(2026, 0, 1));
    controls['endDate'].setValue(new Date(2026, 5, 30));
    submit();

    expect(el.textContent).toContain('A review cycle with this name already exists');
    expect(dialogRef.close).not.toHaveBeenCalled();
  });
});
