import { Component, OnInit, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';

import { SessionStore } from '../../../core/auth/session.store';
import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { createConfirmDelete } from '../../../shared/master-data/confirm-delete';
import { AttendanceFormDialogComponent, AttendanceFormDialogData } from '../attendance-form/attendance-form-dialog.component';
import { StatusLookupDialogComponent } from '../status-lookup/status-lookup-dialog.component';
import { AttendanceRecord, AttendanceSortField } from '../data-access/attendance.models';
import { AttendanceStore } from '../data-access/attendance.store';
import { recordDate } from '../data-access/attendance-status';
import { AttendanceFilters, AttendanceToolbarComponent } from './attendance-toolbar.component';
import { AttendanceTableComponent } from './attendance-table.component';

/**
 * Routed at `/attendance` (`attendance:read:any`: ADMIN and MANAGER). The attendance ledger: a
 * server-paginated table of records filtered by employee and date range, with create, correct and
 * delete gated on their own three permissions, and a status lookup for days that have no record.
 * The store is provided HERE, so every visit starts from the default filters.
 *
 * Loads the employee directory on entry (labels for the table, options for the pickers). A failed
 * load is deliberately NOT fatal to the list - rows just read "Unknown employee" - so it is a warning
 * with a Retry, never a replacement for the table. (The dialogs, where an employee is mandatory, are
 * where a failed load blocks.)
 */
@Component({
  selector: 'app-attendance-list-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
    AttendanceToolbarComponent,
    AttendanceTableComponent,
  ],
  providers: [AttendanceStore],
  templateUrl: './attendance-list-page.component.html',
  styleUrl: './attendance-list-page.component.scss',
})
export class AttendanceListPageComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly sessionStore = inject(SessionStore);
  protected readonly store = inject(AttendanceStore);
  protected readonly directory = inject(EmployeeDirectoryService);
  protected readonly icons = ICON_NAMES;

  private readonly confirmDelete = createConfirmDelete((id) => this.store.deleteRecord(id));
  protected readonly deleteError = this.confirmDelete.deleteError;
  protected readonly deletingIds = this.confirmDelete.deletingIds;

  protected readonly canCreate = computed(() => this.sessionStore.hasAnyPermission('attendance:create:any'));
  protected readonly canEdit = computed(() => this.sessionStore.hasAnyPermission('attendance:update:any'));
  protected readonly canDelete = computed(() => this.sessionStore.hasAnyPermission('attendance:delete:any'));

  /** The filters as the store holds them, handed back to the toolbar so its fields follow the store. */
  protected readonly filters = computed<AttendanceFilters>(() => {
    const { employeeId, dateFrom, dateTo } = this.store.query();
    return { employeeId, dateFrom, dateTo };
  });

  // Distinguishes "the ledger is empty" from "this filter matched nothing" - they need different copy.
  protected readonly hasActiveFilters = computed(() => {
    const { employeeId, dateFrom, dateTo } = this.filters();
    return Boolean(employeeId || dateFrom || dateTo);
  });

  ngOnInit(): void {
    this.store.loadList();
    // Display-only enrichment here: a failure is shown as a warning, never thrown.
    this.directory.refresh().subscribe({ error: () => undefined });
  }

  protected reloadDirectory(): void {
    this.directory.refresh().subscribe({ error: () => undefined });
  }

  protected onFiltersChange(filters: AttendanceFilters): void {
    this.store.setFilters(filters);
  }

  protected onPageChange(event: PageEvent): void {
    this.store.setPage(event.pageIndex + 1, event.pageSize);
  }

  protected onSortChange(sort: Sort): void {
    if (!sort.direction) {
      // MatSort's "cleared" third-click state - keep the previous sort rather than send no direction.
      return;
    }
    this.store.setSort(sort.active as AttendanceSortField, sort.direction);
  }

  protected openCreateDialog(): void {
    this.openFormDialog(null);
  }

  protected openEditDialog(record: AttendanceRecord): void {
    this.openFormDialog(record);
  }

  protected openLookupDialog(): void {
    this.dialog.open(StatusLookupDialogComponent, { width: '520px', maxWidth: '95vw' });
  }

  private openFormDialog(record: AttendanceRecord | null): void {
    this.dialog.open<AttendanceFormDialogComponent, AttendanceFormDialogData, AttendanceRecord>(
      AttendanceFormDialogComponent,
      { data: { record, store: this.store }, width: '520px', maxWidth: '95vw' },
    );
  }

  protected onDeleteRequested(record: AttendanceRecord): void {
    const day = recordDate(record.date).toLocaleDateString(undefined, { dateStyle: 'medium' });

    this.confirmDelete.request(record.id, {
      title: 'Delete attendance record',
      message: `Delete ${this.directory.labelOf(record.employeeId)}'s record for ${day}? Prefer correcting a record over deleting it; a deletion is written to the audit log.`,
    });
  }
}
