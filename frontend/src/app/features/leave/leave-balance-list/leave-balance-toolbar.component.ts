import { Component, computed, effect, inject, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { LeaveTypeDirectoryService } from '../../../core/master-data-directory/leave-type-directory.service';
import { EmployeePickerComponent } from '../../../shared/components/employee-picker/employee-picker.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { LeaveBalanceFilters } from '../data-access/leave-balance.store';

const keyOf = (filters: LeaveBalanceFilters): string =>
  JSON.stringify([filters.employeeId ?? null, filters.leaveTypeId ?? null, filters.year ?? null]);

/** A four-digit year typed as text; anything else (a half-typed "20") is "no year filter" yet. */
const parseYear = (text: string): number | undefined => (/^\d{4}$/.test(text.trim()) ? Number(text.trim()) : undefined);

/**
 * Presentational (§9): employee, leave type and year. It emits the WHOLE filter set on every change
 * and owns no list state - the page hands the store's filters back through `filters`. The same filter
 * set is never emitted twice in a row (typing "2", "20", "202" is all "no year" until the fourth
 * digit, and each emission is a request).
 */
@Component({
  selector: 'app-leave-balance-toolbar',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, EmployeePickerComponent],
  templateUrl: './leave-balance-toolbar.component.html',
  styleUrl: './leave-balance-toolbar.component.scss',
})
export class LeaveBalanceToolbarComponent {
  protected readonly icons = ICON_NAMES;
  protected readonly leaveTypes = inject(LeaveTypeDirectoryService);

  readonly filters = input<LeaveBalanceFilters>({});
  readonly filtersChange = output<LeaveBalanceFilters>();

  protected readonly form = new FormGroup({
    employeeId: new FormControl<string | null>(null),
    leaveTypeId: new FormControl<string>(''),
    year: new FormControl<string>(''),
  });

  protected readonly hasFilters = computed(() => keyOf(this.filters()) !== keyOf({}));

  private lastKey = keyOf({});

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const filters: LeaveBalanceFilters = {
        employeeId: this.form.controls.employeeId.value ?? undefined,
        leaveTypeId: this.form.controls.leaveTypeId.value || undefined,
        year: parseYear(this.form.controls.year.value ?? ''),
      };

      const key = keyOf(filters);
      if (key === this.lastKey) {
        return;
      }

      this.lastKey = key;
      this.filtersChange.emit(filters);
    });

    // Follow the store: patch only what differs, without re-emitting.
    effect(() => {
      const { employeeId, leaveTypeId, year } = this.filters();
      this.lastKey = keyOf({ employeeId, leaveTypeId, year });

      if ((this.form.controls.employeeId.value ?? undefined) !== employeeId) {
        this.form.controls.employeeId.setValue(employeeId ?? null, { emitEvent: false });
      }
      if ((this.form.controls.leaveTypeId.value || undefined) !== leaveTypeId) {
        this.form.controls.leaveTypeId.setValue(leaveTypeId ?? '', { emitEvent: false });
      }
      // A half-typed year is left alone: the store cannot know about it yet.
      if (parseYear(this.form.controls.year.value ?? '') !== year) {
        this.form.controls.year.setValue(year === undefined ? '' : String(year), { emitEvent: false });
      }
    });
  }

  protected clear(): void {
    this.form.reset({ employeeId: null, leaveTypeId: '', year: '' });
  }
}
