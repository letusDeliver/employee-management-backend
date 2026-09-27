import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Observable } from 'rxjs';

import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { parseDateOnly } from '../../../shared/utils/date-only.util';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { notBlankValidator } from '../../../shared/validators/not-blank.validator';
import { CycleFormValue, buildCycleCreate, buildCycleUpdate, endNotBeforeStartValidator } from '../data-access/cycle-form';
import { ReviewCycle, ReviewCycleStatus } from '../data-access/performance.models';
import { ReviewCycleListStore } from '../data-access/review-cycle-list.store';

export interface ReviewCycleDialogData {
  /** `null` = create; a cycle = edit. */
  cycle: ReviewCycle | null;
  /** Passed in: the store is provided by the page, which a dialog's injector cannot see. */
  store: ReviewCycleListStore;
}

/**
 * Create + edit a review cycle. Exactly as strict as the backend: a non-blank name, both dates, the end
 * not before the start (the same day is fine). Status is editable only when editing - closing a cycle is
 * how one in use is retired (it can then no longer receive new reviews; existing ones are unaffected).
 * An edit sends only what changed, and nothing when nothing did.
 */
@Component({
  selector: 'app-review-cycle-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    InlineBannerComponent,
  ],
  templateUrl: './review-cycle-dialog.component.html',
  styleUrl: './review-cycle-dialog.component.scss',
})
export class ReviewCycleDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<ReviewCycleDialogComponent, ReviewCycle>);
  protected readonly data = inject<ReviewCycleDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly isEditMode = this.data.cycle !== null;
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.formBuilder.group({
    name: [this.data.cycle?.name ?? '', notBlankValidator],
    startDate: [this.data.cycle ? parseDateOnly(this.data.cycle.startDate) : (null as Date | null), Validators.required],
    endDate: [
      this.data.cycle ? parseDateOnly(this.data.cycle.endDate) : (null as Date | null),
      [Validators.required, endNotBeforeStartValidator],
    ],
    status: [this.data.cycle?.status ?? ('OPEN' as ReviewCycleStatus)],
  });

  ngOnInit(): void {
    // The end date's rule reads the start date - re-check it whenever the start changes.
    this.form.controls.startDate.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.form.controls.endDate.updateValueAndValidity({ emitEvent: false }));
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const value: CycleFormValue = {
      name: raw.name ?? '',
      startDate: raw.startDate as Date,
      endDate: raw.endDate as Date,
      status: raw.status ?? 'OPEN',
    };
    const original = this.data.cycle;

    if (original) {
      const changes = buildCycleUpdate(original, value);
      if (Object.keys(changes).length === 0) {
        this.dialogRef.close();
        return;
      }
      this.run(this.data.store.update(original.id, changes));
      return;
    }

    this.run(this.data.store.create(buildCycleCreate(value)));
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  private run(result$: Observable<ReviewCycle>): void {
    this.serverError.set(null);
    this.submitting.set(true);

    result$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (cycle) => {
        this.submitting.set(false);
        this.dialogRef.close(cycle);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.serverError.set(extractErrorMessage(error));
      },
    });
  }
}
