import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { DirectoryEntry } from '../../../core/master-data-directory/master-data-directory';
import { ICON_NAMES } from '../../../shared/icon-names';
import { EmployeeListQuery } from '../data-access/employee.model';
import { EMPLOYMENT_TYPE_OPTIONS } from '../data-access/employment-type';

export type EmployeeFilters = Partial<Pick<EmployeeListQuery, 'search' | 'departmentId' | 'designationId' | 'employmentType'>>;

/**
 * Presentational-ish (domain-scoped, per §10) - owns only the debounced filter form
 * (blueprint §6's named debounced-search example). Department and designation are
 * SELECTS over the records themselves, sent as `departmentId`/`designationId`: the
 * backend filters by id, and the free-text `department`/`jobTitle` filters this
 * toolbar used to send were silently ignored (the API accepted them and returned
 * everyone). The option lists are passed in - this component injects nothing - and
 * include INACTIVE records, because an employee can still belong to one and must
 * remain filterable.
 */
@Component({
  selector: 'app-employee-toolbar',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule],
  templateUrl: './employee-toolbar.component.html',
  styleUrl: './employee-toolbar.component.scss',
})
export class EmployeeToolbarComponent {
  protected readonly icons = ICON_NAMES;
  protected readonly employmentTypes = EMPLOYMENT_TYPE_OPTIONS;

  readonly departments = input<DirectoryEntry[]>([]);
  readonly designations = input<DirectoryEntry[]>([]);

  readonly filtersChange = output<EmployeeFilters>();

  private readonly formBuilder = inject(FormBuilder);
  protected readonly form = this.formBuilder.nonNullable.group({
    search: '',
    departmentId: '',
    designationId: '',
    employmentType: '',
  });

  constructor() {
    this.form.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        takeUntilDestroyed(),
      )
      .subscribe((value) =>
        this.filtersChange.emit({
          search: value.search,
          // "All" is the empty string in the form; the query wants the key absent.
          departmentId: value.departmentId || undefined,
          designationId: value.designationId || undefined,
          employmentType: (value.employmentType || undefined) as EmployeeFilters['employmentType'],
        }),
      );
  }
}
