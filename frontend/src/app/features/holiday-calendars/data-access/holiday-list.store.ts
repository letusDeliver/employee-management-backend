import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subscription, finalize, forkJoin, tap } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import {
  CreateHolidayRequest,
  Holiday,
  HolidayCalendar,
  UpdateHolidayRequest,
} from './holiday-calendar.models';
import { HolidayCalendarService } from './holiday-calendar.service';
import { YearFilter, defaultYear, filterByYear, holidayYear, holidayYears } from './holiday-date';
import { HolidayService } from './holiday.service';

/**
 * The state of ONE calendar's detail page: the calendar itself and its holidays. Provided by the
 * page component (not `providedIn: 'root'`), so each visit starts empty and nothing leaks from a
 * previously opened calendar. The holiday list is small and unpaginated (a handful of entries a
 * year), so it is loaded whole and the year filter is applied client-side.
 *
 * Like `MasterDataStore`, every successful mutation REFETCHES the holidays instead of patching
 * the array: the server owns the date ordering, and a locally patched row could land in the
 * wrong place. A refetch also keeps the store trusting only the server's response (§6).
 */
@Injectable()
export class HolidayListStore {
  private readonly calendarApi = inject(HolidayCalendarService);
  private readonly holidayApi = inject(HolidayService);
  private readonly notifications = inject(NotificationService);

  readonly calendar = signal<HolidayCalendar | null>(null);
  readonly holidays = signal<Holiday[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** The calendar does not exist (or was deleted meanwhile) - a different screen from a load error. */
  readonly notFound = signal(false);

  // `null` = the user has not chosen; the default (see `defaultYear`) applies.
  private readonly yearChoice = signal<YearFilter | null>(null);

  readonly years = computed(() => holidayYears(this.holidays()));

  /** The year actually shown. A stale choice (that year no longer has entries) falls back to the default. */
  readonly selectedYear = computed<YearFilter>(() => {
    const choice = this.yearChoice();
    const years = this.years();
    if (choice === 'ALL' || (choice !== null && years.includes(choice))) {
      return choice;
    }
    return defaultYear(years);
  });

  readonly visibleHolidays = computed(() => filterByYear(this.holidays(), this.selectedYear()));

  // Only the latest load may write to state; unsubscribing first runs the old request's finalize.
  private loadSubscription: Subscription | null = null;
  private calendarId: string | null = null;

  load(calendarId: string): void {
    this.calendarId = calendarId;
    this.loadSubscription?.unsubscribe();
    this.error.set(null);
    this.notFound.set(false);
    this.loading.set(true);

    this.loadSubscription = forkJoin({
      calendar: this.calendarApi.getById(calendarId),
      holidays: this.holidayApi.list(calendarId),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ calendar, holidays }) => {
          this.calendar.set(calendar);
          this.holidays.set(holidays);
        },
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.notFound.set(true);
          } else {
            this.error.set(extractErrorMessage(error));
          }
        },
      });
  }

  selectYear(year: YearFilter): void {
    this.yearChoice.set(year);
  }

  addHoliday(request: CreateHolidayRequest): Observable<Holiday> {
    return this.holidayApi.create(this.requireCalendarId(), request).pipe(
      tap((holiday) => {
        this.notifications.showSuccess('Holiday added successfully.');
        this.showYearOf(holiday);
        this.reloadHolidays();
      }),
    );
  }

  updateHoliday(holidayId: string, request: UpdateHolidayRequest): Observable<Holiday> {
    return this.holidayApi.update(this.requireCalendarId(), holidayId, request).pipe(
      tap((holiday) => {
        this.notifications.showSuccess('Holiday updated successfully.');
        this.showYearOf(holiday);
        this.reloadHolidays();
      }),
    );
  }

  removeHoliday(holidayId: string): Observable<void> {
    return this.holidayApi.delete(this.requireCalendarId(), holidayId).pipe(
      tap(() => {
        this.notifications.showSuccess('Holiday deleted successfully.');
        this.reloadHolidays();
      }),
    );
  }

  // A holiday just added or moved into another year would otherwise vanish behind the active
  // year filter and look like the save had not worked.
  private showYearOf(holiday: Holiday): void {
    this.yearChoice.set(holidayYear(holiday));
  }

  private reloadHolidays(): void {
    const calendarId = this.requireCalendarId();
    this.loadSubscription?.unsubscribe();
    this.loading.set(true);

    this.loadSubscription = this.holidayApi
      .list(calendarId)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (holidays) => this.holidays.set(holidays),
        error: (error: unknown) => this.error.set(extractErrorMessage(error)),
      });
  }

  private requireCalendarId(): string {
    if (this.calendarId === null) {
      throw new Error('HolidayListStore.load() must be called before any mutation.');
    }
    return this.calendarId;
  }
}
