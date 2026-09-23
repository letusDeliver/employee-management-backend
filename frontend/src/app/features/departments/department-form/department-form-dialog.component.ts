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
import { Department } from '../data-access/department.models';
import { DepartmentStore } from '../data-access/department.store';

export interface DepartmentFormDialogData {
  department: Department | null;
}

/**
 * Create + edit, one dialog component - mirrors `BranchFormDialogComponent`
 * (a 3-field aggregate with no sub-resources doesn't justify a routed page).
 * Status is only editable in edit mode: a new department is always created
 * ACTIVE server-side, and deactivating is the real retirement path for a
 * department that has ever been used (it can never be hard-deleted once any
 * employee references it).
 */
@Component({
  selector: 'app-department-form-dialog',
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
  templateUrl: './department-form-dialog.component.html',
  styleUrl: './department-form-dialog.component.scss',
})
export class DepartmentFormDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<DepartmentFormDialogComponent, Department>);
  protected readonly data = inject<DepartmentFormDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly departmentStore = inject(DepartmentStore);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly isEditMode = this.data.department !== null;
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    name: [this.data.department?.name ?? '', notBlankValidator],
    code: [this.data.department?.code ?? ''],
    status: [this.data.department?.status ?? ('ACTIVE' as Department['status'])],
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
      this.isEditMode && this.data.department
        ? this.departmentStore.updateDepartment(this.data.department.id, {
            name,
            code: code === '' ? null : code,
            status: raw.status,
          })
        : this.departmentStore.createDepartment({
            name,
            code: code === '' ? undefined : code,
          });

    result$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (department) => {
        this.submitting.set(false);
        this.dialogRef.close(department);
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
