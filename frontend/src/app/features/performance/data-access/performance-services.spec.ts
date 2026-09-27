import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SKIP_GLOBAL_ERROR_NOTIFICATION } from '../../../core/http/http-context-tokens';
import { PerformanceReviewService } from './performance-review.service';
import { cycle, review } from './performance.testing';
import { ReviewCycleService } from './review-cycle.service';

describe('Performance HTTP services', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('ReviewCycleService', () => {
    it('lists with only the filters that are set and maps the `cycles` key', () => {
      let result: unknown;
      TestBed.inject(ReviewCycleService)
        .list({ page: 1, limit: 10, status: 'OPEN', sortBy: 'startDate', order: 'desc' })
        .subscribe((value) => (result = value));

      const request = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/review-cycles'));
      expect(request.request.params.get('status')).toBe('OPEN');
      expect(request.request.params.has('search')).toBe(false);
      expect(request.request.context.get(SKIP_GLOBAL_ERROR_NOTIFICATION)).toBe(true);
      const pagination = { page: 1, limit: 10, total: 1, totalPages: 1 };
      request.flush({ cycles: [cycle()], pagination });
      expect(result).toEqual({ items: [cycle()], pagination });
    });

    it('creates, updates and deletes on the right paths', () => {
      const service = TestBed.inject(ReviewCycleService);
      service.create({ name: 'H1', startDate: '2026-01-01', endDate: '2026-06-30' }).subscribe();
      const create = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/review-cycles'));
      expect(create.request.body).toEqual({ name: 'H1', startDate: '2026-01-01', endDate: '2026-06-30' });
      create.flush({ cycle: cycle() });

      service.update('c-1', { status: 'CLOSED' }).subscribe();
      const update = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/review-cycles/c-1'));
      expect(update.request.body).toEqual({ status: 'CLOSED' });
      update.flush({ cycle: cycle({ status: 'CLOSED' }) });

      service.delete('c-1').subscribe();
      http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/review-cycles/c-1')).flush({ message: 'ok' });
    });
  });

  describe('PerformanceReviewService', () => {
    it('lists with only the filters that are set and maps the `reviews` key', () => {
      let result: unknown;
      TestBed.inject(PerformanceReviewService)
        .list({ page: 1, limit: 10, employeeId: 'e-me', sortBy: 'createdAt', order: 'desc' })
        .subscribe((value) => (result = value));

      const request = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/performance-reviews'));
      expect(request.request.params.get('employeeId')).toBe('e-me');
      expect(request.request.params.has('status')).toBe(false);
      expect(request.request.context.get(SKIP_GLOBAL_ERROR_NOTIFICATION)).toBe(true);
      const pagination = { page: 1, limit: 10, total: 1, totalPages: 1 };
      request.flush({ reviews: [review()], pagination });
      expect(result).toEqual({ items: [review()], pagination });
    });

    it.each([
      ['submit', '/submit', {}],
      ['acknowledge', '/acknowledge', {}],
    ] as const)('%s is PATCH /performance-reviews/:id%s', (method, suffix, body) => {
      TestBed.inject(PerformanceReviewService)[method]('r-1').subscribe();
      const request = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith(`/performance-reviews/r-1${suffix}`));
      expect(request.request.body).toEqual(body);
      request.flush({ review: review({ status: 'SUBMITTED' }) });
    });

    it('sends the self-assessment, the edit, a note, a create and a delete as the backend expects', () => {
      const service = TestBed.inject(PerformanceReviewService);

      service.setSelfAssessment('r-1', 'I shipped X.').subscribe();
      expect(http.expectOne((r) => r.url.endsWith('/performance-reviews/r-1/self-assessment')).request.body).toEqual({ selfComments: 'I shipped X.' });

      service.update('r-1', { rating: 'OUTSTANDING' }).subscribe();
      const update = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/performance-reviews/r-1'));
      expect(update.request.body).toEqual({ rating: 'OUTSTANDING' });
      update.flush({ review: review() });

      let note: unknown;
      service.addNote('r-1', 'Follow-up').subscribe((value) => (note = value));
      const add = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/performance-reviews/r-1/addenda'));
      expect(add.request.body).toEqual({ comment: 'Follow-up' });
      add.flush({ addendum: { id: 'a-1', performanceReviewId: 'r-1', authorId: 'u-1', comment: 'Follow-up', createdAt: '' } });
      expect(note).toEqual(expect.objectContaining({ id: 'a-1' }));

      service.create({ employeeId: 'e-emp', reviewCycleId: 'c-1' }).subscribe();
      const create = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/performance-reviews'));
      expect(create.request.body).toEqual({ employeeId: 'e-emp', reviewCycleId: 'c-1' });
      create.flush({ review: review() });

      service.delete('r-1').subscribe();
      http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/performance-reviews/r-1')).flush({ message: 'ok' });
      http.match(() => true).forEach((pending) => pending.flush({ review: review() }));
    });
  });
});
