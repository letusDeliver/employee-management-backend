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
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { notBlankValidator } from '../../../shared/validators/not-blank.validator';
import { Branch } from '../data-access/branch.models';
import { BranchStore } from '../data-access/branch.store';

export interface BranchFormDialogData {
  branch: Branch | null;
}

/**
 * Create + edit, one dialog component (mirrors `EmployeeFormPageComponent`'s
 * create/edit merge, but as a `MatDialog` rather than a routed page - see
 * Phase 2's architecture decision: Branch has no sub-resources or
 * detail-only fields to justify a full routed page + breadcrumb).
 * `holidayCalendarId` is deliberately not a form field - Holiday Calendar
 * (domain 7) has no frontend yet, so there is nothing to select from; this
 * is additive when that domain ships, not a redesign.
 */
@Component({
  selector: 'app-branch-form-dialog',
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
  templateUrl: './branch-form-dialog.component.html',
  styleUrl: './branch-form-dialog.component.scss',
})
export class BranchFormDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<BranchFormDialogComponent, Branch>);
  protected readonly data = inject<BranchFormDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly branchStore = inject(BranchStore);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly isEditMode = this.data.branch !== null;
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    name: [this.data.branch?.name ?? '', notBlankValidator],
    code: [this.data.branch?.code ?? ''],
    status: [this.data.branch?.status ?? ('ACTIVE' as Branch['status'])],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.serverError.set(null);
    this.submitting.set(true);

    const raw = this.form.getRawValue();
    const code = raw.code.trim();

    // Create omits an empty code (nothing to store yet); edit sends null
    // instead, so clearing a previously-set code actually clears it
    // server-side rather than silently leaving it unchanged - same
    // omit-vs-null distinction Employees' userId/managerId already use.
    const result$ =
      this.isEditMode && this.data.branch
        ? this.branchStore.updateBranch(this.data.branch.id, {
            name: raw.name,
            code: code === '' ? null : code,
            status: raw.status,
          })
        : this.branchStore.createBranch({
            name: raw.name,
            code: code === '' ? undefined : code,
          });

    result$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (branch) => {
        this.submitting.set(false);
        this.dialogRef.close(branch);
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
