import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ColumnDef } from '../components/data-table/column-def';
import { DataTableCellDirective } from '../components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../components/data-table/data-table.component';
import { ICON_NAMES } from '../icon-names';
import { Paginated } from '../models/paginated.model';
import { MasterDataRecord } from './master-data.models';

/**
 * Presentational and domain-agnostic (§9/§10): configures `DataTableComponent`
 * with the fixed master-data columns. Unlike the per-domain tables it
 * replaces, it never injects `SessionStore` - whether the row actions render
 * is decided by the smart page and passed in as `canEdit`/`canDelete`, so
 * this component has no permission-key knowledge at all.
 */
@Component({
  selector: 'app-master-data-table',
  imports: [
    DataTableComponent,
    DataTableCellDirective,
    DatePipe,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './master-data-table.component.html',
  styleUrl: './master-data-table.component.scss',
})
export class MasterDataTableComponent<T extends MasterDataRecord> {
  protected readonly icons = ICON_NAMES;

  readonly rows = input.required<T[]>();
  readonly loading = input(false);
  readonly pagination = input.required<Paginated>();
  readonly deletingIds = input<ReadonlySet<string>>(new Set());
  readonly canEdit = input(false);
  readonly canDelete = input(false);

  readonly editRequested = output<T>();
  readonly deleteRequested = output<T>();
  readonly pageChange = output<PageEvent>();
  readonly sortChange = output<Sort>();

  protected readonly columns: ColumnDef[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'code', header: 'Code', sortable: true },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'createdAt', header: 'Created', sortable: true },
    { key: 'actions', header: '' },
  ];
}
