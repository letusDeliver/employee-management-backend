import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import { InlineBannerComponent } from '../inline-banner/inline-banner.component';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** The confirm button's colour; `warn` (the default) suits a destructive action, `primary` a constructive one (e.g. approving). */
  tone?: 'warn' | 'primary';
  /**
   * An optional warning shown under the message as a warning banner - for a consequence the user
   * must not miss (Payroll: processing a month that has not ended). Absent = the dialog is unchanged.
   */
  warning?: string;
}

/**
 * Domain-agnostic shared dialog (blueprint §9) - every destructive
 * confirmation in the app (starting with Employees' soft-delete, this
 * feature) reuses this one component, parameterized via `MAT_DIALOG_DATA`,
 * never a bespoke dialog per action.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, InlineBannerComponent],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ConfirmDialogComponent, boolean>);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
