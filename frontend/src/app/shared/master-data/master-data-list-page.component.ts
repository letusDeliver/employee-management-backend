import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LowerCasePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';
import { finalize } from 'rxjs';

import { SessionStore } from '../../core/auth/session.store';
import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../components/page-header/page-header.component';
import { ICON_NAMES } from '../icon-names';
import { extractErrorMessage } from '../utils/extract-error-message.util';
import {
  MasterDataFormDialogComponent,
  MasterDataFormDialogData,
} from './master-data-form-dialog.component';
import {
  CreateMasterDataRequest,
  MasterDataRecord,
  MasterDataSortField,
  UpdateMasterDataRequest,
} from './master-data.models';
import { MasterDataStore } from './master-data.store';
import { MasterDataFilters, MasterDataToolbarComponent } from './master-data-toolbar.component';
import { MasterDataTableComponent } from './master-data-table.component';

/**
 * The smart shell of a master-data screen (`/departments`, `/designations`,
 * ...): owns the create/edit dialog and the delete-confirmation flow. Each
 * domain keeps a tiny, explicit page component of its own that supplies only
 * what genuinely differs - its store (which carries the wording), an icon, a
 * permission prefix and an optional description - so routing and permissions
 * stay visible per domain rather than hidden behind a config-only route.
 *
 * Permission gating is two-layer, as everywhere: the route checks `<prefix>:read`
 * (in `app.routes.ts`); this page checks `<prefix>:create`/`:update`/`:delete`
 * for the header button and each row's actions.
 */
@Component({
  selector: 'app-master-data-list-page',
  imports: [
    LowerCasePipe,
    MasterDataToolbarComponent,
    MasterDataTableComponent,
    MatIconModule,
    MatButtonModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './master-data-list-page.component.html',
  styleUrl: './master-data-list-page.component.scss',
})
export class MasterDataListPageComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sessionStore = inject(SessionStore);
  protected readonly icons = ICON_NAMES;

  readonly store = input.required<MasterDataStore<MasterDataRecord, CreateMasterDataRequest, UpdateMasterDataRequest>>();
  readonly icon = input.required<string>();
  /** e.g. `department` - the prefix of `department:create` / `:update` / `:delete`. */
  readonly permissionPrefix = input.required<string>();
  readonly description = input<string>();

  protected readonly labels = computed(() => this.store().labels);
  protected readonly canCreate = computed(() => this.sessionStore.hasAnyPermission(`${this.permissionPrefix()}:create`));
  protected readonly canEdit = computed(() => this.sessionStore.hasAnyPermission(`${this.permissionPrefix()}:update`));
  protected readonly canDelete = computed(() => this.sessionStore.hasAnyPermission(`${this.permissionPrefix()}:delete`));

  protected readonly deleteError = signal<string | null>(null);
  protected readonly deletingIds = signal<ReadonlySet<string>>(new Set());

  // Distinguishes "none exist at all" from "this filter/search matched
  // nothing" - the two need different EmptyStateComponent copy.
  protected readonly hasActiveFilters = computed(() => {
    const query = this.store().query();
    return Boolean(query.search || query.status);
  });

  ngOnInit(): void {
    this.store().loadList();
  }

  protected onFiltersChange(filters: MasterDataFilters): void {
    this.store().setFilters(filters);
  }

  protected onPageChange(event: PageEvent): void {
    this.store().setPage(event.pageIndex + 1, event.pageSize);
  }

  protected onSortChange(sort: Sort): void {
    if (!sort.direction) {
      // MatSort's "cleared" third-click state - keep the previous sort
      // rather than sending a request with no direction at all.
      return;
    }
    this.store().setSort(sort.active as MasterDataSortField, sort.direction);
  }

  protected openCreateDialog(): void {
    this.openFormDialog(null);
  }

  protected openEditDialog(record: MasterDataRecord): void {
    this.openFormDialog(record);
  }

  private openFormDialog(record: MasterDataRecord | null): void {
    this.dialog.open<MasterDataFormDialogComponent, MasterDataFormDialogData, MasterDataRecord>(
      MasterDataFormDialogComponent,
      { data: { record, store: this.store() }, width: '480px', maxWidth: '95vw' },
    );
  }

  protected onDeleteRequested(record: MasterDataRecord): void {
    const { singular } = this.labels();

    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: `Delete ${singular.toLowerCase()}`,
          // A mandatory-FK record that has ever had an employee assigned can
          // never be deleted (soft-deleted employees count too), so the copy
          // points at the real alternative up front.
          message: `Delete "${record.name}"? This cannot be undone. If employees have ever been assigned to it, deactivate it instead (Edit → Status).`,
          confirmLabel: 'Delete',
        },
      })
      .afterClosed()
      .subscribe((confirmed: boolean | undefined) => {
        if (!confirmed) {
          return;
        }

        this.deleteError.set(null);
        this.deletingIds.update((current) => new Set(current).add(record.id));

        this.store()
          .deleteRecord(record.id)
          .pipe(
            takeUntilDestroyed(this.destroyRef),
            finalize(() =>
              this.deletingIds.update((current) => {
                const next = new Set(current);
                next.delete(record.id);
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
