import { Component, OnInit, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';

import { SessionStore } from '../../../core/auth/session.store';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { createConfirmDelete } from '../../../shared/master-data/confirm-delete';
import { MasterDataFilters, MasterDataToolbarComponent } from '../../../shared/master-data/master-data-toolbar.component';
import { LeaveType, LeaveTypeSortField } from '../data-access/leave.models';
import { LeaveTypeStore } from '../data-access/leave-type.store';
import { LeaveTypeFormDialogComponent, LeaveTypeFormDialogData } from '../leave-type-form/leave-type-form-dialog.component';
import { LeaveTypeTableComponent } from './leave-type-table.component';

/**
 * Routed at `/leave-types`. The smart shell of the screen: owns the create/edit dialog, reuses the
 * shared master-data toolbar (search + status) and delete-confirmation flow, and shows Leave type's
 * own table.
 *
 * Permission gating is two-layer, as everywhere: the route checks `leaveType:read` (every role);
 * this page checks `leaveType:create` / `:update` / `:delete` for the header button and each row's
 * actions (ADMIN-only server-side).
 */
@Component({
  selector: 'app-leave-type-list-page',
  imports: [
    MasterDataToolbarComponent,
    LeaveTypeTableComponent,
    MatIconModule,
    MatButtonModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './leave-type-list-page.component.html',
  styleUrl: './leave-type-list-page.component.scss',
})
export class LeaveTypeListPageComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly sessionStore = inject(SessionStore);
  protected readonly store = inject(LeaveTypeStore);
  protected readonly icons = ICON_NAMES;

  private readonly confirmDelete = createConfirmDelete((id) => this.store.deleteRecord(id));
  protected readonly deleteError = this.confirmDelete.deleteError;
  protected readonly deletingIds = this.confirmDelete.deletingIds;

  protected readonly canCreate = computed(() => this.sessionStore.hasAnyPermission('leaveType:create'));
  protected readonly canEdit = computed(() => this.sessionStore.hasAnyPermission('leaveType:update'));
  protected readonly canDelete = computed(() => this.sessionStore.hasAnyPermission('leaveType:delete'));

  // Distinguishes "none exist at all" from "this filter/search matched nothing" - the two need
  // different EmptyStateComponent copy.
  protected readonly hasActiveFilters = computed(() => {
    const query = this.store.query();
    return Boolean(query.search || query.status);
  });

  ngOnInit(): void {
    this.store.loadList();
  }

  protected onFiltersChange(filters: MasterDataFilters): void {
    this.store.setFilters(filters);
  }

  protected onPageChange(event: PageEvent): void {
    this.store.setPage(event.pageIndex + 1, event.pageSize);
  }

  protected onSortChange(sort: Sort): void {
    if (!sort.direction) {
      // MatSort's "cleared" third-click state - keep the previous sort rather than sending a
      // request with no direction at all.
      return;
    }
    this.store.setSort(sort.active as LeaveTypeSortField, sort.direction);
  }

  protected openCreateDialog(): void {
    this.openFormDialog(null);
  }

  protected openEditDialog(leaveType: LeaveType): void {
    this.openFormDialog(leaveType);
  }

  private openFormDialog(leaveType: LeaveType | null): void {
    this.dialog.open<LeaveTypeFormDialogComponent, LeaveTypeFormDialogData, LeaveType>(LeaveTypeFormDialogComponent, {
      data: { leaveType },
      width: '480px',
      maxWidth: '95vw',
    });
  }

  protected onDeleteRequested(leaveType: LeaveType): void {
    this.confirmDelete.request(leaveType.id, {
      title: 'Delete leave type',
      // A type that any leave request or balance references can never be deleted, so the copy points
      // at the real alternative up front.
      message: `Delete "${leaveType.name}"? This cannot be undone. If any leave request or balance uses it, deactivate it instead (Edit → Status).`,
    });
  }
}
