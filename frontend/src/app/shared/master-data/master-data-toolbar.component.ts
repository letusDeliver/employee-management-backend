import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, inject, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { ICON_NAMES } from '../icon-names';
import { MasterDataListQuery } from './master-data.models';

export type MasterDataFilters = Partial<Pick<MasterDataListQuery, 'search' | 'status'>>;

/**
 * Presentational, domain-agnostic: a debounced search box and a status
 * filter. Contains no domain wording at all - it was already word-for-word
 * identical across Branch, Department and Designation.
 */
@Component({
  selector: 'app-master-data-toolbar',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule],
  templateUrl: './master-data-toolbar.component.html',
  styleUrl: './master-data-toolbar.component.scss',
})
export class MasterDataToolbarComponent {
  protected readonly icons = ICON_NAMES;

  readonly filtersChange = output<MasterDataFilters>();

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
          status: value.status ? (value.status as MasterDataFilters['status']) : undefined,
        }),
      );
  }
}
