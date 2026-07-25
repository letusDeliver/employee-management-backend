import { DatePipe } from '@angular/common';
import { AfterViewInit, Component, effect, input, viewChild } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';

import { UserListItem } from '../data-access/user.models';

/**
 * Presentational, domain-scoped (blueprint §10) - `rows` in,
 * `MatTableDataSource` + `MatSort` handle column sorting entirely
 * client-side over the array it's given. No `HttpClient`/Store
 * injection here, and deliberately no `MatPaginator` - there is nothing
 * to page against a server (blueprint, Feature 5 Theory). Kept as its
 * own component (not inlined into UserListPageComponent) specifically
 * so a future swap to the shared `DataTableComponent`, if its eventual
 * (Employees-driven) contract ever turns out to support a client-side
 * mode too, is contained to this one file.
 */
@Component({
  selector: 'app-user-table',
  imports: [MatTableModule, MatSortModule, MatChipsModule, DatePipe],
  templateUrl: './user-table.component.html',
  styleUrl: './user-table.component.scss',
})
export class UserTableComponent implements AfterViewInit {
  readonly rows = input.required<UserListItem[]>();

  protected readonly displayedColumns = ['name', 'email', 'roles', 'createdAt'];
  protected readonly dataSource = new MatTableDataSource<UserListItem>([]);

  private readonly sort = viewChild.required(MatSort);

  constructor() {
    effect(() => {
      this.dataSource.data = this.rows();
    });
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort();

    // The default sorting accessor can't compare a string[] (roles) or
    // do a case-insensitive compare - this stays a client-side sort over
    // already-loaded data either way, never a server request.
    this.dataSource.sortingDataAccessor = (item, property) => {
      switch (property) {
        case 'roles':
          return item.roles.join(', ');
        case 'name':
          return item.name.toLowerCase();
        case 'email':
          return item.email.toLowerCase();
        case 'createdAt':
          return item.createdAt;
        default:
          return '';
      }
    };
  }
}
