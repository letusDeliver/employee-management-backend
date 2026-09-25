import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { parseDateOnly } from '../../../shared/utils/date-only.util';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { notBlankValidator } from '../../../shared/validators/not-blank.validator';
import { Holiday } from '../data-access/holiday-calendar.models';
import { HolidayListStore } from '../data-access/holiday-list.store';
import { buildHolidayCreate, buildHolidayUpdate } from '../data-access/holiday-update';

export interface HolidayFormDialogData {
  /** `null` means add; a holiday means edit. */
  holiday: Holiday | null;
  /**
   * Passed in, not injected: the store is provided by the detail page component, and a dialog is
   * created from the root injector, which cannot see a component-scoped provider.
   */
  store: HolidayListStore;
}

/**
 * Add + edit a holiday, one dialog. The date is a calendar date: the picker works in local
 * midnight `Date`s, and only `YYYY-MM-DD` (built from local parts) ever reaches the API - see
 * `shared/utils/date-only.util.ts`. A second holiday on the same date of the same calendar is
 * refused by the backend (409); its message is shown here rather than pre-checked, because the
 * server is the only authority on what already exists.
 */
@Component({
  selector: 'app-holiday-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    InlineBannerComponent,
  ],
  templateUrl: './holiday-form-dialog.component.html',
  styleUrl: './holiday-form-dialog.component.scss',
})
export class HolidayFormDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<HolidayFormDialogComponent, Holiday>);
  protected readonly data = inject<HolidayFormDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly isEditMode = this.data.holiday !== null;
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  /**
   * A new holiday's picker opens on the year being looked at, not on today's month - adding
   * next year's dates from the 2027 view should not start in 2026.
   */
  protected readonly pickerStart: Date | null = (() => {
    if (this.data.holiday) {
      return null;
    }
    const year = this.data.store.selectedYear();
    return year === 'ALL' ? null : new Date(year, 0, 1);
  })();

  protected readonly form = this.formBuilder.group({
    date: [this.data.holiday ? parseDateOnly(this.data.holiday.date) : (null as Date | null), Validators.required],
    name: [this.data.holiday?.name ?? '', notBlankValidator],
    isOptional: [this.data.holiday?.isOptional ?? false],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const value = { date: raw.date as Date, name: raw.name ?? '', isOptional: raw.isOptional ?? false };
    const original = this.data.holiday;

    if (original) {
      const changes = buildHolidayUpdate(original, value);
      if (Object.keys(changes).length === 0) {
        // Nothing changed - no request at all (a no-op PATCH would still write an audit row).
        this.dialogRef.close();
        return;
      }
      this.run(this.data.store.updateHoliday(original.id, changes));
      return;
    }

    this.run(this.data.store.addHoliday(buildHolidayCreate(value)));
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  private run(result$: ReturnType<HolidayListStore['addHoliday']>): void {
    this.serverError.set(null);
    this.submitting.set(true);

    result$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (holiday) => {
        this.submitting.set(false);
        this.dialogRef.close(holiday);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.serverError.set(extractErrorMessage(error));
      },
    });
  }
}
