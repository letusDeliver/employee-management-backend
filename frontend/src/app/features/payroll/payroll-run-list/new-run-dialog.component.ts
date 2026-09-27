import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { serverToday } from '../../../shared/utils/server-day.util';
import { PayrollRun } from '../data-access/payroll.models';
import { MONTH_OPTIONS, defaultNewRunPeriod } from '../data-access/payroll-rules';
import { PayrollRunListStore } from '../data-access/payroll-run-list.store';

export interface NewRunDialogData {
  store: PayrollRunListStore;
}

/**
 * Creates a DRAFT run for one calendar month (ADR-PR05). Both fields are selects, so the form can only
 * hold values the backend accepts (month 1-12, a year in range); the only refusal left is a second
 * run for the same period (409), shown here with the backend's own message.
 *
 * Defaults to LAST month by the server's day: the usual case, and a month that has ended. Creating a
 * run only records the period - nothing is calculated until the run is processed.
 */
@Component({
  selector: 'app-new-run-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    InlineBannerComponent,
  ],
  templateUrl: './new-run-dialog.component.html',
  styleUrl: './new-run-dialog.component.scss',
})
export class NewRunDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<NewRunDialogComponent, PayrollRun>);
  private readonly data = inject<NewRunDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly months = MONTH_OPTIONS;
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  private readonly today = serverToday();
  private readonly initial = defaultNewRunPeriod(this.today);

  /** Last year, this year and next year - the server's years, like every other year choice. */
  protected readonly years = (() => {
    const current = Number(this.today.slice(0, 4));
    return [...new Set([current - 1, current, current + 1, this.initial.periodYear])].sort((a, b) => a - b);
  })();

  protected readonly form = this.formBuilder.nonNullable.group({
    periodMonth: [this.initial.periodMonth],
    periodYear: [this.initial.periodYear],
  });

  protected submit(): void {
    this.serverError.set(null);
    this.submitting.set(true);

    this.data.store
      .create(this.form.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (run) => {
          this.submitting.set(false);
          this.dialogRef.close(run);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.serverError.set(extractErrorMessage(error));
        },
      });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
