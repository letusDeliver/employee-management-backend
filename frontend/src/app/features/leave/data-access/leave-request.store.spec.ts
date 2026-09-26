import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { NotificationService } from '../../../core/notifications/notification.service';
import { LeaveRequestDto } from './leave.dto';
import { LeaveRequestStore } from './leave-request.store';

const dto = (id: string, overrides: Partial<LeaveRequestDto> = {}): LeaveRequestDto => ({
  id,
  employeeId: 'e-1',
  leaveTypeId: 't-1',
  startDate: '2026-11-02T00:00:00.000Z',
  endDate: '2026-11-06T00:00:00.000Z',
  reason: null,
  status: 'PENDING',
  durationDays: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

const page = (requests: LeaveRequestDto[], pageNumber = 1, total = requests.length) => ({
  requests,
  pagination: { page: pageNumber, limit: 10, total, totalPages: Math.max(1, Math.ceil(total / 10)) },
});

describe('LeaveRequestStore', () => {
  let store: LeaveRequestStore;
  let http: HttpTestingController;
  const notifications = { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() };

  const expectList = (): TestRequest => http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/leave-requests'));

  beforeEach(() => {
    notifications.showSuccess.mockReset();
    TestBed.configureTestingModule({
      providers: [LeaveRequestStore, provideHttpClient(), provideHttpClientTesting(), { provide: NotificationService, useValue: notifications }],
    });
    store = TestBed.inject(LeaveRequestStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts on what an approver came for: PENDING requests, newest start date first', () => {
    store.loadList();

    const request = expectList();
    expect(request.request.params.get('status')).toBe('PENDING');
    expect(request.request.params.get('sortBy')).toBe('startDate');
    expect(request.request.params.get('order')).toBe('desc');
    request.flush(page([dto('a', { durationDays: null })]));

    expect(store.requests()).toHaveLength(1);
    expect(store.requests()[0].durationDays).toBeNull();
    expect(store.loading()).toBe(false);
  });

  it('applies a filter, returns to page 1 and refetches; undefined clears it', () => {
    store.setPage(3, 10);
    expectList().flush(page([], 3, 0));

    store.setFilters({ employeeId: 'e-1', leaveTypeId: 't-1', status: undefined, dateFrom: '2026-11-01' });
    const request = expectList();

    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('employeeId')).toBe('e-1');
    expect(request.request.params.get('leaveTypeId')).toBe('t-1');
    expect(request.request.params.get('dateFrom')).toBe('2026-11-01');
    expect(request.request.params.has('status')).toBe(false);
    request.flush(page([]));
  });

  it('reports the server message when loading fails', () => {
    store.loadList();
    expectList().flush({ status: 'error', message: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(store.error()).toBe('boom');
    expect(store.loading()).toBe(false);
  });

  describe('decisions', () => {
    it('approves, says so, and REFETCHES instead of patching the row', () => {
      let approved: unknown;
      store.approve('a').subscribe((value) => (approved = value));
      http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/leave-requests/a/approve')).flush({ request: dto('a', { status: 'APPROVED', durationDays: '4' }) });

      expectList().flush(page([]));
      expect(approved).toEqual(expect.objectContaining({ status: 'APPROVED', durationDays: 4 }));
      expect(notifications.showSuccess).toHaveBeenCalledWith('Leave request approved.');
    });

    it('rejects with the optional reason and refetches', () => {
      store.reject('a', { reason: 'Coverage' }).subscribe();
      const request = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/leave-requests/a/reject'));
      expect(request.request.body).toEqual({ reason: 'Coverage' });
      request.flush({ request: dto('a', { status: 'REJECTED' }) });

      expectList().flush(page([]));
      expect(notifications.showSuccess).toHaveBeenCalledWith('Leave request rejected.');
    });

    it('cancels and refetches', () => {
      store.cancel('a').subscribe();
      http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/leave-requests/a/cancel')).flush({ request: dto('a', { status: 'CANCELLED' }) });

      expectList().flush(page([]));
      expect(notifications.showSuccess).toHaveBeenCalledWith('Leave request cancelled.');
    });

    it('steps back a page when the decided request was the only row of a later page', () => {
      store.setPage(2, 10);
      expectList().flush(page([dto('only')], 2, 11));

      store.approve('only').subscribe();
      http.expectOne((r) => r.method === 'PATCH').flush({ request: dto('only', { status: 'APPROVED', durationDays: '1' }) });

      const request = expectList();
      expect(request.request.params.get('page')).toBe('1');
      request.flush(page([dto('other')]));
    });

    it("hands the server's refusal to the caller, and neither notifies nor refetches", () => {
      let message: string | undefined;
      store.approve('a').subscribe({ error: (e) => (message = e.error.message) });
      http
        .expectOne((r) => r.method === 'PATCH')
        .flush({ status: 'error', message: 'Insufficient leave balance: 5 day(s) requested, 2 remaining' }, { status: 409, statusText: 'Conflict' });

      expect(message).toBe('Insufficient leave balance: 5 day(s) requested, 2 remaining');
      expect(notifications.showSuccess).not.toHaveBeenCalled();
    });
  });
});
