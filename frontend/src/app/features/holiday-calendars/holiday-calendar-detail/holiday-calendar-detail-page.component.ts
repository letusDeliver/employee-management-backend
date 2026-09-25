import { Component, OnInit, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { SessionStore } from '../../../core/auth/session.store';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { createConfirmDelete } from '../../../shared/master-data/confirm-delete';
import { Holiday } from '../data-access/holiday-calendar.models';
import { YearFilter, formatHolidayDate } from '../data-access/holiday-date';
import { HolidayListStore } from '../data-access/holiday-list.store';
import { HolidayFormDialogComponent, HolidayFormDialogData } from '../holiday-form/holiday-form-dialog.component';
import { HolidayTableComponent } from './holiday-table.component';

/**
 * Routed at `/holiday-calendars/:id`. One calendar and its holidays. The store is provided HERE
 * (not in root), so every visit starts empty and the state is gone when the page is left.
 *
 * Read access (`holidayCalendar:read`) is every role's; adding, editing and removing a holiday
 * need `holidayCalendar:update` - note the backend gates holiday deletion on `:update`, not
 * `:delete` (that key is only for deleting the whole calendar). The calendar's own name and status
 * are edited from the list, in one place.
 */
@Component({
  selector: 'app-holiday-calendar-detail-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
    HolidayTableComponent,
  ],
  providers: [HolidayListStore],
  templateUrl: './holiday-calendar-detail-page.component.html',
  styleUrl: './holiday-calendar-detail-page.component.scss',
})
export class HolidayCalendarDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly sessionStore = inject(SessionStore);
  protected readonly store = inject(HolidayListStore);
  protected readonly icons = ICON_NAMES;

  private readonly calendarId = this.route.snapshot.paramMap.get('id') ?? '';

  private readonly confirmDelete = createConfirmDelete((id) => this.store.removeHoliday(id));
  protected readonly deleteError = this.confirmDelete.deleteError;
  protected readonly deletingIds = this.confirmDelete.deletingIds;

  protected readonly canEdit = computed(() => this.sessionStore.hasAnyPermission('holidayCalendar:update'));

  ngOnInit(): void {
    this.store.load(this.calendarId);
  }

  protected reload(): void {
    this.store.load(this.calendarId);
  }

  protected onYearChange(year: YearFilter): void {
    this.store.selectYear(year);
  }

  protected openAddDialog(): void {
    this.openFormDialog(null);
  }

  protected openEditDialog(holiday: Holiday): void {
    this.openFormDialog(holiday);
  }

  private openFormDialog(holiday: Holiday | null): void {
    this.dialog.open<HolidayFormDialogComponent, HolidayFormDialogData, Holiday>(HolidayFormDialogComponent, {
      data: { holiday, store: this.store },
      width: '480px',
      maxWidth: '95vw',
    });
  }

  protected onDeleteRequested(holiday: Holiday): void {
    this.confirmDelete.request(holiday.id, {
      title: 'Delete holiday',
      message: `Delete "${holiday.name}" (${formatHolidayDate(holiday.date)})? Branches using this calendar will no longer treat that date as a holiday.`,
    });
  }
}
