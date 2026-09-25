import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { Holiday, HolidayCalendar } from '../data-access/holiday-calendar.models';
import { HolidayCalendarService } from '../data-access/holiday-calendar.service';
import { HolidayService } from '../data-access/holiday.service';
import { HolidayFormDialogComponent } from '../holiday-form/holiday-form-dialog.component';
import { HolidayCalendarDetailPageComponent } from './holiday-calendar-detail-page.component';

const calendar = (overrides: Partial<HolidayCalendar> = {}): HolidayCalendar => ({
  id: 'cal-1',
  name: 'India Public Holidays',
  status: 'ACTIVE',
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
  ...overrides,
});

const holiday = (date: string, name: string, overrides: Partial<Holiday> = {}): Holiday => ({
  id: `h-${date}`,
  holidayCalendarId: 'cal-1',
  date: `${date}T00:00:00.000Z`,
  name,
  isOptional: false,
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
  ...overrides,
});

const httpError = (status: number, message: string) =>
  throwError(() => new HttpErrorResponse({ status, error: { status: 'error', message } }));

describe('HolidayCalendarDetailPageComponent', () => {
  const calendars = { getById: vi.fn() };
  const holidays = { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const dialog = { open: vi.fn() };
  const thisYear = new Date().getFullYear();

  const setup = (permissions: string[]): { fixture: ComponentFixture<HolidayCalendarDetailPageComponent>; el: HTMLElement } => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'cal-1' } } } },
        {
          provide: SessionStore,
          useValue: { hasAnyPermission: (...keys: string[]) => keys.some((key) => permissions.includes(key)) },
        },
        { provide: NotificationService, useValue: { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() } },
        { provide: HolidayCalendarService, useValue: calendars },
        { provide: HolidayService, useValue: holidays },
        { provide: MatDialog, useValue: dialog },
      ],
    });

    const fixture = TestBed.createComponent(HolidayCalendarDetailPageComponent);
    fixture.detectChanges();

    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const rowTexts = (el: HTMLElement) => [...el.querySelectorAll('tr.mat-mdc-row')].map((row) => row.textContent ?? '');

  beforeEach(() => {
    calendars.getById.mockReset();
    holidays.list.mockReset();
    holidays.delete.mockReset();
    dialog.open.mockReset();
    calendars.getById.mockReturnValue(of(calendar()));
    holidays.list.mockReturnValue(
      of([
        holiday(`${thisYear - 1}-01-26`, 'Republic Day (last year)'),
        holiday(`${thisYear}-01-26`, 'Republic Day'),
        holiday(`${thisYear}-08-15`, 'Independence Day'),
      ]),
    );
  });

  it("loads this route's calendar and its holidays and titles the page with the calendar's name", () => {
    const { el } = setup([]);

    expect(calendars.getById).toHaveBeenCalledWith('cal-1');
    expect(holidays.list).toHaveBeenCalledWith('cal-1');
    expect(el.querySelector('h1')?.textContent).toContain('India Public Holidays');
  });

  describe('holidays', () => {
    it('defaults to the current year, ordered as the server returned them, with the weekday in each date', () => {
      const { el } = setup([]);

      const rows = rowTexts(el);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toContain('Republic Day');
      expect(rows[0]).toContain(`26 Jan ${thisYear}`);
      expect(rows[1]).toContain('Independence Day');
      expect(rows[1]).toMatch(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun), 15 Aug/);
    });

    it('marks a holiday as Mandatory or Optional in words', () => {
      holidays.list.mockReturnValue(
        of([holiday(`${thisYear}-08-15`, 'Independence Day'), holiday(`${thisYear}-11-08`, 'Diwali', { isOptional: true })]),
      );

      const { el } = setup([]);

      expect(rowTexts(el)[0]).toContain('Mandatory');
      expect(rowTexts(el)[1]).toContain('Optional');
    });

    it('switches to another year and to all years', () => {
      const { fixture, el } = setup([]);
      const page = fixture.componentInstance as unknown as { onYearChange: (year: number | 'ALL') => void };

      page.onYearChange(thisYear - 1);
      fixture.detectChanges();
      expect(rowTexts(el)).toHaveLength(1);
      expect(rowTexts(el)[0]).toContain('Republic Day (last year)');

      page.onYearChange('ALL');
      fixture.detectChanges();
      expect(rowTexts(el)).toHaveLength(3);
    });

    it('says so when the calendar has no holidays yet, with wording that depends on the permission', () => {
      holidays.list.mockReturnValue(of([]));

      const editor = setup(['holidayCalendar:update']);
      expect(editor.el.querySelector('app-empty-state')?.textContent).toContain('Add the first holiday');
    });

    it('tells a read-only user nothing has been added yet, without inviting them to add', () => {
      holidays.list.mockReturnValue(of([]));

      const { el } = setup([]);

      expect(el.querySelector('app-empty-state')?.textContent).toContain('Nothing has been added');
    });
  });

  describe('permission gating', () => {
    it('is read-only without holidayCalendar:update (every role has :read): no Add, Edit or Delete', () => {
      const { el } = setup(['holidayCalendar:read']);

      expect(el.textContent).not.toContain('Add Holiday');
      expect(el.querySelectorAll('button[aria-label^="Edit "]')).toHaveLength(0);
      expect(el.querySelectorAll('button[aria-label^="Delete "]')).toHaveLength(0);
      expect(rowTexts(el)).toHaveLength(2);
    });

    it('offers Add, Edit and Delete with holidayCalendar:update (which also gates deleting a holiday)', () => {
      const { el } = setup(['holidayCalendar:update']);

      expect(el.textContent).toContain('Add Holiday');
      expect(el.querySelectorAll('button[aria-label^="Edit "]')).toHaveLength(2);
      expect(el.querySelectorAll('button[aria-label^="Delete "]')).toHaveLength(2);
    });

    it("does not treat the calendar's own delete permission as permission to change holidays", () => {
      const { el } = setup(['holidayCalendar:delete', 'holidayCalendar:create']);

      expect(el.textContent).not.toContain('Add Holiday');
      expect(el.querySelectorAll('button[aria-label^="Delete "]')).toHaveLength(0);
    });
  });

  describe('states', () => {
    it('shows an inactive calendar as inactive, with a warning that it cannot be assigned to new branches', () => {
      calendars.getById.mockReturnValue(of(calendar({ status: 'INACTIVE' })));

      const { el } = setup([]);

      expect(el.querySelector('mat-chip')?.textContent).toContain('Inactive');
      expect(el.querySelector('app-inline-banner')?.textContent).toContain("can't be assigned to new branches");
    });

    it('shows no warning for an active calendar', () => {
      const { el } = setup([]);

      expect(el.querySelector('app-inline-banner')).toBeNull();
    });

    it('says "not found" - not a generic error - when the calendar does not exist, and offers the way back', () => {
      calendars.getById.mockReturnValue(httpError(404, 'Holiday calendar not found'));
      holidays.list.mockReturnValue(httpError(404, 'Holiday calendar not found'));

      const { el } = setup([]);

      expect(el.querySelector('app-empty-state')?.textContent).toContain('Holiday calendar not found');
      expect(el.querySelector('app-inline-banner')).toBeNull();
      expect(el.querySelector('a[href="/holiday-calendars"]')).not.toBeNull();
    });

    it('shows any other load failure as an error banner with Retry, and Retry loads again', () => {
      calendars.getById.mockReturnValueOnce(httpError(500, 'boom'));
      holidays.list.mockReturnValueOnce(httpError(500, 'boom'));

      const { fixture, el } = setup([]);
      expect(el.querySelector('app-inline-banner')?.textContent).toContain('boom');

      el.querySelector<HTMLButtonElement>('app-inline-banner button')!.click();
      fixture.detectChanges();

      expect(calendars.getById).toHaveBeenCalledTimes(2);
      expect(el.querySelector('h1')?.textContent).toContain('India Public Holidays');
    });
  });

  describe('dialogs', () => {
    it('Add Holiday opens the holiday form in add mode, handing over the page\'s own store', () => {
      const { el } = setup(['holidayCalendar:update']);

      [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Add Holiday'))!.click();

      const [component, config] = dialog.open.mock.calls[0];
      expect(component).toBe(HolidayFormDialogComponent);
      expect(config.data.holiday).toBeNull();
      expect(config.data.store.addHoliday).toBeTypeOf('function');
    });

    it('Edit opens the holiday form with that holiday', () => {
      const { el } = setup(['holidayCalendar:update']);

      el.querySelector<HTMLButtonElement>('button[aria-label="Edit Independence Day"]')!.click();

      expect(dialog.open.mock.calls[0][1].data.holiday).toEqual(expect.objectContaining({ name: 'Independence Day' }));
    });
  });

  describe('delete flow', () => {
    it("asks first with the holiday's name and date, and deletes on the calendar's own holiday URL once confirmed", () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) });
      holidays.delete.mockReturnValue(of(undefined));
      const { el } = setup(['holidayCalendar:update']);

      el.querySelector<HTMLButtonElement>('button[aria-label="Delete Independence Day"]')!.click();

      const [component, config] = dialog.open.mock.calls[0];
      expect(component).toBe(ConfirmDialogComponent);
      expect(config.data.title).toBe('Delete holiday');
      expect(config.data.message).toContain('"Independence Day"');
      expect(config.data.message).toContain(`15 Aug ${thisYear}`);
      expect(holidays.delete).toHaveBeenCalledWith('cal-1', `h-${thisYear}-08-15`);
    });

    it('does nothing when the confirmation is cancelled', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });
      const { el } = setup(['holidayCalendar:update']);

      el.querySelector<HTMLButtonElement>('button[aria-label="Delete Independence Day"]')!.click();

      expect(holidays.delete).not.toHaveBeenCalled();
    });

    it("shows the backend's message when the delete is refused", () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) });
      holidays.delete.mockReturnValue(httpError(404, 'Holiday not found'));
      const { fixture, el } = setup(['holidayCalendar:update']);

      el.querySelector<HTMLButtonElement>('button[aria-label="Delete Independence Day"]')!.click();
      fixture.detectChanges();

      expect(el.querySelector('app-inline-banner')?.textContent).toContain('Holiday not found');
    });
  });
});
