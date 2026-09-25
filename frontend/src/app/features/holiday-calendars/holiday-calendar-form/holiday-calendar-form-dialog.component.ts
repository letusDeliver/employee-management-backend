import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { MasterDataStatus } from '../../../shared/master-data/master-data.models';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { notBlankValidator } from '../../../shared/validators/not-blank.validator';
import { HolidayCalendar, UpdateHolidayCalendarRequest } from '../data-access/holiday-calendar.models';
import { HolidayCalendarStore } from '../data-access/holiday-calendar.store';

export interface HolidayCalendarFormDialogData {
  /** `null` means create; a calendar means edit. */
  calendar: HolidayCalendar | null;
}

/**
 * Create + edit, one dialog. The calendar's own rather than the shared master-data dialog: it has
 * no `code`. A calendar is only a NAME plus a status - its dates are managed on its own page.
 *
 * Status is editable only when editing: a new calendar is always created ACTIVE server-side, and
 * deactivating is the retirement path for one that branches use (it can never be hard-deleted
 * while any branch references it). Deactivating does not touch existing branches - it only stops
 * the calendar being offered to new ones.
 */
@Component({
  selector: 'app-holiday-calendar-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    InlineBannerComponent,
  ],
  templateUrl: './holiday-calendar-form-dialog.component.html',
  styleUrl: './holiday-calendar-form-dialog.component.scss',
})
export class HolidayCalendarFormDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<HolidayCalendarFormDialogComponent, HolidayCalendar>);
  protected readonly data = inject<HolidayCalendarFormDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly store = inject(HolidayCalendarStore);

  protected readonly isEditMode = this.data.calendar !== null;
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    name: [this.data.calendar?.name ?? '', notBlankValidator],
    status: [this.data.calendar?.status ?? ('ACTIVE' as MasterDataStatus)],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const name = raw.name.trim();
    const original = this.data.calendar;

    if (original) {
      // Only what changed: a no-op PATCH would still write an audit row and bump `updatedAt`.
      const changes: UpdateHolidayCalendarRequest = {};
      if (name !== original.name) {
        changes.name = name;
      }
      if (raw.status !== original.status) {
        changes.status = raw.status;
      }
      if (Object.keys(changes).length === 0) {
        this.dialogRef.close();
        return;
      }
      this.run(this.store.updateRecord(original.id, changes));
      return;
    }

    this.run(this.store.createRecord({ name }));
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  private run(result$: ReturnType<HolidayCalendarStore['createRecord']>): void {
    this.serverError.set(null);
    this.submitting.set(true);

    result$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (calendar) => {
        this.submitting.set(false);
        this.dialogRef.close(calendar);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.serverError.set(extractErrorMessage(error));
      },
    });
  }
}
