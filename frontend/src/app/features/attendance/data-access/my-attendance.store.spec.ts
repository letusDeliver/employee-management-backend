import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { NotificationService } from '../../../core/notifications/notification.service';
import { AttendanceRecord, EffectiveStatus } from './attendance.models';
import { MyAttendanceStore } from './my-attendance.store';

const record = (overrides: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
  id: 'a-1',
  employeeId: 'e-1',
  date: '2026-09-15T00:00:00.000Z',
  checkIn: '2026-09-15T09:05:00.000Z',
  checkOut: null,
  isHalfDay: false,
  createdAt: '2026-09-15T09:05:00.000Z',
  updatedAt: '2026-09-15T09:05:00.000Z',
  ...overrides,
});

const status = (value: EffectiveStatus, rec: AttendanceRecord | null, date = '2026-09-15') => ({
  employeeId: 'e-1',
  date: `${date}T00:00:00.000Z`,
  status: value,
  record: rec,
});

describe('MyAttendanceStore', () => {
  let store: MyAttendanceStore;
  let http: HttpTestingController;
  const notifications = { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() };

  const expectStatus = (): TestRequest =>
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/attendance/effective-status'));

  beforeEach(() => {
    notifications.showSuccess.mockReset();

    TestBed.configureTestingModule({
      providers: [
        MyAttendanceStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotificationService, useValue: notifications },
      ],
    });

    store = TestBed.inject(MyAttendanceStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('load', () => {
    it("asks about the SERVER's day (the UTC date) and never sends an employeeId", () => {
      store.load();

      const request = expectStatus();
      expect(request.request.params.get('date')).toBe(new Date().toISOString().slice(0, 10));
      expect(request.request.params.has('employeeId')).toBe(false);
      request.flush(status('ABSENT', null));

      expect(store.loading()).toBe(false);
      expect(store.status()?.status).toBe('ABSENT');
    });

    it('offers only Check in when there is no record yet', () => {
      store.load('2026-09-15');
      expectStatus().flush(status('ABSENT', null));

      expect(store.canCheckIn()).toBe(true);
      expect(store.canCheckOut()).toBe(false);
    });

    it('offers only Check out once checked in', () => {
      store.load('2026-09-15');
      expectStatus().flush(status('PRESENT', record()));

      expect(store.canCheckIn()).toBe(false);
      expect(store.canCheckOut()).toBe(true);
    });

    it('offers neither once checked out', () => {
      store.load('2026-09-15');
      expectStatus().flush(status('PRESENT', record({ checkOut: '2026-09-15T18:00:00.000Z' })));

      expect(store.canCheckIn()).toBe(false);
      expect(store.canCheckOut()).toBe(false);
    });

    it('offers nothing before the status is known', () => {
      expect(store.canCheckIn()).toBe(false);
      expect(store.canCheckOut()).toBe(false);
    });

    it('reports an account with no employee record as its own state, not as an error', () => {
      store.load('2026-09-15');
      expectStatus().flush(
        { status: 'error', message: 'No employee record linked to this account' },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(store.notLinked()).toBe(true);
      expect(store.error()).toBeNull();
      expect(store.loading()).toBe(false);
    });

    it('treats any other failure as an ordinary error', () => {
      store.load('2026-09-15');
      expectStatus().flush({ status: 'error', message: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(store.error()).toBe('boom');
      expect(store.notLinked()).toBe(false);
    });

    it('does not mistake an unrelated 400 for the not-linked state', () => {
      store.load('2026-09-15');
      expectStatus().flush({ status: 'error', message: 'date: Invalid date' }, { status: 400, statusText: 'Bad Request' });

      expect(store.notLinked()).toBe(false);
      expect(store.error()).toBe('date: Invalid date');
    });

    it('cancels a superseded load', () => {
      store.load('2026-09-14');
      const first = expectStatus();

      store.load('2026-09-15');
      expect(first.cancelled).toBe(true);
      expectStatus().flush(status('ABSENT', null));
    });
  });

  describe('checkIn', () => {
    it('checks in, then reads the computed status back for the day the SERVER filed the record under', () => {
      store.load('2026-09-15');
      expectStatus().flush(status('ABSENT', null));

      store.checkIn();
      expect(store.acting()).toBe(true);
      expect(store.canCheckIn()).toBe(false);

      // The server filed the record under 2026-09-16 (its UTC day), whatever the local date is.
      const filed = record({ date: '2026-09-16T00:00:00.000Z', checkIn: '2026-09-16T01:00:00.000Z' });
      http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/attendance/check-in')).flush({ record: filed });

      const request = expectStatus();
      expect(request.request.params.get('date')).toBe('2026-09-16');
      request.flush(status('LATE', filed, '2026-09-16'));

      expect(store.date()).toBe('2026-09-16');
      expect(store.status()?.status).toBe('LATE');
      expect(store.canCheckOut()).toBe(true);
      expect(store.acting()).toBe(false);
      expect(notifications.showSuccess).toHaveBeenCalledWith('Checked in.');
    });

    it("shows the server's message when already checked in, then resyncs", () => {
      store.load('2026-09-15');
      expectStatus().flush(status('ABSENT', null));

      store.checkIn();
      http
        .expectOne((r) => r.method === 'POST' && r.url.endsWith('/attendance/check-in'))
        .flush({ status: 'error', message: 'Already checked in for today' }, { status: 409, statusText: 'Conflict' });

      expect(store.actionError()).toBe('Already checked in for today');
      expect(store.acting()).toBe(false);

      // The card was stale: it reloads and now shows the real state.
      expectStatus().flush(status('PRESENT', record()));
      expect(store.canCheckOut()).toBe(true);
      expect(notifications.showSuccess).not.toHaveBeenCalled();
    });

    it('clears the previous action error when the next action starts', () => {
      store.load('2026-09-15');
      expectStatus().flush(status('ABSENT', null));

      store.checkIn();
      http.expectOne((r) => r.method === 'POST').flush({ status: 'error', message: 'nope' }, { status: 409, statusText: 'Conflict' });
      expectStatus().flush(status('ABSENT', null));
      expect(store.actionError()).toBe('nope');

      store.checkIn();
      expect(store.actionError()).toBeNull();
      http.expectOne((r) => r.method === 'POST').flush({ record: record() });
      expectStatus().flush(status('PRESENT', record()));
    });
  });

  describe('checkOut', () => {
    it('checks out and reads the status back', () => {
      store.load('2026-09-15');
      expectStatus().flush(status('PRESENT', record()));

      store.checkOut();
      const out = record({ checkOut: '2026-09-15T18:00:00.000Z' });
      http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/attendance/check-out')).flush({ record: out });
      expectStatus().flush(status('PRESENT', out));

      expect(store.canCheckOut()).toBe(false);
      expect(notifications.showSuccess).toHaveBeenCalledWith('Checked out.');
    });

    it("shows the server's message when checking out before checking in", () => {
      store.load('2026-09-15');
      expectStatus().flush(status('ABSENT', null));

      store.checkOut();
      http
        .expectOne((r) => r.method === 'PATCH')
        .flush({ status: 'error', message: 'Cannot check out before checking in today' }, { status: 400, statusText: 'Bad Request' });

      expect(store.actionError()).toBe('Cannot check out before checking in today');
      expectStatus().flush(status('ABSENT', null));
    });
  });

  describe('a non-working day, where the server hides the record', () => {
    it('remembers the punches just made, because the status response says record: null', () => {
      store.load('2026-09-15');
      expectStatus().flush(status('HOLIDAY', null));
      expect(store.canCheckIn()).toBe(true);

      store.checkIn();
      const mine = record();
      http.expectOne((r) => r.method === 'POST').flush({ record: mine });
      expectStatus().flush(status('HOLIDAY', null));

      expect(store.status()?.status).toBe('HOLIDAY');
      expect(store.record()).toEqual(mine);
      expect(store.canCheckIn()).toBe(false);
      expect(store.canCheckOut()).toBe(true);
    });

    it('forgets a remembered record on a working day, where record: null really means none', () => {
      store.load('2026-09-15');
      expectStatus().flush(status('PRESENT', record()));

      // e.g. an admin deleted it meanwhile
      store.load('2026-09-15');
      expectStatus().flush(status('ABSENT', null));

      expect(store.record()).toBeNull();
      expect(store.canCheckIn()).toBe(true);
      expect(store.canCheckOut()).toBe(false);
    });
  });
});
