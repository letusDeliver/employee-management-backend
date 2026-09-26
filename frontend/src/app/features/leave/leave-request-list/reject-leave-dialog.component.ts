import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { LeaveRequest } from '../data-access/leave.models';
import { LeaveRequestStore } from '../data-access/leave-request.store';

export interface RejectLeaveDialogData {
  request: LeaveRequest;
  /** What the dialog says it is about, e.g. "Amit Rao - Annual Leave, Nov 2, 2026 - Nov 6, 2026". */
  summary: string;
  /**
   * Passed in, not injected: the store is provided by the page component, and a dialog is created
   * from the root injector, which cannot see a component-scoped provider.
   */
  store: LeaveRequestStore;
}

/**
 * Reject a pending request with an OPTIONAL reason. The reason is honest about where it goes: the
 * backend records it in the audit log only - the request row does not store it, so the applicant
 * never sees it - and the dialog says so rather than implying the employee will be told. A blank
 * reason is omitted (the backend refuses an empty string). The server's refusal (403 for a request
 * that is not the caller's report, 409 for one already decided) is shown inline.
 */
@Component({
  selector: 'app-reject-leave-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    InlineBannerComponent,
  ],
  templateUrl: './reject-leave-dialog.component.html',
  styleUrl: './reject-leave-dialog.component.scss',
})
export class RejectLeaveDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<RejectLeaveDialogComponent, LeaveRequest>);
  protected readonly data = inject<RejectLeaveDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({ reason: [''] });

  protected submit(): void {
    const reason = this.form.controls.reason.value.trim();

    this.serverError.set(null);
    this.submitting.set(true);

    this.data.store
      .reject(this.data.request.id, reason ? { reason } : {})
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
