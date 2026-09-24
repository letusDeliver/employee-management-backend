import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { DepartmentDirectoryService } from '../../../core/master-data-directory/department-directory.service';
import { DesignationDirectoryService } from '../../../core/master-data-directory/designation-directory.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { Employee, EmployeeSortField } from '../data-access/employee.model';
import { EmployeeStore } from '../data-access/employee.store';
import { EmployeeFilters, EmployeeToolbarComponent } from './employee-toolbar.component';
import { EmployeeTableComponent } from './employee-table.component';

/**
 * Smart, routed (§10/§9). Owns nothing about rendering rows or
 * resolving names - delegates entirely to `EmployeeToolbarComponent`/
 * `EmployeeTableComponent`, injects `EmployeeStore` for all list state.
 * Also owns the delete confirmation flow (the table stays presentational,
 * just emitting intent) - mirrors `EmployeeDetailPageComponent`'s own
 * confirm-dialog + `deleteEmployee` pattern, but stays on the list page
 * afterwards instead of navigating away, since `EmployeeStore.deleteEmployee`
 * refetches the list itself.
 *
 * Loads the department and designation directories on entry (names for the table,
 * options for the toolbar's selects). A failed load is deliberately NOT surfaced
 * here: on this page the names are display-only enrichment, so a failure degrades to
 * "—" and empty filter lists - it must never stop the list from working. (The
 * create/edit form, where those values are mandatory, is where a failed load blocks.)
 *
 * The permission-gated "New Employee" action lives here (in
 * `PageHeaderComponent`'s action slot), not in `EmployeeToolbarComponent` -
 * relocated during Design System Phase 2 so the toolbar stays focused
 * purely on filtering/searching, matching every other page-level action's
 * placement.
 */
@Component({
  selector: 'app-employee-list-page',
  imports: [
    EmployeeToolbarComponent,
    EmployeeTableComponent,
    MatIconModule,
    MatButtonModule,
    RouterLink,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './employee-list-page.component.html',
  styleUrl: './employee-list-page.component.scss',
})
export class EmployeeListPageComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly employeeStore = inject(EmployeeStore);
  protected readonly sessionStore = inject(SessionStore);
  protected readonly departmentDirectory = inject(DepartmentDirectoryService);
  protected readonly designationDirectory = inject(DesignationDirectoryService);
  protected readonly icons = ICON_NAMES;

  protected readonly deleteError = signal<string | null>(null);
  protected readonly deletingIds = signal<ReadonlySet<string>>(new Set());

  // Distinguishes "no employees exist at all" from "this filter/search
  // matched nothing" - the two need different EmptyStateComponent copy.
  protected readonly hasActiveFilters = computed(() => {
    const query = this.employeeStore.query();
    return Boolean(query.search || query.departmentId || query.designationId || query.employmentType || query.managerId);
  });

  ngOnInit(): void {
    this.employeeStore.loadList();
    // Errors are swallowed on purpose - see the class comment: names are display-only here.
    this.departmentDirectory.refresh().subscribe({ error: () => undefined });
    this.designationDirectory.refresh().subscribe({ error: () => undefined });
  }

  protected onFiltersChange(filters: EmployeeFilters): void {
    this.employeeStore.setFilters(filters);
  }

  protected onPageChange(event: PageEvent): void {
    this.employeeStore.setPage(event.pageIndex + 1, event.pageSize);
  }

  protected onSortChange(sort: Sort): void {
    if (!sort.direction) {
      // MatSort's "cleared" third-click state - keep the previous sort
      // rather than sending a request with no direction at all.
      return;
    }
    this.employeeStore.setSort(sort.active as EmployeeSortField, sort.direction);
  }

  protected onDeleteRequested(employee: Employee): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Delete employee',
          message: this.deleteMessage(employee),
          confirmLabel: 'Delete',
        },
      })
      .afterClosed()
      .subscribe((confirmed: boolean | undefined) => {
        if (!confirmed) {
          return;
        }

        this.deleteError.set(null);
        this.deletingIds.update((current) => new Set(current).add(employee.id));

        this.employeeStore
          .deleteEmployee(employee.id)
          .pipe(
            takeUntilDestroyed(this.destroyRef),
            finalize(() =>
              this.deletingIds.update((current) => {
                const next = new Set(current);
                next.delete(employee.id);
                return next;
              }),
            ),
          )
          .subscribe({
            error: (error: unknown) => this.deleteError.set(extractErrorMessage(error)),
          });
      });
  }

  /** Names where they resolve, plain wording where they do not - never "undefined". */
  private deleteMessage(employee: Employee): string {
    const designation = this.designationDirectory.nameOf(employee.designationId);
    const department = this.departmentDirectory.nameOf(employee.departmentId);
    const subject = designation ? `the ${designation} record` : 'this employee record';
    return `Delete ${subject}${department ? ` in ${department}` : ''}? This cannot be undone.`;
  }
}
