import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';

import { UserListItem } from '../../../core/users/user.models';
import { ColumnDef } from '../../../shared/components/data-table/column-def';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { Paginated } from '../../../shared/models/paginated.model';

/**
 * Presentational, domain-scoped (§10) - configures `DataTableComponent`
 * with Users' real columns, the same way `EmployeeTableComponent` does
 * for Employees. Pagination/sorting are entirely server-side; this
 * component owns no `MatTableDataSource`/`MatSort` of its own, unlike
 * the client-side version it replaces (see the Users Server-Side
 * Pagination pass's Architecture doc for why - the backend now does
 * real search/filter/sort/pagination, so the shared table's second real
 * consumer is this one, not a client-side data source).
 */
@Component({
  selector: 'app-user-table',
  imports: [DataTableComponent, DataTableCellDirective, MatChipsModule, DatePipe],
  templateUrl: './user-table.component.html',
  styleUrl: './user-table.component.scss',
})
export class UserTableComponent {
  readonly rows = input.required<UserListItem[]>();
  readonly loading = input(false);
  readonly pagination = input.required<Paginated>();

  readonly pageChange = output<PageEvent>();
  readonly sortChange = output<Sort>();

  protected readonly columns: ColumnDef[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    { key: 'roles', header: 'Roles' },
    { key: 'createdAt', header: 'Member since', sortable: true },
  ];
}
