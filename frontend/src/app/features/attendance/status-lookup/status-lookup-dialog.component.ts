import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { finalize } from 'rxjs';

import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { formatDateOnly, parseDateOnly } from '../../../shared/utils/date-only.util';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { AttendanceStatusBadgeComponent } from '../attendance-status-badge/attendance-status-badge.component';
import { EffectiveStatusResult } from '../data-access/attendance.models';
import { AttendanceService } from '../data-access/attendance.service';
import { STATUS_META, punchLabel, serverToday, workedDuration } from '../data-access/attendance-status';
import { EmployeePickerComponent } from '../employee-picker/employee-picker.component';

/**
 * "What was this employee's status on this day?" - `GET /attendance/effective-status` for any
 * employee (`attendance:read:any`). The records list only shows days that HAVE a record; this is the
 * one place a HOLIDAY, WEEK_OFF, ON_LEAVE or a plain ABSENT day (no record at all) can be seen,
 * because the status is computed on read from Attendance + Leave + Holiday Calendar + Shift (ADR-AT03).
 *
 * Any date may be asked about, future ones included (the backend just answers). The result is shown
 * inline, so an error never needs a second toast. On a holiday / week-off / leave day the backend
 * returns no record even if one exists; the note says so instead of implying there are no punches.
 */
@Component({
  selector: 'app-status-lookup-dialog',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    InlineBannerComponent,
    AttendanceStatusBadgeComponent,
    EmployeePickerComponent,
  ],
  templateUrl: './status-lookup-dialog.component.html',
  styleUrl: './status-lookup-dialog.component.scss',
})
export class StatusLookupDialogComponent {
  private readonly api = inject(AttendanceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<EffectiveStatusResult | null>(null);

  protected readonly form = this.formBuilder.group({
    employeeId: [null as string | null, Validators.required],
    date: [parseDateOnly(serverToday()) as Date | null, Validators.required],
  });

  protected readonly resultDay = computed(() => {
    const result = this.result();
    return result ? parseDateOnly(result.date) : null;
  });

  protected readonly explanation = computed(() => {
    const result = this.result();
    return result ? STATUS_META[result.status].explanation : '';
  });

  /** True on the three days the backend answers before it looks a record up. */
  protected readonly recordHidden = computed(() => {
    const status = this.result()?.status;
    return status === 'HOLIDAY' || status === 'WEEK_OFF' || status === 'ON_LEAVE';
  });

  protected readonly checkIn = computed(() => this.punch(this.result()?.record?.checkIn ?? null));
  protected readonly checkOut = computed(() => this.punch(this.result()?.record?.checkOut ?? null));
  protected readonly worked = computed(() => {
    const record = this.result()?.record;
    return record ? workedDuration(record.checkIn, record.checkOut) : null;
  });

  protected check(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { employeeId, date } = this.form.getRawValue();

    this.error.set(null);
    this.result.set(null);
    this.loading.set(true);

    this.api
      .effectiveStatus(formatDateOnly(date as Date), employeeId as string)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (result) => this.result.set(result),
        error: (error: unknown) => this.error.set(extractErrorMessage(error)),
      });
  }

  private punch(instant: string | null): string {
    const result = this.result();
    return result ? punchLabel(instant, result.date) : '—';
  }
}
