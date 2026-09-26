import { Component, computed, effect, inject, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';

import { LeaveTypeDirectoryService } from '../../../core/master-data-directory/leave-type-directory.service';
import { EmployeePickerComponent } from '../../../shared/components/employee-picker/employee-picker.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { formatDateOnly, parseDateOnly } from '../../../shared/utils/date-only.util';
import { LeaveRequestStatus } from '../data-access/leave.models';
import { LEAVE_STATUSES, LEAVE_STATUS_META } from '../data-access/leave-rules';
import { LeaveRequestFilters } from '../data-access/leave-request.store';

const keyOf = (filters: LeaveRequestFilters): string =>
  JSON.stringify([filters.employeeId ?? null, filters.leaveTypeId ?? null, filters.status ?? null, filters.dateFrom ?? null, filters.dateTo ?? null]);

/**
 * Presentational (§9): employee, status, leave type and a start-date range. It emits the WHOLE
 * filter set on every change and owns no list state - the page hands the store's current filters
 * back in through `filters`, so the fields follow the store (the page starts on PENDING).
 *
 * A half-picked range emits nothing, and the same filter set is never emitted twice in a row (a form
 * group, its date-range inputs and `reset()` each report a change for one user action, and every
 * emission is a request) - the same rules as Attendance's toolbar. The range filters by the request's
 * START date, which is what the backend compares.
 */
@Component({
  selector: 'app-leave-request-toolbar',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    EmployeePickerComponent,
  ],
  templateUrl: './leave-request-toolbar.component.html',
  styleUrl: './leave-request-toolbar.component.scss',
})
export class LeaveRequestToolbarComponent {
  protected readonly icons = ICON_NAMES;
  protected readonly leaveTypes = inject(LeaveTypeDirectoryService);
  protected readonly statusOptions = LEAVE_STATUSES.map((value) => ({ value, label: LEAVE_STATUS_META[value].label }));

  readonly filters = input<LeaveRequestFilters>({});
  readonly filtersChange = output<LeaveRequestFilters>();

  protected readonly form = new FormGroup({
    employeeId: new FormControl<string | null>(null),
    status: new FormControl<LeaveRequestStatus | ''>(''),
    leaveTypeId: new FormControl<string>(''),
    range: new FormGroup({
      start: new FormControl<Date | null>(null),
      end: new FormControl<Date | null>(null),
    }),
  });

  protected readonly hasFilters = computed(() => keyOf(this.filters()) !== keyOf({}));

  // The filter set the page last knew about (what it holds, or what this toolbar last sent it).
  private lastKey = keyOf({});

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const { start, end } = this.form.controls.range.getRawValue();
      if (start && !end) {
        return;
      }

      const filters: LeaveRequestFilters = {
        employeeId: this.form.controls.employeeId.value ?? undefined,
        status: this.form.controls.status.value || undefined,
        leaveTypeId: this.form.controls.leaveTypeId.value || undefined,
        dateFrom: start ? formatDateOnly(start) : undefined,
        dateTo: end ? formatDateOnly(end) : undefined,
      };

      const key = keyOf(filters);
      if (key === this.lastKey) {
        return;
      }

      this.lastKey = key;
      this.filtersChange.emit(filters);
    });

    // Follow the store: patch only what differs, without re-emitting (that would loop back).
    effect(() => {
      const { employeeId, leaveTypeId, status, dateFrom, dateTo } = this.filters();
      this.lastKey = keyOf({ employeeId, leaveTypeId, status, dateFrom, dateTo });
      const { start, end } = this.form.controls.range.getRawValue();
      const partiallyPicked = start !== null && end === null;

      if ((this.form.controls.employeeId.value ?? undefined) !== employeeId) {
        this.form.controls.employeeId.setValue(employeeId ?? null, { emitEvent: false });
      }
      if ((this.form.controls.status.value || undefined) !== status) {
        this.form.controls.status.setValue(status ?? '', { emitEvent: false });
      }
      if ((this.form.controls.leaveTypeId.value || undefined) !== leaveTypeId) {
        this.form.controls.leaveTypeId.setValue(leaveTypeId ?? '', { emitEvent: false });
      }

      // Leave a half-picked range alone: the store cannot know about it yet.
      if (!partiallyPicked) {
        if ((start ? formatDateOnly(start) : undefined) !== dateFrom) {
          this.form.controls.range.controls.start.setValue(dateFrom ? parseDateOnly(dateFrom) : null, { emitEvent: false });
        }
        if ((end ? formatDateOnly(end) : undefined) !== dateTo) {
          this.form.controls.range.controls.end.setValue(dateTo ? parseDateOnly(dateTo) : null, { emitEvent: false });
        }
      }
    });
  }

  protected clear(): void {
    this.form.reset({ employeeId: null, status: '', leaveTypeId: '' });
  }
}
