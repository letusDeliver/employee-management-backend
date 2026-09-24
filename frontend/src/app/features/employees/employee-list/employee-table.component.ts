import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

import { SessionStore } from '../../../core/auth/session.store';
import { DepartmentDirectoryService } from '../../../core/master-data-directory/department-directory.service';
import { DesignationDirectoryService } from '../../../core/master-data-directory/designation-directory.service';
import { UserDirectoryService } from '../../../core/users/user-directory.service';
import { ColumnDef } from '../../../shared/components/data-table/column-def';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { Paginated } from '../../../shared/models/paginated.model';
import { Employee } from '../data-access/employee.model';
import { EMPLOYMENT_TYPE_LABELS } from '../data-access/employment-type';

/**
 * Presentational, domain-scoped (§10) - configures `DataTableComponent` with
 * Employees' real columns; the shared component itself knows nothing about Employees.
 *
 * The API returns bare `departmentId`/`designationId`, so names are resolved through the
 * `core/` directories (the page is responsible for loading them) - and only ever as
 * display: a name that cannot be resolved is a plain "—", never a raw id, per the
 * enrichment principle (this list must be correct with zero enrichment present). The
 * "Employee" column resolves the linked user the same way, via `UserDirectoryService`.
 *
 * Column keys for the sortable columns are the backend's own sort keys
 * (`department`/`designation`/`employmentType`), which sort by the related record's name.
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
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './employee-table.component.html',
  styleUrl: './employee-table.component.scss',
})
export class EmployeeTableComponent {
  protected readonly sessionStore = inject(SessionStore);
  protected readonly userDirectory = inject(UserDirectoryService);
  private readonly departments = inject(DepartmentDirectoryService);
  private readonly designations = inject(DesignationDirectoryService);
  protected readonly icons = ICON_NAMES;

  readonly rows = input.required<Employee[]>();
  readonly loading = input(false);
  readonly pagination = input.required<Paginated>();
  readonly deletingIds = input<ReadonlySet<string>>(new Set());

  readonly pageChange = output<PageEvent>();
  readonly sortChange = output<Sort>();
  readonly deleteRequested = output<Employee>();

  protected readonly columns: ColumnDef[] = [
    { key: 'department', header: 'Department', sortable: true },
    { key: 'designation', header: 'Designation', sortable: true },
    { key: 'employmentType', header: 'Employment type', sortable: true },
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

  protected departmentName(row: Employee): string | null {
    return this.departments.nameOf(row.departmentId);
  }

  protected designationName(row: Employee): string | null {
    return this.designations.nameOf(row.designationId);
  }

  protected employmentTypeLabel(row: Employee): string {
    return EMPLOYMENT_TYPE_LABELS[row.employmentType] ?? '—';
  }

  /** What an icon-only button says about its row - a name, never "undefined". */
  protected rowLabel(row: Employee): string {
    return this.designationName(row) ?? 'employee';
  }
}
