import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { MasterDataStatus } from '../../../shared/master-data/master-data.models';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { notBlankValidator } from '../../../shared/validators/not-blank.validator';
import { LeaveType } from '../data-access/leave.models';
import { buildLeaveTypeCreate, buildLeaveTypeUpdate, wholeDaysValidator } from '../data-access/leave-form';
import { LeaveTypeStore } from '../data-access/leave-type.store';

export interface LeaveTypeFormDialogData {
  /** `null` means create; a leave type means edit. */
  leaveType: LeaveType | null;
}

/**
 * Create + edit, one dialog. Leave type's own rather than the shared master-data dialog: no `code`,
 * and it edits a whole-day entitlement and a paid flag. The entitlement is `type="text"
 * inputmode="numeric"` with a validator that parses the raw string (a `type="number"` input silently
 * reports an empty value on any unparseable entry). Exactly as strict as the backend: 1 to 365 whole
 * days.
 *
 * Status is editable only when editing: a new type is always created ACTIVE, and deactivating is the
 * retirement path for one that any request or balance references (it can never be hard-deleted).
 * An edit sends only what changed and, when nothing did, no request at all.
 */
@Component({
  selector: 'app-leave-type-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    InlineBannerComponent,
  ],
  templateUrl: './leave-type-form-dialog.component.html',
  styleUrl: './leave-type-form-dialog.component.scss',
})
export class LeaveTypeFormDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<LeaveTypeFormDialogComponent, LeaveType>);
  protected readonly data = inject<LeaveTypeFormDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly store = inject(LeaveTypeStore);

  protected readonly isEditMode = this.data.leaveType !== null;
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    name: [this.data.leaveType?.name ?? '', notBlankValidator],
    defaultAnnualEntitlement: [String(this.data.leaveType?.defaultAnnualEntitlement ?? ''), wholeDaysValidator],
    isPaid: [this.data.leaveType?.isPaid ?? true],
    status: [this.data.leaveType?.status ?? ('ACTIVE' as MasterDataStatus)],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const original = this.data.leaveType;

    if (original) {
      const changes = buildLeaveTypeUpdate(original, raw);
      if (Object.keys(changes).length === 0) {
        // Nothing changed - no request at all (a no-op PATCH would still write an audit row).
        this.dialogRef.close();
        return;
      }
      this.run(this.store.updateRecord(original.id, changes));
      return;
    }

    this.run(this.store.createRecord(buildLeaveTypeCreate(raw)));
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  private run(result$: ReturnType<LeaveTypeStore['createRecord']>): void {
    this.serverError.set(null);
    this.submitting.set(true);

    result$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (leaveType) => {
        this.submitting.set(false);
        this.dialogRef.close(leaveType);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.serverError.set(extractErrorMessage(error));
      },
    });
  }
}
