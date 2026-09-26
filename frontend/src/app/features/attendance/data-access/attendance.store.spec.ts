import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { NotificationService } from '../../../core/notifications/notification.service';
import { AttendanceListQuery, AttendanceRecord } from './attendance.models';
import { AttendanceStore, recordMatchesQuery } from './attendance.store';

const record = (id: string, employeeId = 'e-1', date = '2026-09-15'): AttendanceRecord => ({
  id,
  employeeId,
  date: `${date}T00:00:00.000Z`,
  checkIn: `${date}T09:05:00.000Z`,
  checkOut: null,
  isHalfDay: false,
  createdAt: '2026-09-15T09:05:00.000Z',
  updatedAt: '2026-09-15T09:05:00.000Z',
});

const page = (records: AttendanceRecord[], pageNumber = 1, total = records.length) => ({
  records,
  pagination: { page: pageNumber, limit: 10, total, totalPages: Math.max(1, Math.ceil(total / 10)) },
});

describe('recordMatchesQuery', () => {
  const base: AttendanceListQuery = { page: 1, limit: 10, sortBy: 'date', order: 'desc' };

  it('matches everything when no filter is set', () => {
    expect(recordMatchesQuery(base, record('a'))).toBe(true);
  });

  it('checks the employee and the inclusive date range, comparing calendar dates as strings', () => {
    const query = { ...base, employeeId: 'e-1', dateFrom: '2026-09-15', dateTo: '2026-09-15' };

    expect(recordMatchesQuery(query, record('a', 'e-1', '2026-09-15'))).toBe(true);
    expect(recordMatchesQuery(query, record('a', 'e-2', '2026-09-15'))).toBe(false);
    expect(recordMatchesQuery(query, record('a', 'e-1', '2026-09-14'))).toBe(false);
    expect(recordMatchesQuery(query, record('a', 'e-1', '2026-09-16'))).toBe(false);
  });
});

describe('AttendanceStore', () => {
  let store: AttendanceStore;
  let http: HttpTestingController;
  const notifications = { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() };

  const expectList = (): TestRequest => http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/attendance'));

  beforeEach(() => {
    notifications.showSuccess.mockReset();

    TestBed.configureTestingModule({
      providers: [
        AttendanceStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotificationService, useValue: notifications },
      ],
    });

    store = TestBed.inject(AttendanceStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('loadList', () => {
    it('asks for the newest date first and stores the page', () => {
      store.loadList();
      expect(store.loading()).toBe(true);

      const request = expectList();
      expect(request.request.params.get('sortBy')).toBe('date');
      expect(request.request.params.get('order')).toBe('desc');
      request.flush(page([record('a')]));

      expect(store.records()).toHaveLength(1);
      expect(store.pagination().total).toBe(1);
      expect(store.loading()).toBe(false);
      expect(store.error()).toBeNull();
    });

    it('reports the server message on failure', () => {
      store.loadList();
      expectList().flush({ status: 'error', message: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(store.error()).toBe('boom');
      expect(store.loading()).toBe(false);
    });

    it('cancels a superseded request so a slow old response cannot overwrite a newer one', () => {
      store.loadList();
      const first = expectList();

      store.loadList();
      expect(first.cancelled).toBe(true);
      expect(store.loading()).toBe(true);

      expectList().flush(page([record('new')]));
      expect(store.records().map((r) => r.id)).toEqual(['new']);
      expect(store.loading()).toBe(false);
    });
  });

  describe('query', () => {
    it('applies a filter, returns to page 1 and refetches', () => {
      store.setPage(3, 10);
      expectList().flush(page([], 3, 0));

      store.setFilters({ employeeId: 'e-1', dateFrom: '2026-09-01' });
      const request = expectList();

      expect(request.request.params.get('page')).toBe('1');
      expect(request.request.params.get('employeeId')).toBe('e-1');
      expect(request.request.params.get('dateFrom')).toBe('2026-09-01');
      request.flush(page([]));
    });

    it('clears a filter set to undefined', () => {
      store.setFilters({ employeeId: 'e-1' });
      expectList().flush(page([]));

      store.setFilters({ employeeId: undefined });
      const request = expectList();

      expect(request.request.params.has('employeeId')).toBe(false);
      request.flush(page([]));
    });

    it('sorts, returning to page 1', () => {
      store.setSort('checkIn', 'asc');
      const request = expectList();

      expect(request.request.params.get('sortBy')).toBe('checkIn');
      expect(request.request.params.get('order')).toBe('asc');
      expect(request.request.params.get('page')).toBe('1');
      request.flush(page([]));
    });
  });

  describe('createRecord', () => {
    it('refetches with the same filters when the new record is visible under them', () => {
      store.setFilters({ employeeId: 'e-1' });
      expectList().flush(page([]));

      let created: AttendanceRecord | undefined;
      store.createRecord({ employeeId: 'e-1', date: '2026-09-15' }).subscribe((value) => (created = value));
      http.expectOne((r) => r.method === 'POST').flush({ record: record('new', 'e-1') });

      const request = expectList();
      expect(request.request.params.get('employeeId')).toBe('e-1');
      request.flush(page([record('new', 'e-1')]));

      expect(created?.id).toBe('new');
      expect(notifications.showSuccess).toHaveBeenCalledWith('Attendance record created successfully.');
    });

    it('makes the filters follow a record they would hide, so the save is visible', () => {
      store.setFilters({ employeeId: 'e-1', dateFrom: '2026-09-01', dateTo: '2026-09-10' });
      expectList().flush(page([]));

      store.createRecord({ employeeId: 'e-2', date: '2026-09-15' }).subscribe();
      http.expectOne((r) => r.method === 'POST').flush({ record: record('new', 'e-2', '2026-09-15') });

      const request = expectList();
      expect(request.request.params.get('employeeId')).toBe('e-2');
      expect(request.request.params.has('dateFrom')).toBe(false);
      expect(request.request.params.has('dateTo')).toBe(false);
      expect(request.request.params.get('page')).toBe('1');
      request.flush(page([record('new', 'e-2')]));
    });

    it('does not refetch or notify when the create fails', () => {
      let failed = false;
      store.createRecord({ employeeId: 'e-1', date: '2026-09-15' }).subscribe({ error: () => (failed = true) });
      http
        .expectOne((r) => r.method === 'POST')
        .flush({ status: 'error', message: 'An attendance record already exists for this employee and date' }, { status: 409, statusText: 'Conflict' });

      expect(failed).toBe(true);
      expect(notifications.showSuccess).not.toHaveBeenCalled();
    });
  });

  describe('updateRecord', () => {
    it('refetches the list instead of patching a row', () => {
      store.updateRecord('a-1', { isHalfDay: true }).subscribe();
      http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/attendance/a-1')).flush({ record: record('a-1') });

      expectList().flush(page([record('a-1')]));
      expect(notifications.showSuccess).toHaveBeenCalledWith('Attendance record updated successfully.');
    });
  });

  describe('deleteRecord', () => {
    it('refetches the same page after a delete', () => {
      store.deleteRecord('a-1').subscribe();
      http.expectOne((r) => r.method === 'DELETE').flush({ message: 'ok' });

      expect(expectList().request.params.get('page')).toBe('1');
      expect(notifications.showSuccess).toHaveBeenCalledWith('Attendance record deleted successfully.');
    });

    it('steps back a page when the only row of a later page is deleted', () => {
      store.setPage(2, 10);
      expectList().flush(page([record('only')], 2, 11));

      store.deleteRecord('only').subscribe();
      http.expectOne((r) => r.method === 'DELETE').flush({ message: 'ok' });

      const request = expectList();
      expect(request.request.params.get('page')).toBe('1');
      request.flush(page([record('other')]));
    });

    it('surfaces a failed delete to the caller and leaves the list alone', () => {
      let message: string | undefined;
      store.deleteRecord('a-1').subscribe({ error: (e) => (message = e.error.message) });
      http.expectOne((r) => r.method === 'DELETE').flush({ status: 'error', message: 'gone' }, { status: 404, statusText: 'Not Found' });

      expect(message).toBe('gone');
      expect(notifications.showSuccess).not.toHaveBeenCalled();
    });
  });
});
