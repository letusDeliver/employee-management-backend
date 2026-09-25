import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { NotificationService } from '../../../core/notifications/notification.service';
import { HolidayCalendar } from './holiday-calendar.models';
import { HolidayCalendarStore } from './holiday-calendar.store';

const calendar = (overrides: Partial<HolidayCalendar> = {}): HolidayCalendar => ({
  id: 'cal-1',
  name: 'India Public Holidays',
  status: 'ACTIVE',
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
  ...overrides,
});

const pagination = { page: 1, limit: 10, total: 1, totalPages: 1 };

/**
 * Wiring spec: the shared behaviour (refetch, cancellation, step-back) is proven once in
 * `master-data.store.spec.ts`. This spec proves what is the calendar's own - its endpoint, its
 * `holidayCalendars`/`holidayCalendar` response keys, its request bodies (no `code`), its sort
 * whitelist and its wording.
 */
describe('HolidayCalendarStore (Holiday calendar wiring)', () => {
  let store: HolidayCalendarStore;
  let http: HttpTestingController;
  const notifications = { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() };

  const expectList = (): TestRequest =>
    http.expectOne((req) => req.method === 'GET' && req.url.endsWith('/holiday-calendars'));

  beforeEach(() => {
    notifications.showSuccess.mockReset();

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: NotificationService, useValue: notifications }],
    });

    store = TestBed.inject(HolidayCalendarStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('has its own wording', () => {
    expect(store.labels).toEqual({ singular: 'Holiday calendar', plural: 'Holiday calendars' });
  });

  it('lists from GET /holiday-calendars with the query params and maps `holidayCalendars` into items', () => {
    store.setFilters({ search: 'india', status: 'ACTIVE' });

    const request = expectList();
    expect(request.request.params.get('search')).toBe('india');
    expect(request.request.params.get('status')).toBe('ACTIVE');
    expect(request.request.params.get('sortBy')).toBe('createdAt');
    request.flush({ holidayCalendars: [calendar()], pagination: { ...pagination, total: 21, totalPages: 3 } });

    expect(store.items()).toHaveLength(1);
    expect(store.items()[0].name).toBe('India Public Holidays');
    expect(store.pagination().total).toBe(21);
  });

  it('creates via POST /holiday-calendars with just a name, toasts, then refetches', () => {
    let created: HolidayCalendar | undefined;
    store.createRecord({ name: 'US Public Holidays' }).subscribe((result) => (created = result));

    const post = http.expectOne((req) => req.method === 'POST' && req.url.endsWith('/holiday-calendars'));
    expect(post.request.body).toEqual({ name: 'US Public Holidays' });
    post.flush({ holidayCalendar: calendar({ id: 'cal-2', name: 'US Public Holidays' }) });

    expect(created?.id).toBe('cal-2');
    expect(notifications.showSuccess).toHaveBeenCalledWith('Holiday calendar created successfully.');
    expectList().flush({ holidayCalendars: [], pagination });
  });

  it('updates via PATCH /holiday-calendars/:id with only the fields given', () => {
    store.updateRecord('cal-1', { status: 'INACTIVE' }).subscribe();

    const patch = http.expectOne((req) => req.method === 'PATCH' && req.url.endsWith('/holiday-calendars/cal-1'));
    expect(patch.request.body).toEqual({ status: 'INACTIVE' });
    patch.flush({ holidayCalendar: calendar({ status: 'INACTIVE' }) });

    expect(notifications.showSuccess).toHaveBeenCalledWith('Holiday calendar updated successfully.');
    expectList().flush({ holidayCalendars: [], pagination });
  });

  it('deletes via DELETE /holiday-calendars/:id, toasts, then refetches', () => {
    store.deleteRecord('cal-1').subscribe();

    http.expectOne((req) => req.method === 'DELETE' && req.url.endsWith('/holiday-calendars/cal-1')).flush({ message: 'ok' });

    expect(notifications.showSuccess).toHaveBeenCalledWith('Holiday calendar deleted successfully.');
    expectList().flush({ holidayCalendars: [], pagination });
  });
});
