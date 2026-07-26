import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, inject, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { ICON_NAMES } from '../../../shared/icon-names';
import { EmployeeListQuery } from '../data-access/employee.model';

export type EmployeeFilters = Partial<Pick<EmployeeListQuery, 'search' | 'department' | 'jobTitle'>>;

/**
 * Presentational-ish (domain-scoped, per §10) - owns only the debounced
 * filter form (blueprint §6's named debounced-search example, its first
 * real consumer). The "New Employee" action moved to
 * `EmployeeListPageComponent`'s `PageHeaderComponent` slot during Design
 * System Phase 2, so this component no longer needs `SessionStore` or
 * routing at all.
 */
@Component({
  selector: 'app-employee-toolbar',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatIconModule],
  templateUrl: './employee-toolbar.component.html',
  styleUrl: './employee-toolbar.component.scss',
})
export class EmployeeToolbarComponent {
  protected readonly icons = ICON_NAMES;

  readonly filtersChange = output<EmployeeFilters>();

  private readonly formBuilder = inject(FormBuilder);
  protected readonly form = this.formBuilder.nonNullable.group({
    search: '',
    department: '',
    jobTitle: '',
  });

  constructor() {
    this.form.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        takeUntilDestroyed(),
      )
      .subscribe((value) => this.filtersChange.emit(value));
  }
}
