import { Component, computed, effect, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';

import { ICON_NAMES } from '../../../shared/icon-names';
import { formatDateOnly, parseDateOnly } from '../../../shared/utils/date-only.util';
import { EmployeePickerComponent } from '../../../shared/components/employee-picker/employee-picker.component';

/** The filters the records list understands. Dates are `YYYY-MM-DD`; a missing key means "no filter". */
export interface AttendanceFilters {
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

const keyOf = (filters: AttendanceFilters): string =>
  JSON.stringify([filters.employeeId ?? null, filters.dateFrom ?? null, filters.dateTo ?? null]);

/**
 * Presentational (§9): an employee filter and a date range. It emits the WHOLE filter set on every
 * change and owns no list state - the page hands the store's current filters back in through
 * `filters`, so the fields follow a change the page made itself (a created record can move the
 * filters to where the new record is) instead of showing stale values.
 *
 * A half-picked range (a start with no end yet) emits nothing: the request would only be thrown
 * away a moment later when the end is chosen. Nor is the same filter set ever emitted twice in a
 * row: a form group, its date-range inputs and a `reset()` can each report a change for one user
 * action, and every emission is a request to the server.
 */
@Component({
  selector: 'app-attendance-toolbar',
  imports: [ReactiveFormsModule, MatButtonModule, MatDatepickerModule, MatFormFieldModule, MatIconModule, EmployeePickerComponent],
  templateUrl: './attendance-toolbar.component.html',
  styleUrl: './attendance-toolbar.component.scss',
})
export class AttendanceToolbarComponent {
  protected readonly icons = ICON_NAMES;

  readonly filters = input<AttendanceFilters>({});
  readonly filtersChange = output<AttendanceFilters>();

  protected readonly form = new FormGroup({
    employeeId: new FormControl<string | null>(null),
    range: new FormGroup({
      start: new FormControl<Date | null>(null),
      end: new FormControl<Date | null>(null),
    }),
  });

  protected readonly hasFilters = computed(() => {
    const { employeeId, dateFrom, dateTo } = this.filters();
    return Boolean(employeeId || dateFrom || dateTo);
  });

  // The filter set the page last knew about (what it holds, or what this toolbar last sent it).
  private lastKey = keyOf({});

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const { start, end } = this.form.controls.range.getRawValue();
      if (start && !end) {
        return;
      }

      const filters: AttendanceFilters = {
        employeeId: this.form.controls.employeeId.value ?? undefined,
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
      const { employeeId, dateFrom, dateTo } = this.filters();
      this.lastKey = keyOf({ employeeId, dateFrom, dateTo });
      const { start, end } = this.form.controls.range.getRawValue();
      const partiallyPicked = start !== null && end === null;

      if ((this.form.controls.employeeId.value ?? undefined) !== employeeId) {
        this.form.controls.employeeId.setValue(employeeId ?? null, { emitEvent: false });
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
    this.form.reset();
  }
}
