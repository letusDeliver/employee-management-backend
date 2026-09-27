import { StatusTone } from '../../../shared/components/status-pill/status-pill.component';
import { formatDateOnly, parseDateOnly } from '../../../shared/utils/date-only.util';
import { ReviewCycleStatus, ReviewRating, ReviewStatus } from './performance.models';

/** Best first - the order the rating select offers them. */
export const RATINGS: readonly ReviewRating[] = [
  'OUTSTANDING',
  'EXCEEDS_EXPECTATIONS',
  'MEETS_EXPECTATIONS',
  'BELOW_EXPECTATIONS',
  'UNSATISFACTORY',
];

export const RATING_LABEL: Record<ReviewRating, string> = {
  OUTSTANDING: 'Outstanding',
  EXCEEDS_EXPECTATIONS: 'Exceeds expectations',
  MEETS_EXPECTATIONS: 'Meets expectations',
  BELOW_EXPECTATIONS: 'Below expectations',
  UNSATISFACTORY: 'Unsatisfactory',
};

/** Wording, tone and glyph of the three review statuses (a glyph AND a word, never colour alone). */
export const REVIEW_STATUS_META: Record<ReviewStatus, { label: string; tone: StatusTone; icon: string }> = {
  DRAFT: { label: 'Draft', tone: 'neutral', icon: 'edit_note' },
  SUBMITTED: { label: 'Submitted', tone: 'info', icon: 'send' },
  ACKNOWLEDGED: { label: 'Acknowledged', tone: 'success', icon: 'check_circle' },
};

export const REVIEW_STATUSES: readonly ReviewStatus[] = ['DRAFT', 'SUBMITTED', 'ACKNOWLEDGED'];

export const CYCLE_STATUS_META: Record<ReviewCycleStatus, { label: string; tone: StatusTone; icon: string }> = {
  OPEN: { label: 'Open', tone: 'success', icon: 'lock_open' },
  CLOSED: { label: 'Closed', tone: 'neutral', icon: 'lock' },
};

/** Who is asking. Unknown values (`ownEmployeeId` null) make every "is it mine?" answer NO. */
export interface ReviewActor {
  /** `performanceReview:manage:any` - ADMIN. */
  manageAny: boolean;
  /** `performanceReview:manage:reports` - MANAGER, only where they are the stored reviewer. */
  manageReports: boolean;
  /** The caller's own employee id, or `null` when unknown (no employee record, or not resolved yet). */
  ownEmployeeId: string | null;
}

export interface ReviewActions {
  edit: boolean;
  submit: boolean;
  delete: boolean;
  selfAssess: boolean;
  acknowledge: boolean;
  addNote: boolean;
}

interface ReviewFacts {
  status: ReviewStatus;
  employeeId: string;
  reviewerId: string;
}

const isSubject = (review: ReviewFacts, actor: ReviewActor): boolean =>
  actor.ownEmployeeId !== null && review.employeeId === actor.ownEmployeeId;

/**
 * May the caller manage (edit / submit / delete) this review? Mirrors `assertCanManage`: `manage:any`
 * always; `manage:reports` only where the STORED `reviewerId` is the caller's own employee id - so a
 * manager who took over a team later cannot manage reviews their predecessor authored.
 */
export const canManage = (review: ReviewFacts, actor: ReviewActor): boolean =>
  actor.manageAny || (actor.manageReports && actor.ownEmployeeId !== null && review.reviewerId === actor.ownEmployeeId);

/**
 * Everything the caller may do to this review, exactly as the backend decides it and FAILING CLOSED on
 * anything unknown - buttons the server would refuse are never offered (it stays the authority; a 403 /
 * 409 still shows inline):
 * - edit / submit / delete: a manager of the review, while DRAFT;
 * - self-assessment: the reviewed employee, until acknowledged (the backend allows it during DRAFT);
 * - acknowledge: the reviewed employee only (no override), while SUBMITTED;
 * - notes: anyone who can see the review, but only once SUBMITTED or ACKNOWLEDGED - stricter than the
 *   backend (which accepts them at any status) by decision: during DRAFT the reviewer simply edits and
 *   the employee has their self-assessment, and notes exist for commentary AFTER the fact (§2).
 */
export function reviewActions(review: ReviewFacts, actor: ReviewActor): ReviewActions {
  const draft = review.status === 'DRAFT';
  const manage = canManage(review, actor);
  const subject = isSubject(review, actor);

  return {
    edit: draft && manage,
    submit: draft && manage,
    delete: draft && manage,
    selfAssess: subject && review.status !== 'ACKNOWLEDGED',
    acknowledge: subject && review.status === 'SUBMITTED',
    addNote: !draft,
  };
}

/**
 * Should the manager's rating and comments be shown? Always to someone who manages the review; to
 * anyone else (the reviewed employee in particular) only once it is SUBMITTED. The API sends a draft's
 * content to its subject anyway - this is presentation, not privacy (a recorded backend gap).
 */
export const showManagerContent = (review: ReviewFacts, actor: ReviewActor): boolean =>
  review.status !== 'DRAFT' || canManage(review, actor);

/** Mirrors the submit 400: both a rating and (non-blank) comments must be saved first. */
export const canSubmit = (review: { rating: ReviewRating | null; managerComments: string | null }): boolean =>
  review.rating !== null && (review.managerComments ?? '').trim() !== '';

/** Is this review about the caller themselves (a MANAGER's ledger contains their own reviews too)? */
export const isAboutCaller = (review: { employeeId: string }, actor: ReviewActor): boolean =>
  actor.ownEmployeeId !== null && review.employeeId === actor.ownEmployeeId;

/** "Jan 1 – Jun 30, 2026" from two calendar dates, never through a UTC `Date`. */
export function cycleDateRange(startDate: string, endDate: string, locale?: string): string {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  const full = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  return `${full.format(start)} – ${full.format(end)}`;
}

/** `YYYY-MM-DD` of a cycle date as the API sends it (an ISO instant at UTC midnight). */
export const cycleDay = (isoDate: string): string => formatDateOnly(parseDateOnly(isoDate));
