import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { map } from 'rxjs';

import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { LeaveBalance } from '../data-access/leave.models';
import { LeaveBalanceStore } from '../data-access/leave-balance.store';
import { buildBalanceAdjust, decimalDaysValidator, leavesNegativeBalance } from '../data-access/leave-form';
import { formatDays } from '../data-access/leave-rules';

export interface AdjustBalanceDialogData {
  balance: LeaveBalance;
  /** What the dialog says it is about, e.g. "Amit Rao - Annual Leave 2026". */
  summary: string;
  /**
   * Passed in, not injected: the store is provided by the page component, and a dialog is created
   * from the root injector, which cannot see a component-scoped provider.
   */
  store: LeaveBalanceStore;
}

/**
 * ADMIN's manual override of a balance (`leaveBalance:adjust:any`; always audit-logged) - the escape
 * hatch for the strict no-negative-balance default. Both numbers are `type="text"
 * inputmode="decimal"` with a validator that parses the raw string (a `type="number"` input silently
 * reports an empty value on any unparseable entry). Exactly as strict as the backend: any number
 * from 0 up; making `consumed` exceed `entitlement` is allowed, so the form only WARNS. It sends only
 * the field that changed and, when nothing did, no request at all (a no-op PATCH still writes an audit
 * row).
 */
@Component({
  selector: 'app-adjust-balance-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    InlineBannerComponent,
  ],
  templateUrl: './adjust-balance-dialog.component.html',
  styleUrl: './adjust-balance-dialog.component.scss',
})
export class AdjustBalanceDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<AdjustBalanceDialogComponent, LeaveBalance>);
  protected readonly data = inject<AdjustBalanceDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    entitlement: [formatDays(this.data.balance.entitlement), decimalDaysValidator],
    consumed: [formatDays(this.data.balance.consumed), decimalDaysValidator],
  });

  // A signal over the two values so the "would go negative" warning reacts as the user types.
  private readonly values = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  protected overdrawn(): boolean {
    return leavesNegativeBalance(this.values());
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const changes = buildBalanceAdjust(this.data.balance, this.form.getRawValue());
    if (Object.keys(changes).length === 0) {
      // Nothing changed - no request at all (a no-op PATCH would still write an audit row).
      this.dialogRef.close();
      return;
    }

    this.serverError.set(null);
    this.submitting.set(true);

    this.data.store
      .adjust(this.data.balance.id, changes)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (balance) => {
          this.submitting.set(false);
          this.dialogRef.close(balance);
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
