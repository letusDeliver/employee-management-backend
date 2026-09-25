import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { map } from 'rxjs';

import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { MasterDataStatus } from '../../../shared/master-data/master-data.models';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { notBlankValidator } from '../../../shared/validators/not-blank.validator';
import { Shift, WEEKDAYS, Weekday } from '../data-access/shift.models';
import { ShiftStore } from '../data-access/shift.store';
import { WEEKDAY_LABELS, isOvernight } from '../data-access/shift-schedule';
import { buildShiftCreate, buildShiftUpdate } from '../data-access/shift-update';

export interface ShiftFormDialogData {
  /** `null` means create; a shift means edit. */
  shift: Shift | null;
}

// A new shift starts from the most common pattern so the form is one field away from valid;
// every value is visible and editable, nothing is applied behind the user's back.
const DEFAULT_START = '09:00';
const DEFAULT_END = '18:00';
const DEFAULT_DAYS: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

/**
 * Create + edit, one dialog. Shift's own rather than the shared master-data dialog: it has
 * no `code`, and it edits two times and a set of weekdays. Times use the native
 * `<input type="time">` - its value is already the wire format (`"HH:mm"`), so there is no
 * `Date` round-trip and no timezone to get wrong.
 *
 * Status is editable only when editing: a new shift is always created ACTIVE server-side,
 * and deactivating is the retirement path for one that has ever been assigned (it can
 * never be hard-deleted once any employee references it).
 */
@Component({
  selector: 'app-shift-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    InlineBannerComponent,
  ],
  templateUrl: './shift-form-dialog.component.html',
  styleUrl: './shift-form-dialog.component.scss',
})
export class ShiftFormDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ShiftFormDialogComponent, Shift>);
  protected readonly data = inject<ShiftFormDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly store = inject(ShiftStore);

  protected readonly weekdays = WEEKDAYS.map((value) => ({ value, ...WEEKDAY_LABELS[value] }));
  protected readonly isEditMode = this.data.shift !== null;
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    name: [this.data.shift?.name ?? '', notBlankValidator],
    startTime: [this.data.shift?.startTime ?? DEFAULT_START, Validators.required],
    endTime: [this.data.shift?.endTime ?? DEFAULT_END, Validators.required],
    workingDays: [this.data.shift?.workingDays ?? DEFAULT_DAYS, Validators.required],
    status: [this.data.shift?.status ?? ('ACTIVE' as MasterDataStatus)],
  });

  private readonly times = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  /**
   * Tells the user what their times MEAN without ever blocking them: the backend accepts
   * both cases (an overnight shift is valid - ADR-SH03 - and so is a zero-length one).
   */
  protected readonly scheduleHint = computed(() => {
    const { startTime, endTime } = this.times();
    if (!startTime || !endTime) {
      return null;
    }
    if (isOvernight(startTime, endTime)) {
      return 'This shift ends the next day. It counts as belonging to the day it starts on.';
    }
    if (startTime === endTime) {
      return 'Start and end are the same time, so this shift has no length. Check this is intended.';
    }
    return null;
  });

  // A method, not a `computed()`: `invalid`/`touched` are plain properties on the form
  // control, not signals, so a computed would cache its first value forever.
  protected showDaysError(): boolean {
    const control = this.form.controls.workingDays;
    return control.invalid && control.touched;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const original = this.data.shift;

    if (original) {
      const changes = buildShiftUpdate(original, raw);
      if (Object.keys(changes).length === 0) {
        // Nothing changed - no request at all (a no-op PATCH would still write an audit row).
        this.dialogRef.close();
        return;
      }
      this.run(this.store.updateRecord(original.id, changes));
      return;
    }

    this.run(this.store.createRecord(buildShiftCreate(raw)));
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  private run(result$: ReturnType<ShiftStore['createRecord']>): void {
    this.serverError.set(null);
    this.submitting.set(true);

    result$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (shift) => {
        this.submitting.set(false);
        this.dialogRef.close(shift);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.serverError.set(extractErrorMessage(error));
      },
    });
  }
}
