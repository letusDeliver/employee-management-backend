import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LowerCasePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { InlineBannerComponent } from '../components/inline-banner/inline-banner.component';
import { extractErrorMessage } from '../utils/extract-error-message.util';
import { notBlankValidator } from '../validators/not-blank.validator';
import { CreateMasterDataRequest, MasterDataRecord, UpdateMasterDataRequest } from './master-data.models';
import { MasterDataStore } from './master-data.store';

export interface MasterDataFormDialogData {
  /** `null` means create; a record means edit. */
  record: MasterDataRecord | null;
  store: MasterDataStore<MasterDataRecord, CreateMasterDataRequest, UpdateMasterDataRequest>;
}

/**
 * Create + edit, one dialog component, domain-agnostic - all wording comes
 * from `store.labels`. Status is only editable in edit mode: a new record is
 * always created ACTIVE server-side, and deactivating is the real retirement
 * path for one that has ever been used (a mandatory-FK master-data record can
 * never be hard-deleted once any employee references it).
 */
@Component({
  selector: 'app-master-data-form-dialog',
  imports: [
    ReactiveFormsModule,
    LowerCasePipe,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    InlineBannerComponent,
  ],
  templateUrl: './master-data-form-dialog.component.html',
  styleUrl: './master-data-form-dialog.component.scss',
})
export class MasterDataFormDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<MasterDataFormDialogComponent, MasterDataRecord>);
  protected readonly data = inject<MasterDataFormDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly labels = this.data.store.labels;
  protected readonly isEditMode = this.data.record !== null;
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    name: [this.data.record?.name ?? '', notBlankValidator],
    code: [this.data.record?.code ?? ''],
    status: [this.data.record?.status ?? ('ACTIVE' as MasterDataRecord['status'])],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.serverError.set(null);
    this.submitting.set(true);

    const raw = this.form.getRawValue();
    const name = raw.name.trim();
    const code = raw.code.trim();

    // Create omits an empty code (nothing to store yet); edit sends null
    // instead, so clearing a previously-set code actually clears it
    // server-side rather than silently leaving it unchanged.
    const result$ =
      this.isEditMode && this.data.record
        ? this.data.store.updateRecord(this.data.record.id, {
            name,
            code: code === '' ? null : code,
            status: raw.status,
          })
        : this.data.store.createRecord({
            name,
            code: code === '' ? undefined : code,
          });

    result$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (record) => {
        this.submitting.set(false);
        this.dialogRef.close(record);
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
