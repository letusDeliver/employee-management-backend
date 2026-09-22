import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, inject, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { ICON_NAMES } from '../../../shared/icon-names';
import { BranchListQuery } from '../data-access/branch.models';

export type BranchFilters = Partial<Pick<BranchListQuery, 'search' | 'status'>>;

/** Presentational-ish (domain-scoped, per §10), mirrors `EmployeeToolbarComponent`'s debounced filter form. */
@Component({
  selector: 'app-branch-toolbar',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule],
  templateUrl: './branch-toolbar.component.html',
  styleUrl: './branch-toolbar.component.scss',
})
export class BranchToolbarComponent {
  protected readonly icons = ICON_NAMES;

  readonly filtersChange = output<BranchFilters>();

  private readonly formBuilder = inject(FormBuilder);
  protected readonly form = this.formBuilder.nonNullable.group({
    search: '',
    status: '',
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
          status: value.status ? (value.status as BranchFilters['status']) : undefined,
        }),
      );
  }
}
