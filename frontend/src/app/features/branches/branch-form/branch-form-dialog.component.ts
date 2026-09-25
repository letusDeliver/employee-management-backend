import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { HolidayCalendarDirectoryService } from '../../../core/master-data-directory/holiday-calendar-directory.service';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { notBlankValidator } from '../../../shared/validators/not-blank.validator';
import { calendarChangeForUpdate, calendarForCreate } from '../data-access/branch-calendar';
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
 * The optional "Holiday calendar" select is a best-effort lookup (like the Employee form's
 * Branch and Shift): its options are the calendars the backend will accept (ACTIVE, plus the
 * branch's current one, flagged inactive), and if the lookup fails only that select is disabled -
 * the branch can still be saved, and an unchanged calendar is never sent (`branch-calendar.ts`).
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
export class BranchFormDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<BranchFormDialogComponent, Branch>);
  protected readonly data = inject<BranchFormDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly branchStore = inject(BranchStore);
  private readonly formBuilder = inject(FormBuilder);
  private readonly calendars = inject(HolidayCalendarDirectoryService);

  protected readonly isEditMode = this.data.branch !== null;
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    name: [this.data.branch?.name ?? '', notBlankValidator],
    code: [this.data.branch?.code ?? ''],
    status: [this.data.branch?.status ?? ('ACTIVE' as Branch['status'])],
    holidayCalendarId: [this.data.branch?.holidayCalendarId ?? ''],
  });

  protected readonly calendarUnavailable = computed(() => Boolean(this.calendars.error()));
  protected readonly calendarOptions = computed(() => this.calendars.optionsFor(this.data.branch?.holidayCalendarId));

  constructor() {
    // A failed lookup disables the select instead of blocking the form (an unchanged calendar is never sent).
    effect(() => {
      const control = this.form.controls.holidayCalendarId;
      if (this.calendarUnavailable()) {
        control.disable({ emitEvent: false });
      } else {
        control.enable({ emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    this.calendars.refresh().subscribe({ error: () => undefined });
  }

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
            ...calendarChangeForUpdate(this.data.branch.holidayCalendarId, raw.holidayCalendarId),
          })
        : this.branchStore.createBranch({
            name: raw.name,
            code: code === '' ? undefined : code,
            ...calendarForCreate(raw.holidayCalendarId),
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
