import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { defaultNewRunPeriod } from '../data-access/payroll-rules';
import { run } from '../data-access/payroll.testing';
import { serverToday } from '../../../shared/utils/server-day.util';
import { NewRunDialogComponent } from './new-run-dialog.component';

describe('NewRunDialogComponent', () => {
  const store = { create: vi.fn() };
  const dialogRef = { close: vi.fn() };

  const setup = () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { store } },
      ],
    });
    const fixture = TestBed.createComponent(NewRunDialogComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };
  const submit = (fixture: ReturnType<typeof setup>['fixture']) => {
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    store.create.mockReset();
    dialogRef.close.mockReset();
  });

  it("defaults to LAST month by the server's day and submits exactly {periodMonth, periodYear}", () => {
    store.create.mockReturnValue(of(run({ id: 'new' })));
    const { fixture } = setup();

    submit(fixture);

    expect(store.create).toHaveBeenCalledWith(defaultNewRunPeriod(serverToday()));
    expect(dialogRef.close).toHaveBeenCalledWith(run({ id: 'new' }));
  });

  it('offers the twelve months by name (the options exist only once the select is opened)', () => {
    const { fixture, el } = setup();

    el.querySelector<HTMLElement>('mat-select[formcontrolname=periodMonth] .mat-mdc-select-trigger')!.click();
    fixture.detectChanges();

    const options = [...document.querySelectorAll('mat-option')].map((option) => option.textContent?.trim());
    expect(options).toHaveLength(12);
    expect(options[0]).toBe('January');
    expect(options[7]).toBe('August');
    expect(options[11]).toBe('December');
  });

  it('keeps the dialog open and shows the backend message on a duplicate period (409)', () => {
    store.create.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { status: 'error', message: 'A payroll run already exists for this period' } })),
    );
    const { fixture, el } = setup();

    submit(fixture);

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(el.querySelector('app-inline-banner')?.textContent).toContain('A payroll run already exists for this period');
    expect((el.querySelector('button[type=submit]') as HTMLButtonElement).disabled).toBe(false);
  });
});
