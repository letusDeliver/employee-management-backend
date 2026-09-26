import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { LeaveTypeDirectoryService } from '../../../core/master-data-directory/leave-type-directory.service';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { LeaveRequest } from '../data-access/leave.models';
import { buildLeaveCreate } from '../data-access/leave-form';
import { MyLeaveStore } from '../data-access/my-leave.store';

export interface ApplyLeaveDialogData {
  /**
   * Passed in, not injected: the store is provided by the page component, and a dialog is created
   * from the root injector, which cannot see a component-scoped provider.
   */
  store: MyLeaveStore;
}

/**
 * Apply for leave: an ACTIVE leave type, a date range and an optional reason. The leave type is a
 * MANDATORY field, so - unlike a display-only name - a failed load of the types BLOCKS the form with
 * a Retry rather than degrading. Exactly as strict as the backend: a single-day range is fine, and a
 * start in the past is allowed (the backend does not refuse it). An overlap with another pending or
 * approved request, an inactive type and an account with no employee record are the server's to
 * refuse (409 / 400); its message is shown inline, not pre-checked.
 *
 * The number of days is NOT shown: it is worked out by the server only when the request is approved
 * (holidays and week-offs excluded), and a client-side estimate would duplicate a rule that must live
 * in one place.
 */
@Component({
  selector: 'app-apply-leave-dialog',
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
  templateUrl: './apply-leave-dialog.component.html',
  styleUrl: './apply-leave-dialog.component.scss',
})
export class ApplyLeaveDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ApplyLeaveDialogComponent, LeaveRequest>);
  protected readonly data = inject<ApplyLeaveDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly leaveTypes = inject(LeaveTypeDirectoryService);

  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.formBuilder.group({
    leaveTypeId: [null as string | null, Validators.required],
    range: this.formBuilder.group({
      start: [null as Date | null, Validators.required],
      end: [null as Date | null, Validators.required],
    }),
    reason: [''],
  });

  protected readonly options = computed(() => this.leaveTypes.active());

  /** The form cannot be completed until the types are known. */
  protected typesUnavailable(): boolean {
    return this.leaveTypes.loading() || this.leaveTypes.error() !== null;
  }

  constructor() {
    // The page loads the directory on entry; make sure it is loaded if the dialog was opened first.
    if (!this.leaveTypes.loaded() && !this.leaveTypes.loading()) {
      this.retryTypes();
    }
  }

  protected retryTypes(): void {
    this.leaveTypes.refresh().subscribe({ error: () => undefined });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();

    this.serverError.set(null);
    this.submitting.set(true);

    this.data.store
      .apply(
        buildLeaveCreate({
          leaveTypeId: raw.leaveTypeId as string,
          start: raw.range.start as Date,
          end: raw.range.end as Date,
          reason: raw.reason ?? '',
        }),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (request) => {
          this.submitting.set(false);
          this.dialogRef.close(request);
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
