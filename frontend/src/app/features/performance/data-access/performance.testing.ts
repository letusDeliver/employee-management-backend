import { PerformanceReviewDetail, ReviewCycle } from './performance.models';
import { ReviewActor } from './review-rules';

/** Spec-only builders, shaped exactly like the probe's responses. */
export const cycle = (overrides: Partial<ReviewCycle> = {}): ReviewCycle => ({
  id: 'c-1',
  name: 'H1 2026',
  startDate: '2026-01-01T00:00:00.000Z',
  endDate: '2026-06-30T00:00:00.000Z',
  status: 'OPEN',
  createdAt: '2026-09-27T05:24:40.778Z',
  updatedAt: '2026-09-27T05:24:40.778Z',
  ...overrides,
});

export const review = (overrides: Partial<PerformanceReviewDetail> = {}): PerformanceReviewDetail => ({
  id: 'r-1',
  employeeId: 'e-emp',
  reviewerId: 'e-mgr',
  reviewCycleId: 'c-1',
  status: 'DRAFT',
  rating: null,
  managerComments: null,
  selfComments: null,
  departmentName: null,
  designationName: null,
  branchName: null,
  submittedAt: null,
  acknowledgedAt: null,
  createdAt: '2026-09-27T05:24:40.885Z',
  updatedAt: '2026-09-27T05:24:40.885Z',
  addenda: [],
  ...overrides,
});

export const ADMIN: ReviewActor = { manageAny: true, manageReports: false, ownEmployeeId: 'e-admin' };
export const MANAGER: ReviewActor = { manageAny: false, manageReports: true, ownEmployeeId: 'e-mgr' };
export const EMPLOYEE: ReviewActor = { manageAny: false, manageReports: false, ownEmployeeId: 'e-emp' };
export const STRANGER: ReviewActor = { manageAny: false, manageReports: true, ownEmployeeId: 'e-other-mgr' };
export const UNKNOWN: ReviewActor = { manageAny: false, manageReports: true, ownEmployeeId: null };

export const pageOf = <T>(items: T[], page = 1, limit = 10, total = items.length) => ({
  items,
  pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
});
