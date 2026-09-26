import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { NotificationService } from '../../../core/notifications/notification.service';
import { LeaveBalanceDto, LeaveRequestDto } from './leave.dto';
import { MyLeaveStore } from './my-leave.store';

const request = (id: string, overrides: Partial<LeaveRequestDto> = {}): LeaveRequestDto => ({
  id,
  employeeId: 'e-me',
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

const balance = (id: string): LeaveBalanceDto => ({
  id,
  employeeId: 'e-me',
  leaveTypeId: 't-1',
  year: 2026,
  entitlement: '10',
  consumed: '4',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});

const requestsPage = (requests: LeaveRequestDto[]) => ({
  requests,
  pagination: { page: 1, limit: 10, total: requests.length, totalPages: 1 },
});
const balancesPage = (balances: LeaveBalanceDto[]) => ({
  balances,
  pagination: { page: 1, limit: 100, total: balances.length, totalPages: 1 },
});

describe('MyLeaveStore', () => {
  let store: MyLeaveStore;
  let http: HttpTestingController;
  const notifications = { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() };

  const expectRequests = (): TestRequest => http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/leave-requests'));
  const expectBalances = (): TestRequest => http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/leave-balances'));
  const started = (employeeId?: string): void => {
    store.start(employeeId);
    expectRequests().flush(requestsPage([]));
    expectBalances().flush(balancesPage([]));
  };

  beforeEach(() => {
    notifications.showSuccess.mockReset();
    TestBed.configureTestingModule({
      providers: [MyLeaveStore, provideHttpClient(), provideHttpClientTesting(), { provide: NotificationService, useValue: notifications }],
    });
    store = TestBed.inject(MyLeaveStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('whose leave is it (the crux for ADMIN and MANAGER, who hold :read:any)', () => {
    it('sends NO employee id for a plain EMPLOYEE - the server scopes the lists to them', () => {
      store.start();

      const requests = expectRequests();
      const balances = expectBalances();
      expect(requests.request.params.has('employeeId')).toBe(false);
      expect(balances.request.params.has('employeeId')).toBe(false);
      requests.flush(requestsPage([]));
      balances.flush(balancesPage([]));
    });

    it("sends the caller's OWN employee id on BOTH lists when given one - or an ADMIN would see everyone's leave", () => {
      store.start('e-me');

      const requests = expectRequests();
      const balances = expectBalances();
      expect(requests.request.params.get('employeeId')).toBe('e-me');
      expect(balances.request.params.get('employeeId')).toBe('e-me');
      requests.flush(requestsPage([]));
      balances.flush(balancesPage([]));
    });

    it('fetches nothing for a caller with no employee record, and says so', () => {
      store.markNotLinked();

      expect(store.notLinked()).toBe(true);
      http.expectNone(() => true);
    });

    it('a later start() clears the not-linked state', () => {
      store.markNotLinked();
      started('e-me');

      expect(store.notLinked()).toBe(false);
    });
  });

  describe('balances', () => {
    it("shows the SERVER's current year by default and refetches when the year changes", () => {
      store.start('e-me');
      const first = expectBalances();
      expect(first.request.params.get('year')).toBe(String(new Date().getUTCFullYear()));
      first.flush(balancesPage([balance('b-1')]));
      expectRequests().flush(requestsPage([]));

      store.setYear(2025);
      const second = expectBalances();
      expect(second.request.params.get('year')).toBe('2025');
      expect(second.request.params.get('employeeId')).toBe('e-me');
      second.flush(balancesPage([]));

      expect(store.year()).toBe(2025);
      expect(store.balances()).toEqual([]);
    });

    it('none yet is a normal, empty state - not an error', () => {
      started('e-me');

      expect(store.balances()).toEqual([]);
      expect(store.balancesError()).toBeNull();
    });

    it('reports a balances failure on its own, leaving the requests alone', () => {
      store.start('e-me');
      expectRequests().flush(requestsPage([request('r-1')]));
      expectBalances().flush({ status: 'error', message: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(store.balancesError()).toBe('boom');
      expect(store.requests()).toHaveLength(1);
      expect(store.error()).toBeNull();
    });
  });

  describe('requests', () => {
    it('filters by status, back on page 1, keeping the employee scope', () => {
      started('e-me');

      store.setStatus('APPROVED');
      const filtered = expectRequests();

      expect(filtered.request.params.get('status')).toBe('APPROVED');
      expect(filtered.request.params.get('employeeId')).toBe('e-me');
      expect(filtered.request.params.get('page')).toBe('1');
      filtered.flush(requestsPage([]));
    });

    it('applies, says so, and refetches', () => {
      started('e-me');

      store.apply({ leaveTypeId: 't-1', startDate: '2026-11-02', endDate: '2026-11-06' }).subscribe();
      http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/leave-requests')).flush({ request: request('r-new') });

      expectRequests().flush(requestsPage([request('r-new')]));
      expect(notifications.showSuccess).toHaveBeenCalledWith('Leave request submitted.');
      expect(store.requests()[0].id).toBe('r-new');
    });

    it('CLEARS a status filter that would hide the new (PENDING) request, so the user sees what they did', () => {
      started('e-me');
      store.setStatus('APPROVED');
      expectRequests().flush(requestsPage([]));

      store.apply({ leaveTypeId: 't-1', startDate: '2026-11-02', endDate: '2026-11-06' }).subscribe();
      http.expectOne((r) => r.method === 'POST').flush({ request: request('r-new') });

      const refetch = expectRequests();
      expect(refetch.request.params.has('status')).toBe(false);
      expect(refetch.request.params.get('employeeId')).toBe('e-me');
      refetch.flush(requestsPage([request('r-new')]));
    });

    it("keeps a PENDING filter when applying (the new request already matches it)", () => {
      started('e-me');
      store.setStatus('PENDING');
      expectRequests().flush(requestsPage([]));

      store.apply({ leaveTypeId: 't-1', startDate: '2026-11-02', endDate: '2026-11-06' }).subscribe();
      http.expectOne((r) => r.method === 'POST').flush({ request: request('r-new') });

      expect(expectRequests().request.params.get('status')).toBe('PENDING');
    });

    it("hands the server's refusal to the caller (an overlap is a 409) without notifying or refetching", () => {
      started('e-me');

      let message: string | undefined;
      store.apply({ leaveTypeId: 't-1', startDate: '2026-11-02', endDate: '2026-11-06' }).subscribe({ error: (e) => (message = e.error.message) });
      http
        .expectOne((r) => r.method === 'POST')
        .flush({ status: 'error', message: 'This employee already has a pending or approved leave request overlapping these dates' }, { status: 409, statusText: 'Conflict' });

      expect(message).toContain('overlapping these dates');
      expect(notifications.showSuccess).not.toHaveBeenCalled();
    });

    it('cancels and refetches BOTH the requests and the balances (an approved leave gives its days back)', () => {
      started('e-me');

      store.cancel('r-1').subscribe();
      http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/leave-requests/r-1/cancel')).flush({ request: request('r-1', { status: 'CANCELLED' }) });

      expectRequests().flush(requestsPage([]));
      expectBalances().flush(balancesPage([balance('b-1')]));
      expect(notifications.showSuccess).toHaveBeenCalledWith('Leave request cancelled.');
    });
  });

  it('reload() refreshes both panels with the same scope', () => {
    started('e-me');

    store.reload();
    const requests = expectRequests();
    const balances = expectBalances();

    expect(requests.request.params.get('employeeId')).toBe('e-me');
    expect(balances.request.params.get('employeeId')).toBe('e-me');
    requests.flush(requestsPage([]));
    balances.flush(balancesPage([]));
  });
});
