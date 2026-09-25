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
import { HolidayCalendar, HolidayCalendarSortField } from '../data-access/holiday-calendar.models';
import { HolidayCalendarStore } from '../data-access/holiday-calendar.store';
import {
  HolidayCalendarFormDialogComponent,
  HolidayCalendarFormDialogData,
} from '../holiday-calendar-form/holiday-calendar-form-dialog.component';
import { HolidayCalendarTableComponent } from './holiday-calendar-table.component';

/**
 * Routed at `/holiday-calendars`. The smart shell of the list: owns the create/edit dialog,
 * reuses the shared master-data toolbar (search + status) and delete-confirmation flow, and shows
 * the calendar's own table. Like Shift it is not the shared `MasterDataListPageComponent` (no
 * `code`, own columns); unlike Shift, a row leads to a page of its own, where its holidays live.
 *
 * Permission gating is two-layer, as everywhere: the route checks `holidayCalendar:read` (in
 * `app.routes.ts`, granted to every role); this page checks `holidayCalendar:create` / `:update` /
 * `:delete` for the header button and each row's actions (ADMIN-only server-side).
 */
@Component({
  selector: 'app-holiday-calendar-list-page',
  imports: [
    MasterDataToolbarComponent,
    HolidayCalendarTableComponent,
    MatIconModule,
    MatButtonModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './holiday-calendar-list-page.component.html',
  styleUrl: './holiday-calendar-list-page.component.scss',
})
export class HolidayCalendarListPageComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly sessionStore = inject(SessionStore);
  protected readonly store = inject(HolidayCalendarStore);
  protected readonly icons = ICON_NAMES;

  private readonly confirmDelete = createConfirmDelete((id) => this.store.deleteRecord(id));
  protected readonly deleteError = this.confirmDelete.deleteError;
  protected readonly deletingIds = this.confirmDelete.deletingIds;

  protected readonly canCreate = computed(() => this.sessionStore.hasAnyPermission('holidayCalendar:create'));
  protected readonly canEdit = computed(() => this.sessionStore.hasAnyPermission('holidayCalendar:update'));
  protected readonly canDelete = computed(() => this.sessionStore.hasAnyPermission('holidayCalendar:delete'));

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
    this.store.setSort(sort.active as HolidayCalendarSortField, sort.direction);
  }

  protected openCreateDialog(): void {
    this.openFormDialog(null);
  }

  protected openEditDialog(calendar: HolidayCalendar): void {
    this.openFormDialog(calendar);
  }

  private openFormDialog(calendar: HolidayCalendar | null): void {
    this.dialog.open<HolidayCalendarFormDialogComponent, HolidayCalendarFormDialogData, HolidayCalendar>(
      HolidayCalendarFormDialogComponent,
      { data: { calendar }, width: '480px', maxWidth: '95vw' },
    );
  }

  protected onDeleteRequested(calendar: HolidayCalendar): void {
    this.confirmDelete.request(calendar.id, {
      title: 'Delete holiday calendar',
      // A calendar that any branch uses can never be deleted (the backend answers 409), so the copy
      // points at the real alternative up front - and says what a delete takes with it.
      message: `Delete "${calendar.name}" and all of its holidays? This cannot be undone. If any branch uses it, deactivate it instead (Edit → Status).`,
    });
  }
}
