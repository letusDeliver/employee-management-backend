import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { EmployeePickerComponent } from '../../../shared/components/employee-picker/employee-picker.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { CreatePerformanceReviewRequest, PerformanceReview } from '../data-access/performance.models';
import { ReviewContext } from '../data-access/review-context';
import { ReviewCycleLookup } from '../data-access/review-cycle-lookup';
import { ReviewLedgerStore } from '../data-access/review-ledger.store';
import { cycleDateRange } from '../data-access/review-rules';

export interface NewReviewDialogData {
  store: ReviewLedgerStore;
  /** `performanceReview:create:any` (ADMIN). Without it the caller may review only their direct reports. */
  createAny: boolean;
}

/**
 * Starts a DRAFT review. Exactly as strict as the backend:
 * - only OPEN cycles are offered (creating in a closed one is a 400);
 * - a MANAGER is offered only their DIRECT REPORTS (anyone else is a 403) - the reviewer is then always
 *   themselves, so no reviewer field is shown;
 * - an ADMIN may pick anyone; the reviewer is that employee's manager, and only when the employee HAS no
 *   manager does a required Reviewer field appear (the backend's 400 otherwise).
 * A duplicate (one review per employee per cycle) is the backend's 409, shown inline.
 */
@Component({
  selector: 'app-new-review-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    EmployeePickerComponent,
    InlineBannerComponent,
  ],
  templateUrl: './new-review-dialog.component.html',
  styleUrl: './new-review-dialog.component.scss',
})
export class NewReviewDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<NewReviewDialogComponent, PerformanceReview>);
  protected readonly data = inject<NewReviewDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly cycles = inject(ReviewCycleLookup);
  protected readonly directory = inject(EmployeeDirectoryService);
  /** The caller's own employee id (a MANAGER's reports are the employees whose manager this is), read live. */
  protected readonly context = inject(ReviewContext);

  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.formBuilder.group({
    reviewCycleId: ['', Validators.required],
    employeeId: [null as string | null, Validators.required],
    reviewerId: [null as string | null],
  });

  private readonly employeeId = toSignal(this.form.controls.employeeId.valueChanges, { initialValue: null });

  /** A MANAGER sees only their direct reports; an ADMIN everyone (no narrowing). */
  protected readonly include: ((employeeId: string) => boolean) | null = this.data.createAny
    ? null
    : (id) => {
        const own = this.context.ownEmployeeId();
        return own !== null && this.directory.managerIdOf(id) === own;
      };

  /** ADMIN only, and only for an employee with no manager - then the backend requires a reviewer. */
  protected readonly needsReviewer = computed(() => {
    const id = this.employeeId();
    return this.data.createAny && id !== null && this.directory.managerIdOf(id) === null;
  });

  /** A MANAGER with nobody reporting to them cannot start a review at all - say so instead of an empty list. */
  protected readonly hasNoReports = computed(
    () =>
      !this.data.createAny &&
      this.context.ownState() === 'known' &&
      this.directory.loaded() &&
      !this.directory.entries().some((entry) => this.include?.(entry.id)),
  );

  /** Without their own record a MANAGER's reports cannot be worked out - block rather than guess. */
  protected readonly ownUnknown = computed(() => !this.data.createAny && this.context.ownState() === 'failed');

  protected readonly dateRange = cycleDateRange;

  ngOnInit(): void {
    this.cycles.refresh().subscribe({ error: () => undefined });
    this.directory.refresh().subscribe({ error: () => undefined });

    // The Reviewer picker is rendered only while `needsReviewer()`, and its `[required]` binding brings
    // Angular's own RequiredValidator directive with it (removed again when the field goes away) - so the
    // template alone makes it required exactly when the backend does. Here only a no-longer-needed choice
    // is cleared, so it is never sent.
    this.form.controls.employeeId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.needsReviewer()) {
        this.form.controls.reviewerId.setValue(null, { emitEvent: false });
      }
    });
  }

  protected retryCycles(): void {
    this.cycles.refresh().subscribe({ error: () => undefined });
  }

  protected retryOwn(): void {
    this.context.load().subscribe();
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const request: CreatePerformanceReviewRequest = { employeeId: raw.employeeId as string, reviewCycleId: raw.reviewCycleId ?? '' };
    if (this.needsReviewer() && raw.reviewerId) {
      request.reviewerId = raw.reviewerId;
    }

    this.serverError.set(null);
    this.submitting.set(true);
    this.data.store
      .create(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (review) => {
          this.submitting.set(false);
          this.dialogRef.close(review);
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
