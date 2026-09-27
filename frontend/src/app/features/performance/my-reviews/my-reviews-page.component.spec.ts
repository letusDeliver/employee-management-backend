import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { PerformanceReviewService } from '../data-access/performance-review.service';
import { cycle, pageOf, review } from '../data-access/performance.testing';
import { OwnEmployeeState, ReviewContext } from '../data-access/review-context';
import { ReviewCycleLookup } from '../data-access/review-cycle-lookup';
import { MyReviewsPageComponent } from './my-reviews-page.component';

describe('MyReviewsPageComponent', () => {
  const api = { list: vi.fn() };

  const setup = (permissions: string[], own: string | null = null, state: OwnEmployeeState = 'known') => {
    const context = { ownEmployeeId: signal(own), ownState: signal(state), load: vi.fn(() => of(undefined)) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SessionStore, useValue: { hasAnyPermission: (...k: string[]) => k.some((x) => permissions.includes(x)) } },
        { provide: PerformanceReviewService, useValue: api },
        { provide: ReviewContext, useValue: context },
        { provide: ReviewCycleLookup, useValue: { refresh: () => of([]), nameOf: () => 'H1 2026', get: () => cycle() } },
      ],
    });
    const fixture = TestBed.createComponent(MyReviewsPageComponent);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, context };
  };

  beforeEach(() => api.list.mockReset().mockReturnValue(of(pageOf([review()]))));

  it('an EMPLOYEE sends no id (the server scopes them) and never resolves one', () => {
    const { context } = setup(['performanceReview:read:own']);
    expect(api.list.mock.calls[0][0].employeeId).toBeUndefined();
    expect(context.load).not.toHaveBeenCalled();
  });

  it.each([
    ['ADMIN (read:any)', ['performanceReview:read:own', 'performanceReview:read:any']],
    ['MANAGER (their list includes their reports)', ['performanceReview:read:own', 'performanceReview:manage:reports']],
  ])('%s sends their OWN employee id', (_, permissions) => {
    setup(permissions, 'e-me');
    expect(api.list.mock.calls[0][0].employeeId).toBe('e-me');
  });

  it('"not linked" - and nothing fetched - without an employee record', () => {
    const { el } = setup(['performanceReview:read:any'], null);
    expect(el.textContent).toContain("Your account isn't linked to an employee record");
    expect(api.list).not.toHaveBeenCalled();
  });

  it('blocks with a Retry when the own record could not be determined - never everyone\'s reviews', () => {
    const { el } = setup(['performanceReview:read:any'], null, 'failed');
    expect(el.textContent).toContain("Couldn't work out which employee record is yours");
    expect(api.list).not.toHaveBeenCalled();
  });

  it("never shows a DRAFT's rating", () => {
    api.list.mockReturnValue(of(pageOf([review({ rating: 'OUTSTANDING' })])));
    const { el } = setup(['performanceReview:read:own']);
    expect(el.textContent).toContain('Not yet submitted');
    expect(el.textContent).not.toContain('Outstanding');
  });
});
