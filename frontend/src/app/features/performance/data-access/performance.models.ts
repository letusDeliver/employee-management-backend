import { Paginated } from '../../../shared/models/paginated.model';

/**
 * Exact wire shapes, verified against `backend/src/modules/{reviewCycles,performance}`, the Prisma models
 * and a live probe. There is no DTO -> model split: nothing here is a Decimal, and every date is kept as
 * the ISO string the API sends (cycle dates are CALENDAR dates at UTC midnight, read only through
 * `shared/utils/date-only.util.ts`; `submittedAt` / `acknowledgedAt` / addendum `createdAt` are instants).
 */
export type ReviewCycleStatus = 'OPEN' | 'CLOSED';
export type ReviewStatus = 'DRAFT' | 'SUBMITTED' | 'ACKNOWLEDGED';
export type ReviewRating = 'OUTSTANDING' | 'EXCEEDS_EXPECTATIONS' | 'MEETS_EXPECTATIONS' | 'BELOW_EXPECTATIONS' | 'UNSATISFACTORY';

export interface ReviewCycle {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: ReviewCycleStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * `reviewerId` is the reviewer's EMPLOYEE id, fixed at creation (ADR-PF02) - a later manager change never
 * moves it. `departmentName` / `designationName` / `branchName` are recorded at SUBMISSION (ADR-PF03) and
 * are null while DRAFT. The API returns `rating` and `managerComments` to the reviewed employee even while
 * DRAFT; the screens decide what to show (see `review-rules.ts`).
 */
export interface PerformanceReview {
  id: string;
  employeeId: string;
  reviewerId: string;
  reviewCycleId: string;
  status: ReviewStatus;
  rating: ReviewRating | null;
  managerComments: string | null;
  selfComments: string | null;
  departmentName: string | null;
  designationName: string | null;
  branchName: string | null;
  submittedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `authorId` is a USER id (not an employee id), `null` if that user was deleted. Append-only. */
export interface ReviewAddendum {
  id: string;
  performanceReviewId: string;
  authorId: string | null;
  comment: string;
  createdAt: string;
}

/** Only `GET /performance-reviews/:id` carries the notes, oldest first. */
export interface PerformanceReviewDetail extends PerformanceReview {
  addenda: ReviewAddendum[];
}

export interface CreateReviewCycleRequest {
  name: string;
  /** `YYYY-MM-DD`. */
  startDate: string;
  endDate: string;
}

export interface UpdateReviewCycleRequest {
  name?: string;
  startDate?: string;
  endDate?: string;
  status?: ReviewCycleStatus;
}

export interface CreatePerformanceReviewRequest {
  employeeId: string;
  reviewCycleId: string;
  /** Honoured only for ADMIN, and only needed when the employee has no manager. */
  reviewerId?: string;
}

export interface UpdatePerformanceReviewRequest {
  rating?: ReviewRating;
  managerComments?: string;
}

/** The backend's own sort whitelists - one key each, `id` as the tie-break. */
export type ReviewCycleSortField = 'name' | 'startDate' | 'endDate' | 'status' | 'createdAt';
export type ReviewSortField = 'createdAt' | 'submittedAt' | 'acknowledgedAt' | 'status';

export interface ReviewCycleListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: ReviewCycleStatus;
  sortBy: ReviewCycleSortField;
  order: 'asc' | 'desc';
}

export interface ReviewListQuery {
  page: number;
  limit: number;
  /** Honoured as-is with `read:any`; otherwise ANDed with the caller's own scope by the server. */
  employeeId?: string;
  reviewCycleId?: string;
  status?: ReviewStatus;
  sortBy: ReviewSortField;
  order: 'asc' | 'desc';
}

// Each endpoint returns its own key, never a generic envelope (blueprint §0).
export interface ReviewCyclesListResponse {
  cycles: ReviewCycle[];
  pagination: Paginated;
}
export interface ReviewCycleResponse {
  cycle: ReviewCycle;
}
export interface ReviewsListResponse {
  reviews: PerformanceReview[];
  pagination: Paginated;
}
export interface ReviewResponse {
  review: PerformanceReviewDetail;
}
export interface AddendumResponse {
  addendum: ReviewAddendum;
}
