import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, inject, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { ICON_NAMES } from '../../../shared/icon-names';
import { EmployeeListQuery } from '../data-access/employee.model';

export type EmployeeFilters = Partial<Pick<EmployeeListQuery, 'search' | 'department' | 'jobTitle'>>;

/**
 * Presentational-ish (domain-scoped, per §10) - owns the debounced
 * filter form (blueprint §6's named debounced-search example, its first
 * real consumer) and the permission-gated "New Employee" entry point.
 * `SessionStore` is injected directly here rather than reaching for the
 * still-unbuilt `*appHasPermission` directive - a single button doesn't
 * justify that shared abstraction yet (same reasoning already applied
 * to `EmptyStateComponent`/`DataTableComponent`'s deferrals).
 */
@Component({
  selector: 'app-employee-toolbar',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    RouterLink,
  ],
  templateUrl: './employee-toolbar.component.html',
  styleUrl: './employee-toolbar.component.scss',
})
export class EmployeeToolbarComponent {
  protected readonly sessionStore = inject(SessionStore);
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
