import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { HolidayCalendar } from '../data-access/holiday-calendar.models';
import { HolidayCalendarService } from '../data-access/holiday-calendar.service';
import { HolidayCalendarStore } from '../data-access/holiday-calendar.store';
import { HolidayCalendarFormDialogComponent } from '../holiday-calendar-form/holiday-calendar-form-dialog.component';
import { HolidayCalendarListPageComponent } from './holiday-calendar-list-page.component';

const calendar = (overrides: Partial<HolidayCalendar> = {}): HolidayCalendar => ({
  id: 'cal-1',
  name: 'India Public Holidays',
  status: 'ACTIVE',
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
  ...overrides,
});

const page = (items: HolidayCalendar[]) => ({ items, pagination: { page: 1, limit: 10, total: items.length, totalPages: 1 } });

describe('HolidayCalendarListPageComponent', () => {
  const api = { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const dialog = { open: vi.fn() };

  const setup = (
    permissions: string[],
  ): { fixture: ComponentFixture<HolidayCalendarListPageComponent>; el: HTMLElement; store: HolidayCalendarStore } => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: SessionStore,
          useValue: { hasAnyPermission: (...keys: string[]) => keys.some((key) => permissions.includes(key)) },
        },
        { provide: NotificationService, useValue: { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() } },
        { provide: HolidayCalendarService, useValue: api },
        { provide: MatDialog, useValue: dialog },
      ],
    });

    const fixture = TestBed.createComponent(HolidayCalendarListPageComponent);
    fixture.detectChanges();

    return { fixture, el: fixture.nativeElement as HTMLElement, store: TestBed.inject(HolidayCalendarStore) };
  };

  const confirmDialogReturns = (confirmed: boolean) => dialog.open.mockReturnValue({ afterClosed: () => of(confirmed) });

  beforeEach(() => {
    api.list.mockReset();
    api.delete.mockReset();
    dialog.open.mockReset();
    api.list.mockReturnValue(of(page([calendar(), calendar({ id: 'cal-2', name: 'US Public Holidays', status: 'INACTIVE' })])));
  });

  it('loads the list on init and titles the page', () => {
    const { el } = setup([]);

    expect(api.list).toHaveBeenCalledTimes(1);
    expect(el.querySelector('h1')?.textContent).toContain('Holiday calendars');
    expect(el.querySelectorAll('tr.mat-mdc-row')).toHaveLength(2);
  });

  it("links each calendar's name to its own page", () => {
    const { el } = setup([]);

    const link = el.querySelector<HTMLAnchorElement>('a[aria-label="View holidays of US Public Holidays"]')!;

    expect(link.getAttribute('href')).toBe('/holiday-calendars/cal-2');
    expect(link.textContent).toContain('US Public Holidays');
  });

  describe('permission gating', () => {
    it('hides New, Edit and Delete without holidayCalendar:create/update/delete (every role has :read)', () => {
      const { el } = setup(['holidayCalendar:read']);

      expect(el.textContent).not.toContain('New Calendar');
      expect(el.querySelectorAll('button[aria-label^="Edit "]')).toHaveLength(0);
      expect(el.querySelectorAll('button[aria-label^="Delete "]')).toHaveLength(0);
      // Read-only users can still open a calendar.
      expect(el.querySelectorAll('a[aria-label^="View holidays of "]')).toHaveLength(2);
    });

    it('shows New, Edit and Delete with the matching permissions', () => {
      const { el } = setup(['holidayCalendar:create', 'holidayCalendar:update', 'holidayCalendar:delete']);

      expect(el.textContent).toContain('New Calendar');
      expect(el.querySelectorAll('button[aria-label^="Edit "]')).toHaveLength(2);
      expect(el.querySelectorAll('button[aria-label^="Delete "]')).toHaveLength(2);
    });

    it("does not honour another domain's permission keys", () => {
      const { el } = setup(['shift:create', 'shift:update', 'shift:delete', 'branch:update']);

      expect(el.textContent).not.toContain('New Calendar');
      expect(el.querySelectorAll('button[aria-label^="Edit "]')).toHaveLength(0);
      expect(el.querySelectorAll('button[aria-label^="Delete "]')).toHaveLength(0);
    });
  });

  describe('empty and error states', () => {
    it('says "No holiday calendars yet" when nothing exists', () => {
      api.list.mockReturnValue(of(page([])));

      const { el } = setup([]);

      expect(el.querySelector('app-empty-state')?.textContent).toContain('No holiday calendars yet');
    });

    it('says the filter matched nothing once a filter is active', () => {
      api.list.mockReturnValue(of(page([])));
      const { fixture, el, store } = setup([]);

      store.setFilters({ search: 'zzz' });
      fixture.detectChanges();

      expect(el.querySelector('app-empty-state')?.textContent).toContain('No holiday calendars match your filters');
    });

    it("shows the store's load error in a banner", () => {
      api.list.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500, error: { status: 'error', message: 'boom' } })),
      );

      const { el } = setup([]);

      expect(el.querySelector('app-inline-banner')?.textContent).toContain('boom');
    });
  });

  describe('dialogs', () => {
    it('New opens the calendar form dialog in create mode', () => {
      const { el } = setup(['holidayCalendar:create']);

      [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('New Calendar'))!.click();

      expect(dialog.open).toHaveBeenCalledWith(
        HolidayCalendarFormDialogComponent,
        expect.objectContaining({ data: { calendar: null } }),
      );
    });

    it('Edit opens the dialog with that calendar', () => {
      const { el } = setup(['holidayCalendar:update']);

      el.querySelector<HTMLButtonElement>('button[aria-label="Edit US Public Holidays"]')!.click();

      expect(dialog.open).toHaveBeenCalledWith(
        HolidayCalendarFormDialogComponent,
        expect.objectContaining({ data: { calendar: expect.objectContaining({ id: 'cal-2' }) } }),
      );
    });
  });

  describe('sorting', () => {
    it('sorts by the columns the calendar owns and ignores the cleared third-click state', () => {
      const { fixture } = setup([]);
      const page$ = fixture.componentInstance as unknown as { onSortChange: (s: { active: string; direction: string }) => void };

      page$.onSortChange({ active: 'name', direction: 'asc' });
      expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: 'name', order: 'asc' }));

      const calls = api.list.mock.calls.length;
      page$.onSortChange({ active: 'name', direction: '' });
      expect(api.list.mock.calls.length).toBe(calls);
    });
  });

  describe('delete flow', () => {
    it('asks first, says the holidays go with it and that deactivating is the alternative, and deletes only when confirmed', () => {
      confirmDialogReturns(true);
      api.delete.mockReturnValue(of(undefined));
      const { el } = setup(['holidayCalendar:delete']);

      el.querySelector<HTMLButtonElement>('button[aria-label="Delete India Public Holidays"]')!.click();

      const [component, config] = dialog.open.mock.calls[0];
      expect(component).toBe(ConfirmDialogComponent);
      expect(config.data.title).toBe('Delete holiday calendar');
      expect(config.data.message).toContain('"India Public Holidays"');
      expect(config.data.message).toContain('all of its holidays');
      expect(config.data.message).toContain('deactivate it instead');
      expect(api.delete).toHaveBeenCalledWith('cal-1');
    });

    it('does nothing when the confirmation is cancelled', () => {
      confirmDialogReturns(false);
      const { el } = setup(['holidayCalendar:delete']);

      el.querySelector<HTMLButtonElement>('button[aria-label="Delete India Public Holidays"]')!.click();

      expect(api.delete).not.toHaveBeenCalled();
    });

    it("shows the backend's message and keeps the row when a branch uses the calendar (409)", () => {
      confirmDialogReturns(true);
      api.delete.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: {
                status: 'error',
                message: 'This holiday calendar has Branch records referencing it and cannot be deleted - deactivate it instead',
              },
            }),
        ),
      );
      const { fixture, el } = setup(['holidayCalendar:delete']);

      el.querySelector<HTMLButtonElement>('button[aria-label="Delete India Public Holidays"]')!.click();
      fixture.detectChanges();

      expect(el.querySelector('app-inline-banner')?.textContent).toContain('Branch records referencing it');
      expect(el.querySelector('button[aria-label="Delete India Public Holidays"]')).not.toBeNull();
    });
  });
});
