import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';
import { finalize } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { Department, DepartmentSortField } from '../data-access/department.models';
import { DepartmentStore } from '../data-access/department.store';
import {
  DepartmentFormDialogComponent,
  DepartmentFormDialogData,
} from '../department-form/department-form-dialog.component';
import { DepartmentFilters, DepartmentToolbarComponent } from './department-toolbar.component';
import { DepartmentTableComponent } from './department-table.component';

/**
 * Smart, routed at `/departments`. Owns the create/edit dialog and the
 * delete confirmation flow - mirrors `BranchListPageComponent`. Unlike
 * Branch, the store refetches after every mutation, so this page needs no
 * `afterClosed()` handling beyond opening the dialog.
 */
@Component({
  selector: 'app-department-list-page',
  imports: [
    DepartmentToolbarComponent,
    DepartmentTableComponent,
    MatIconModule,
    MatButtonModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './department-list-page.component.html',
  styleUrl: './department-list-page.component.scss',
})
export class DepartmentListPageComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly departmentStore = inject(DepartmentStore);
  protected readonly sessionStore = inject(SessionStore);
  protected readonly icons = ICON_NAMES;

  protected readonly deleteError = signal<string | null>(null);
  protected readonly deletingIds = signal<ReadonlySet<string>>(new Set());

  // Distinguishes "no departments exist at all" from "this filter/search
  // matched nothing" - the two need different EmptyStateComponent copy.
  protected readonly hasActiveFilters = computed(() => {
    const query = this.departmentStore.query();
    return Boolean(query.search || query.status);
  });

  ngOnInit(): void {
    this.departmentStore.loadList();
  }

  protected onFiltersChange(filters: DepartmentFilters): void {
    this.departmentStore.setFilters(filters);
  }

  protected onPageChange(event: PageEvent): void {
    this.departmentStore.setPage(event.pageIndex + 1, event.pageSize);
  }

  protected onSortChange(sort: Sort): void {
    if (!sort.direction) {
      // MatSort's "cleared" third-click state - keep the previous sort
      // rather than sending a request with no direction at all.
      return;
    }
    this.departmentStore.setSort(sort.active as DepartmentSortField, sort.direction);
  }

  protected openCreateDialog(): void {
    this.dialog.open<DepartmentFormDialogComponent, DepartmentFormDialogData, Department>(
      DepartmentFormDialogComponent,
      { data: { department: null }, width: '480px', maxWidth: '95vw' },
    );
  }

  protected openEditDialog(department: Department): void {
    this.dialog.open<DepartmentFormDialogComponent, DepartmentFormDialogData, Department>(
      DepartmentFormDialogComponent,
      { data: { department }, width: '480px', maxWidth: '95vw' },
    );
  }

  protected onDeleteRequested(department: Department): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Delete department',
          // A department that has ever had an employee assigned can never be
          // deleted (mandatory FK, soft-deleted employees count too), so the
          // copy points at the real alternative up front.
          message: `Delete "${department.name}"? This cannot be undone. If employees have ever been assigned to it, deactivate it instead (Edit → Status).`,
          confirmLabel: 'Delete',
        },
      })
      .afterClosed()
      .subscribe((confirmed: boolean | undefined) => {
        if (!confirmed) {
          return;
        }

        this.deleteError.set(null);
        this.deletingIds.update((current) => new Set(current).add(department.id));

        this.departmentStore
          .deleteDepartment(department.id)
          .pipe(
            takeUntilDestroyed(this.destroyRef),
            finalize(() =>
              this.deletingIds.update((current) => {
                const next = new Set(current);
                next.delete(department.id);
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
