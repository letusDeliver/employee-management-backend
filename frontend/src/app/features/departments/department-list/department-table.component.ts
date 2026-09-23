import { DatePipe } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';

import { SessionStore } from '../../../core/auth/session.store';
import { ColumnDef } from '../../../shared/components/data-table/column-def';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { Paginated } from '../../../shared/models/paginated.model';
import { Department } from '../data-access/department.models';

/**
 * Presentational, domain-scoped (§10) - configures `DataTableComponent`
 * with Department's real columns, mirrors `BranchTableComponent`. Row
 * actions are gated on the per-action permission (`department:update`/
 * `:delete`), not just route access - the same two-layer pattern.
 */
@Component({
  selector: 'app-department-table',
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
  templateUrl: './department-table.component.html',
  styleUrl: './department-table.component.scss',
})
export class DepartmentTableComponent {
  protected readonly sessionStore = inject(SessionStore);
  protected readonly icons = ICON_NAMES;

  readonly rows = input.required<Department[]>();
  readonly loading = input(false);
  readonly pagination = input.required<Paginated>();
  readonly deletingIds = input<ReadonlySet<string>>(new Set());

  readonly editRequested = output<Department>();
  readonly deleteRequested = output<Department>();
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
