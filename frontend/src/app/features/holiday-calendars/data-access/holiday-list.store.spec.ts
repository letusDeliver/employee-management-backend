import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { NotificationService } from '../../../core/notifications/notification.service';
import { Holiday, HolidayCalendar } from './holiday-calendar.models';
import { HolidayListStore } from './holiday-list.store';

const calendar: HolidayCalendar = {
  id: 'cal-1',
  name: 'India Public Holidays',
  status: 'ACTIVE',
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
};

const holiday = (date: string, id = `h-${date}`): Holiday => ({
  id,
  holidayCalendarId: 'cal-1',
  date: `${date}T00:00:00.000Z`,
  name: `Holiday ${date}`,
  isOptional: false,
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
});

describe('HolidayListStore', () => {
  let store: HolidayListStore;
  let http: HttpTestingController;
  const notifications = { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() };

  const expectCalendar = (): TestRequest => http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/holiday-calendars/cal-1'));
  const expectHolidays = (): TestRequest =>
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/holiday-calendars/cal-1/holidays'));

  const loaded = (holidays: Holiday[]): void => {
    store.load('cal-1');
    expectCalendar().flush({ holidayCalendar: calendar });
    expectHolidays().flush({ holidays });
  };

  beforeEach(() => {
    notifications.showSuccess.mockReset();

    TestBed.configureTestingModule({
      providers: [HolidayListStore, provideHttpClient(), provideHttpClientTesting(), { provide: NotificationService, useValue: notifications }],
    });

    store = TestBed.inject(HolidayListStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('load', () => {
    it('loads the calendar and its holidays together and stops loading', () => {
      store.load('cal-1');
      expect(store.loading()).toBe(true);

      expectCalendar().flush({ holidayCalendar: calendar });
      expectHolidays().flush({ holidays: [holiday('2026-08-15')] });

      expect(store.calendar()?.name).toBe('India Public Holidays');
      expect(store.holidays()).toHaveLength(1);
      expect(store.loading()).toBe(false);
      expect(store.error()).toBeNull();
    });

    it('reports a missing calendar as notFound, not as a load error', () => {
      store.load('cal-1');

      // forkJoin cancels the sibling request as soon as one of them fails.
      const holidays = expectHolidays();
      expectCalendar().flush({ status: 'error', message: 'Holiday calendar not found' }, { status: 404, statusText: 'Not Found' });
      expect(holidays.cancelled).toBe(true);

      expect(store.notFound()).toBe(true);
      expect(store.error()).toBeNull();
      expect(store.loading()).toBe(false);
    });

    it('reports any other failure as an error message', () => {
      store.load('cal-1');

      const holidays = expectHolidays();
      expectCalendar().flush({ status: 'error', message: 'boom' }, { status: 500, statusText: 'Server Error' });
      expect(holidays.cancelled).toBe(true);

      expect(store.error()).toBe('boom');
      expect(store.notFound()).toBe(false);
    });

    it('lets only the latest load write to state', () => {
      store.load('cal-1');
      const first = { calendar: expectCalendar(), holidays: expectHolidays() };

      store.load('cal-1');

      expect(first.calendar.cancelled).toBe(true);
      expect(first.holidays.cancelled).toBe(true);
      expectCalendar().flush({ holidayCalendar: calendar });
      expectHolidays().flush({ holidays: [holiday('2026-08-15')] });
      expect(store.holidays()).toHaveLength(1);
      expect(store.loading()).toBe(false);
    });
  });

  describe('year filter', () => {
    const thisYear = new Date().getFullYear();

    it('defaults to the current year when it has entries, and offers every year with entries', () => {
      loaded([holiday(`${thisYear - 1}-01-26`), holiday(`${thisYear}-08-15`), holiday(`${thisYear + 1}-01-01`)]);

      expect(store.years()).toEqual([thisYear + 1, thisYear, thisYear - 1]);
      expect(store.selectedYear()).toBe(thisYear);
      expect(store.visibleHolidays().map((h) => h.date.slice(0, 10))).toEqual([`${thisYear}-08-15`]);
    });

    it('falls back to the newest year when the current year has no entries', () => {
      loaded([holiday('2019-01-26'), holiday('2018-08-15')]);

      expect(store.selectedYear()).toBe(2019);
      expect(store.visibleHolidays()).toHaveLength(1);
    });

    it('shows everything on request, and honours an explicit year', () => {
      loaded([holiday('2019-01-26'), holiday('2018-08-15')]);

      store.selectYear('ALL');
      expect(store.visibleHolidays()).toHaveLength(2);

      store.selectYear(2018);
      expect(store.visibleHolidays().map((h) => h.date.slice(0, 10))).toEqual(['2018-08-15']);
    });

    it('drops a chosen year that no longer has entries back to the default', () => {
      loaded([holiday('2019-01-26'), holiday('2018-08-15')]);
      store.selectYear(2018);

      store.removeHoliday('h-2018-08-15').subscribe();
      http.expectOne((r) => r.method === 'DELETE').flush({ message: 'ok' });
      expectHolidays().flush({ holidays: [holiday('2019-01-26')] });

      expect(store.selectedYear()).toBe(2019);
    });
  });

  describe('mutations', () => {
    it('adds via POST, toasts, refetches, and switches the filter to the new holiday\'s year', () => {
      loaded([holiday('2019-01-26')]);
      const body = { date: '2027-01-01', name: 'New Year', isOptional: true };

      let created: Holiday | undefined;
      store.addHoliday(body).subscribe((result) => (created = result));

      const post = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/holiday-calendars/cal-1/holidays'));
      expect(post.request.body).toEqual(body);
      post.flush({ holiday: holiday('2027-01-01', 'h-new') });

      expect(created?.id).toBe('h-new');
      expect(notifications.showSuccess).toHaveBeenCalledWith('Holiday added successfully.');
      // The chosen year only takes effect once the refetch brings that year's entries in.
      expectHolidays().flush({ holidays: [holiday('2019-01-26'), holiday('2027-01-01', 'h-new')] });
      expect(store.selectedYear()).toBe(2027);
      expect(store.visibleHolidays().map((h) => h.id)).toEqual(['h-new']);
    });

    it('updates via PATCH on the holiday\'s own URL with only the fields given, then refetches', () => {
      loaded([holiday('2019-01-26', 'h-1')]);

      store.updateHoliday('h-1', { name: 'Republic Day' }).subscribe();

      const patch = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/holiday-calendars/cal-1/holidays/h-1'));
      expect(patch.request.body).toEqual({ name: 'Republic Day' });
      patch.flush({ holiday: { ...holiday('2019-01-26', 'h-1'), name: 'Republic Day' } });

      expect(notifications.showSuccess).toHaveBeenCalledWith('Holiday updated successfully.');
      expectHolidays().flush({ holidays: [{ ...holiday('2019-01-26', 'h-1'), name: 'Republic Day' }] });
      expect(store.holidays()[0].name).toBe('Republic Day');
    });

    it('removes via DELETE on the holiday\'s own URL, toasts, then refetches', () => {
      loaded([holiday('2019-01-26', 'h-1')]);

      store.removeHoliday('h-1').subscribe();

      http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/holiday-calendars/cal-1/holidays/h-1')).flush({ message: 'ok' });

      expect(notifications.showSuccess).toHaveBeenCalledWith('Holiday deleted successfully.');
      expectHolidays().flush({ holidays: [] });
      expect(store.holidays()).toEqual([]);
    });

    it('surfaces a rejected add (409 duplicate date) to the caller and does not refetch or toast', () => {
      loaded([holiday('2019-01-26')]);
      let message: string | undefined;

      store.addHoliday({ date: '2019-01-26', name: 'Dup', isOptional: false }).subscribe({
        error: (error: { error: { message: string } }) => (message = error.error.message),
      });

      http
        .expectOne((r) => r.method === 'POST')
        .flush({ status: 'error', message: 'A holiday already exists on this date in this calendar' }, { status: 409, statusText: 'Conflict' });

      expect(message).toContain('already exists on this date');
      expect(notifications.showSuccess).not.toHaveBeenCalled();
    });

    it('refuses a mutation before a calendar was loaded', () => {
      expect(() => store.addHoliday({ date: '2026-01-01', name: 'x', isOptional: false })).toThrow(/load\(\)/);
    });
  });
});
