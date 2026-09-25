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
import { Shift, ShiftSortField } from '../data-access/shift.models';
import { ShiftStore } from '../data-access/shift.store';
import { ShiftFormDialogComponent, ShiftFormDialogData } from '../shift-form/shift-form-dialog.component';
import { ShiftTableComponent } from './shift-table.component';

/**
 * Routed at `/shifts`. The smart shell of the screen: owns the create/edit dialog, reuses the
 * shared master-data toolbar (search + status) and delete-confirmation flow, and shows Shift's
 * own table. The dialog and table are deliberately NOT shared with
 * `MasterDataListPageComponent` - Shift is the first domain whose dialog and columns differ
 * from the `code`-based shape, and the small duplication here is the price of not bending
 * the shared page around one case.
 *
 * Permission gating is two-layer, as everywhere: the route checks `shift:read` (in
 * `app.routes.ts`); this page checks `shift:create` / `:update` / `:delete` for the header
 * button and each row's actions (ADMIN-only server-side).
 */
@Component({
  selector: 'app-shift-list-page',
  imports: [
    MasterDataToolbarComponent,
    ShiftTableComponent,
    MatIconModule,
    MatButtonModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './shift-list-page.component.html',
  styleUrl: './shift-list-page.component.scss',
})
export class ShiftListPageComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly sessionStore = inject(SessionStore);
  protected readonly store = inject(ShiftStore);
  protected readonly icons = ICON_NAMES;

  private readonly confirmDelete = createConfirmDelete((id) => this.store.deleteRecord(id));
  protected readonly deleteError = this.confirmDelete.deleteError;
  protected readonly deletingIds = this.confirmDelete.deletingIds;

  protected readonly canCreate = computed(() => this.sessionStore.hasAnyPermission('shift:create'));
  protected readonly canEdit = computed(() => this.sessionStore.hasAnyPermission('shift:update'));
  protected readonly canDelete = computed(() => this.sessionStore.hasAnyPermission('shift:delete'));

  // Distinguishes "none exist at all" from "this filter/search matched nothing" - the two
  // need different EmptyStateComponent copy.
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
      // MatSort's "cleared" third-click state - keep the previous sort rather than sending
      // a request with no direction at all.
      return;
    }
    this.store.setSort(sort.active as ShiftSortField, sort.direction);
  }

  protected openCreateDialog(): void {
    this.openFormDialog(null);
  }

  protected openEditDialog(shift: Shift): void {
    this.openFormDialog(shift);
  }

  private openFormDialog(shift: Shift | null): void {
    this.dialog.open<ShiftFormDialogComponent, ShiftFormDialogData, Shift>(ShiftFormDialogComponent, {
      data: { shift },
      width: '480px',
      maxWidth: '95vw',
    });
  }

  protected onDeleteRequested(shift: Shift): void {
    this.confirmDelete.request(shift.id, {
      title: 'Delete shift',
      // A shift that has ever had an employee assigned can never be deleted (soft-deleted
      // employees count too), so the copy points at the real alternative up front.
      message: `Delete "${shift.name}"? This cannot be undone. If employees have ever been assigned to it, deactivate it instead (Edit → Status).`,
    });
  }
}
