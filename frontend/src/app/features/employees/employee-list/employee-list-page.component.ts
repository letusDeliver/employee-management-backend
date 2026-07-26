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
 * already patches the `employees` signal in place.
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
  protected readonly icons = ICON_NAMES;

  protected readonly deleteError = signal<string | null>(null);
  protected readonly deletingIds = signal<ReadonlySet<string>>(new Set());

  // Distinguishes "no employees exist at all" from "this filter/search
  // matched nothing" - the two need different EmptyStateComponent copy.
  protected readonly hasActiveFilters = computed(() => {
    const query = this.employeeStore.query();
    return Boolean(query.search || query.department || query.jobTitle || query.managerId);
  });

  ngOnInit(): void {
    this.employeeStore.loadList();
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
          message: `Delete the ${employee.jobTitle} record in ${employee.department}? This cannot be undone.`,
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
}
