import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { ICON_NAMES } from '../../../shared/icon-names';
import { UserListQuery } from '../data-access/user.model';

export type UserFilters = Partial<Pick<UserListQuery, 'search' | 'role'>>;

/**
 * Presentational-ish (domain-scoped, per §10), mirrors
 * `EmployeeToolbarComponent`'s exact shape - owns only the debounced
 * filter form. `initialFilters` lets `UserListPageComponent` seed the
 * form from the URL on first render without the debounce firing a
 * redundant request for state the URL already supplied.
 */
@Component({
  selector: 'app-user-toolbar',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatIconModule],
  templateUrl: './user-toolbar.component.html',
  styleUrl: './user-toolbar.component.scss',
})
export class UserToolbarComponent {
  protected readonly icons = ICON_NAMES;

  readonly initialFilters = input<UserFilters>({});
  readonly filtersChange = output<UserFilters>();

  private readonly formBuilder = inject(FormBuilder);
  protected readonly form = this.formBuilder.nonNullable.group({
    search: '',
    role: '',
  });

  constructor() {
    const initial = this.initialFilters();
    if (initial.search || initial.role) {
      this.form.patchValue({ search: initial.search ?? '', role: initial.role ?? '' }, { emitEvent: false });
    }

    this.form.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        takeUntilDestroyed(),
      )
      .subscribe((value) => this.filtersChange.emit(value));
  }
}
