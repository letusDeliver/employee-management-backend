import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { MyReviewsStore } from './my-reviews.store';
import { PerformanceReviewService } from './performance-review.service';
import { cycle, pageOf, review } from './performance.testing';
import { ReviewCycleListStore } from './review-cycle-list.store';
import { ReviewCycleLookup } from './review-cycle-lookup';
import { ReviewCycleService } from './review-cycle.service';
import { ReviewDetailStore } from './review-detail.store';
import { ReviewLedgerStore } from './review-ledger.store';

const httpError = (status: number, message = 'nope') => throwError(() => new HttpErrorResponse({ status, error: { status: 'error', message } }));

describe('Performance stores', () => {
  const cycleApi = { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const reviewApi = {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    submit: vi.fn(),
    acknowledge: vi.fn(),
    setSelfAssessment: vi.fn(),
    delete: vi.fn(),
    addNote: vi.fn(),
  };
  const notifications = { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() };

  beforeEach(() => {
    [...Object.values(cycleApi), ...Object.values(reviewApi), notifications.showSuccess].forEach((fn) => fn.mockReset());
    cycleApi.list.mockReturnValue(of(pageOf([cycle()])));
    reviewApi.list.mockReturnValue(of(pageOf([review()])));
    reviewApi.getById.mockReturnValue(of(review()));
    TestBed.configureTestingModule({
      providers: [
        ReviewCycleListStore,
        ReviewLedgerStore,
        MyReviewsStore,
        ReviewDetailStore,
        { provide: ReviewCycleService, useValue: cycleApi },
        { provide: PerformanceReviewService, useValue: reviewApi },
        { provide: NotificationService, useValue: notifications },
      ],
    });
  });

  describe('ReviewCycleListStore', () => {
    it('loads newest start date first and refetches after every mutation', () => {
      const store = TestBed.inject(ReviewCycleListStore);
      store.load();
      expect(cycleApi.list).toHaveBeenCalledWith({ page: 1, limit: 10, sortBy: 'startDate', order: 'desc' });

      cycleApi.create.mockReturnValue(of(cycle()));
      cycleApi.update.mockReturnValue(of(cycle()));
      cycleApi.delete.mockReturnValue(of(undefined));
      store.create({ name: 'X', startDate: '2026-01-01', endDate: '2026-01-02' }).subscribe();
      store.update('c-1', { status: 'CLOSED' }).subscribe();
      store.delete('c-1').subscribe();

      expect(cycleApi.list).toHaveBeenCalledTimes(4);
    });

    it('search and status filter from page 1; a blank search is sent as nothing', () => {
      const store = TestBed.inject(ReviewCycleListStore);
      store.setSearch('');
      expect(cycleApi.list.mock.lastCall?.[0].search).toBeUndefined();
      store.setStatus('CLOSED');
      expect(cycleApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'CLOSED', page: 1 }));
    });
  });

  describe('ReviewCycleLookup', () => {
    it('pages through every cycle, names them, and offers only OPEN ones', () => {
      cycleApi.list
        .mockReturnValueOnce(of({ items: [cycle({ id: 'a', name: 'A' })], pagination: { page: 1, limit: 100, total: 2, totalPages: 2 } }))
        .mockReturnValueOnce(of({ items: [cycle({ id: 'b', name: 'B', status: 'CLOSED' })], pagination: { page: 2, limit: 100, total: 2, totalPages: 2 } }));
      const lookup = TestBed.inject(ReviewCycleLookup);

      lookup.refresh().subscribe();

      expect(cycleApi.list).toHaveBeenCalledTimes(2);
      expect(lookup.nameOf('b')).toBe('B');
      expect(lookup.nameOf('zzz')).toBe('Unknown cycle');
      expect(lookup.open().map((c) => c.id)).toEqual(['a']);
    });

    it('exposes a failure', () => {
      cycleApi.list.mockReturnValue(httpError(500, 'Database down'));
      const lookup = TestBed.inject(ReviewCycleLookup);

      lookup.refresh().subscribe({ error: () => undefined });

      expect(lookup.error()).toBe('Database down');
      expect(lookup.loading()).toBe(false);
    });
  });

  describe('ReviewLedgerStore', () => {
    it('lists newest first and filters from page 1', () => {
      const store = TestBed.inject(ReviewLedgerStore);
      store.load();
      expect(reviewApi.list).toHaveBeenCalledWith({ page: 1, limit: 10, sortBy: 'createdAt', order: 'desc' });
      store.setFilters({ reviewCycleId: 'c-1', status: 'SUBMITTED' });
      expect(reviewApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ reviewCycleId: 'c-1', status: 'SUBMITTED', page: 1 }));
    });
  });

  describe('MyReviewsStore - whose reviews', () => {
    it('sends NO employee id for a server-scoped caller', () => {
      TestBed.inject(MyReviewsStore).start();
      expect(reviewApi.list.mock.calls[0][0].employeeId).toBeUndefined();
    });

    it("sends the caller's OWN id when given one (ADMIN reads everyone's; a MANAGER's list includes their reports')", () => {
      TestBed.inject(MyReviewsStore).start('e-me');
      expect(reviewApi.list.mock.calls[0][0].employeeId).toBe('e-me');
    });

    it('fetches nothing when not linked', () => {
      const store = TestBed.inject(MyReviewsStore);
      store.markNotLinked();
      expect(store.notLinked()).toBe(true);
      expect(reviewApi.list).not.toHaveBeenCalled();
    });
  });

  describe('ReviewDetailStore', () => {
    it('loads the review; 404, 403 and other failures are three different states', () => {
      const store = TestBed.inject(ReviewDetailStore);
      store.load('r-1');
      expect(store.review()).toEqual(review());

      reviewApi.getById.mockReturnValue(httpError(404));
      store.reload();
      expect(store.notFound()).toBe(true);

      reviewApi.getById.mockReturnValue(httpError(403));
      store.reload();
      expect(store.forbidden()).toBe(true);
      expect(store.notFound()).toBe(false);

      reviewApi.getById.mockReturnValue(httpError(500, 'Database down'));
      store.reload();
      expect(store.error()).toBe('Database down');
      expect(store.forbidden()).toBe(false);
    });

    it.each([
      ['save', (s: ReviewDetailStore) => s.save({ rating: 'OUTSTANDING' }), 'update'],
      ['submit', (s: ReviewDetailStore) => s.submit(), 'submit'],
      ['acknowledge', (s: ReviewDetailStore) => s.acknowledge(), 'acknowledge'],
      ['self-assessment', (s: ReviewDetailStore) => s.saveSelfAssessment('Me'), 'setSelfAssessment'],
      ['note', (s: ReviewDetailStore) => s.addNote('Hi'), 'addNote'],
    ] as const)('%s refetches the review afterwards', (_, act, apiMethod) => {
      const store = TestBed.inject(ReviewDetailStore);
      store.load('r-1');
      reviewApi[apiMethod].mockReturnValue(of(review()));

      act(store).subscribe();

      expect(reviewApi.getById).toHaveBeenCalledTimes(2);
      expect(notifications.showSuccess).toHaveBeenCalled();
    });

    it('a 409 refetches (moved elsewhere) and still reports the failure; another failure does not refetch', () => {
      const store = TestBed.inject(ReviewDetailStore);
      store.load('r-1');
      reviewApi.submit.mockReturnValue(httpError(409, 'Only a Draft performance review can be submitted'));
      let failed = false;

      store.submit().subscribe({ error: () => (failed = true) });
      expect(failed).toBe(true);
      expect(reviewApi.getById).toHaveBeenCalledTimes(2);

      reviewApi.submit.mockReturnValue(httpError(400));
      store.submit().subscribe({ error: () => undefined });
      expect(reviewApi.getById).toHaveBeenCalledTimes(2);
    });
  });
});
