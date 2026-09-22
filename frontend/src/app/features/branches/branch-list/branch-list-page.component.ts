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
import { BranchFormDialogComponent, BranchFormDialogData } from '../branch-form/branch-form-dialog.component';
import { Branch, BranchSortField } from '../data-access/branch.models';
import { BranchStore } from '../data-access/branch.store';
import { BranchFilters, BranchToolbarComponent } from './branch-toolbar.component';
import { BranchTableComponent } from './branch-table.component';

/**
 * Smart, routed at `/branches` (§10/§9). Owns the create/edit dialog and
 * the delete confirmation flow - mirrors `EmployeeListPageComponent`, but
 * create/edit open `BranchFormDialogComponent` instead of navigating to a
 * separate route (Phase 2's approved dialog-based architecture).
 * `BranchStore.createBranch`/`updateBranch` already patch the `branches`
 * signal in their own `tap()`, so this page needs no `afterClosed()`
 * handling beyond opening the dialog.
 */
@Component({
  selector: 'app-branch-list-page',
  imports: [
    BranchToolbarComponent,
    BranchTableComponent,
    MatIconModule,
    MatButtonModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './branch-list-page.component.html',
  styleUrl: './branch-list-page.component.scss',
})
export class BranchListPageComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly branchStore = inject(BranchStore);
  protected readonly sessionStore = inject(SessionStore);
  protected readonly icons = ICON_NAMES;

  protected readonly deleteError = signal<string | null>(null);
  protected readonly deletingIds = signal<ReadonlySet<string>>(new Set());

  // Distinguishes "no branches exist at all" from "this filter/search
  // matched nothing" - the two need different EmptyStateComponent copy.
  protected readonly hasActiveFilters = computed(() => {
    const query = this.branchStore.query();
    return Boolean(query.search || query.status);
  });

  ngOnInit(): void {
    this.branchStore.loadList();
  }

  protected onFiltersChange(filters: BranchFilters): void {
    this.branchStore.setFilters(filters);
  }

  protected onPageChange(event: PageEvent): void {
    this.branchStore.setPage(event.pageIndex + 1, event.pageSize);
  }

  protected onSortChange(sort: Sort): void {
    if (!sort.direction) {
      // MatSort's "cleared" third-click state - keep the previous sort
      // rather than sending a request with no direction at all.
      return;
    }
    this.branchStore.setSort(sort.active as BranchSortField, sort.direction);
  }

  protected openCreateDialog(): void {
    this.dialog.open<BranchFormDialogComponent, BranchFormDialogData, Branch>(BranchFormDialogComponent, {
      data: { branch: null },
      width: '480px',
    });
  }

  protected openEditDialog(branch: Branch): void {
    this.dialog.open<BranchFormDialogComponent, BranchFormDialogData, Branch>(BranchFormDialogComponent, {
      data: { branch },
      width: '480px',
    });
  }

  protected onDeleteRequested(branch: Branch): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Delete branch',
          message: `Delete "${branch.name}"? This cannot be undone.`,
          confirmLabel: 'Delete',
        },
      })
      .afterClosed()
      .subscribe((confirmed: boolean | undefined) => {
        if (!confirmed) {
          return;
        }

        this.deleteError.set(null);
        this.deletingIds.update((current) => new Set(current).add(branch.id));

        this.branchStore
          .deleteBranch(branch.id)
          .pipe(
            takeUntilDestroyed(this.destroyRef),
            finalize(() =>
              this.deletingIds.update((current) => {
                const next = new Set(current);
                next.delete(branch.id);
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
