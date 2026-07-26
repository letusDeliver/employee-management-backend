import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';
import { finalize } from 'rxjs';

import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
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
 */
@Component({
  selector: 'app-employee-list-page',
  imports: [EmployeeToolbarComponent, EmployeeTableComponent, MatIconModule],
  templateUrl: './employee-list-page.component.html',
  styleUrl: './employee-list-page.component.scss',
})
export class EmployeeListPageComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly employeeStore = inject(EmployeeStore);
  protected readonly icons = ICON_NAMES;

  protected readonly deleteError = signal<string | null>(null);
  protected readonly deletingIds = signal<ReadonlySet<string>>(new Set());

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
