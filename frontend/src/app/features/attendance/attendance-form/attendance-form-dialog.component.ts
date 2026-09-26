import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { startWith } from 'rxjs';

import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { parseDateOnly } from '../../../shared/utils/date-only.util';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { AttendanceRecord } from '../data-access/attendance.models';
import { AttendanceStore } from '../data-access/attendance.store';
import {
  buildAttendanceCreate,
  buildAttendanceUpdate,
  isCheckOutBeforeCheckIn,
  isPunchOnAnotherDay,
  toDateTimeLocal,
} from '../data-access/attendance-form';
import { recordDate, serverToday } from '../data-access/attendance-status';
import { EmployeePickerComponent } from '../employee-picker/employee-picker.component';

export interface AttendanceFormDialogData {
  /** `null` means create a record; a record means correct it. */
  record: AttendanceRecord | null;
  /**
   * Passed in, not injected: the store is provided by the list page component, and a dialog is
   * created from the root injector, which cannot see a component-scoped provider.
   */
  store: AttendanceStore;
}

/**
 * The backend refuses a checkout earlier than the check-in (equal is fine). It is a rule OF THE
 * CHECKOUT control, reading its sibling, not a group-level rule: a `mat-error` inside a form field
 * only renders while that field's own control is invalid, so a group error would never be shown.
 */
const checkOutAfterCheckIn = (control: AbstractControl): ValidationErrors | null =>
  isCheckOutBeforeCheckIn(control.parent?.get('checkIn')?.value ?? '', control.value ?? '')
    ? { checkOutBeforeCheckIn: true }
    : null;

/**
 * Create (`attendance:create:any`) and correct (`attendance:update:any`) an attendance record, one
 * dialog. Exactly as strict as the backend: a record date after the SERVER's (UTC) today and a
 * checkout before the check-in are blocked; a punch on another calendar day than the record (a
 * night shift) is only noted.
 *
 * A correction cannot change whose day it is - the employee and the date are shown, not edited (the
 * update endpoint has no such fields: a different employee or date is a different record). It sends
 * only what changed and, when nothing did, no request at all (a no-op PATCH still writes an audit
 * row). Clearing a punch sends `null`. A second record for the same employee and date is refused by
 * the backend (409); its message is shown here rather than pre-checked - the server is the only
 * authority on what already exists.
 */
@Component({
  selector: 'app-attendance-form-dialog',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    InlineBannerComponent,
    EmployeePickerComponent,
  ],
  templateUrl: './attendance-form-dialog.component.html',
  styleUrl: './attendance-form-dialog.component.scss',
})
export class AttendanceFormDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<AttendanceFormDialogComponent, AttendanceRecord>);
  protected readonly data = inject<AttendanceFormDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly directory = inject(EmployeeDirectoryService);

  protected readonly isEditMode = this.data.record !== null;
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  /** The latest date the backend accepts for a new record (see `isAfterServerToday`). */
  protected readonly maxDate = parseDateOnly(serverToday());

  protected readonly employeeLabel = this.data.record ? this.directory.labelOf(this.data.record.employeeId) : '';
  protected readonly editedDay = this.data.record ? recordDate(this.data.record.date) : null;

  protected readonly form = this.formBuilder.group({
    employeeId: [this.data.record?.employeeId ?? (null as string | null), this.isEditMode ? [] : [Validators.required]],
    date: [this.data.record ? recordDate(this.data.record.date) : (this.maxDate as Date | null), Validators.required],
    checkIn: [toDateTimeLocal(this.data.record?.checkIn ?? null)],
    checkOut: [toDateTimeLocal(this.data.record?.checkOut ?? null), checkOutAfterCheckIn],
    isHalfDay: [this.data.record?.isHalfDay ?? false],
  });

  constructor() {
    // Changing the check-in can make an already-typed checkout valid or invalid.
    this.form.controls.checkIn.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.checkOut.updateValueAndValidity());
  }

  // Signals over the two punches so the "another day" note reacts as the user types.
  private readonly punches = toSignal(this.form.valueChanges.pipe(startWith(this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  protected checkInOnAnotherDay(): boolean {
    const { date, checkIn } = this.punches();
    return date instanceof Date && isPunchOnAnotherDay(date, checkIn ?? '');
  }

  protected checkOutOnAnotherDay(): boolean {
    const { date, checkOut } = this.punches();
    return date instanceof Date && isPunchOnAnotherDay(date, checkOut ?? '');
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const original = this.data.record;

    if (original) {
      const changes = buildAttendanceUpdate(original, {
        checkIn: raw.checkIn ?? '',
        checkOut: raw.checkOut ?? '',
        isHalfDay: raw.isHalfDay ?? false,
      });

      if (Object.keys(changes).length === 0) {
        // Nothing changed - no request at all (a no-op PATCH would still write an audit row).
        this.dialogRef.close();
        return;
      }

      this.run(this.data.store.updateRecord(original.id, changes));
      return;
    }

    this.run(
      this.data.store.createRecord(
        buildAttendanceCreate({
          employeeId: raw.employeeId as string,
          date: raw.date as Date,
          checkIn: raw.checkIn ?? '',
          checkOut: raw.checkOut ?? '',
          isHalfDay: raw.isHalfDay ?? false,
        }),
      ),
    );
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  private run(result$: ReturnType<AttendanceStore['createRecord']>): void {
    this.serverError.set(null);
    this.submitting.set(true);

    result$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (record) => {
        this.submitting.set(false);
        this.dialogRef.close(record);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.serverError.set(extractErrorMessage(error));
      },
    });
  }
}
