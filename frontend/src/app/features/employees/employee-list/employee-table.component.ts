import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';
import { RouterLink } from '@angular/router';

import { SessionStore } from '../../../core/auth/session.store';
import { UserDirectoryService } from '../../../core/users/user-directory.service';
import { ColumnDef } from '../../../shared/components/data-table/column-def';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { Paginated } from '../../../shared/models/paginated.model';
import { Employee } from '../data-access/employee.model';

/**
 * Presentational, domain-scoped (§10) - configures `DataTableComponent`
 * with Employees' real columns; the shared component itself knows
 * nothing about Employees. Resolves an "Employee" column via
 * `UserDirectoryService` (core, Feature 6) - never a raw `userId`, and
 * a plain "—" whenever it isn't resolvable (no permission, unlinked, or
 * not-yet-loaded), per the enrichment principle: this feature must work
 * correctly with zero enrichment data present.
 */
@Component({
  selector: 'app-employee-table',
  imports: [
    DataTableComponent,
    DataTableCellDirective,
    CurrencyPipe,
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './employee-table.component.html',
  styleUrl: './employee-table.component.scss',
})
export class EmployeeTableComponent {
  protected readonly sessionStore = inject(SessionStore);
  protected readonly userDirectory = inject(UserDirectoryService);
  protected readonly icons = ICON_NAMES;

  readonly rows = input.required<Employee[]>();
  readonly loading = input(false);
  readonly pagination = input.required<Paginated>();

  readonly pageChange = output<PageEvent>();
  readonly sortChange = output<Sort>();

  protected readonly columns: ColumnDef[] = [
    { key: 'department', header: 'Department', sortable: true },
    { key: 'jobTitle', header: 'Job Title', sortable: true },
    { key: 'employee', header: 'Employee' },
    { key: 'salary', header: 'Salary', sortable: true },
    { key: 'dateOfJoining', header: 'Date of Joining', sortable: true },
    { key: 'actions', header: '' },
  ];

  constructor() {
    // Fire-and-forget: populates the shared cache if not already loaded.
    // Errors are swallowed deliberately - enrichment must never become a
    // functional dependency (blueprint, Feature 6).
    this.userDirectory.ensureLoaded().subscribe({ error: () => undefined });
  }

  protected displayName(userId: string | null): string | null {
    return this.userDirectory.resolveDisplayName(userId);
  }
}
