import { ADMIN, EMPLOYEE, MANAGER, STRANGER, UNKNOWN, review } from './performance.testing';
import { canManage, canSubmit, cycleDateRange, cycleDay, isAboutCaller, reviewActions, showManagerContent } from './review-rules';

describe('review rules', () => {
  describe('canManage - manage:any, or manage:reports where the STORED reviewer is the caller', () => {
    it('ADMIN manages any review', () => expect(canManage(review(), ADMIN)).toBe(true));
    it('the stored reviewer manages it', () => expect(canManage(review(), MANAGER)).toBe(true));
    it('another manager does not (a later manager change never moves the reviewer)', () => expect(canManage(review(), STRANGER)).toBe(false));
    it('an unknown own id answers NO', () => expect(canManage(review(), UNKNOWN)).toBe(false));
    it('the reviewed employee does not', () => expect(canManage(review(), EMPLOYEE)).toBe(false));
  });

  describe('reviewActions', () => {
    it('DRAFT: the reviewer may edit, submit and delete; no acknowledge, no notes', () => {
      expect(reviewActions(review(), MANAGER)).toEqual({ edit: true, submit: true, delete: true, selfAssess: false, acknowledge: false, addNote: false });
    });

    it('DRAFT: the reviewed employee may only write a self-assessment (the backend allows it before submission)', () => {
      expect(reviewActions(review(), EMPLOYEE)).toEqual({ edit: false, submit: false, delete: false, selfAssess: true, acknowledge: false, addNote: false });
    });

    it('SUBMITTED: nobody edits; the employee may self-assess and acknowledge; everyone may add a note', () => {
      const submitted = review({ status: 'SUBMITTED' });
      expect(reviewActions(submitted, MANAGER)).toEqual({ edit: false, submit: false, delete: false, selfAssess: false, acknowledge: false, addNote: true });
      expect(reviewActions(submitted, EMPLOYEE)).toEqual({ edit: false, submit: false, delete: false, selfAssess: true, acknowledge: true, addNote: true });
    });

    it('ACKNOWLEDGED: only notes remain', () => {
      const done = review({ status: 'ACKNOWLEDGED' });
      expect(reviewActions(done, EMPLOYEE)).toEqual({ edit: false, submit: false, delete: false, selfAssess: false, acknowledge: false, addNote: true });
      expect(reviewActions(done, ADMIN).addNote).toBe(true);
    });

    it('nobody but the reviewed employee may acknowledge - not the reviewer, not ADMIN', () => {
      const submitted = review({ status: 'SUBMITTED' });
      expect(reviewActions(submitted, MANAGER).acknowledge).toBe(false);
      expect(reviewActions(submitted, ADMIN).acknowledge).toBe(false);
    });

    it('a manager who is not the stored reviewer gets nothing but notes', () => {
      expect(reviewActions(review(), STRANGER)).toEqual({ edit: false, submit: false, delete: false, selfAssess: false, acknowledge: false, addNote: false });
    });
  });

  describe('showManagerContent - a draft is the reviewer\'s work in progress', () => {
    it('hides a DRAFT from the reviewed employee', () => expect(showManagerContent(review(), EMPLOYEE)).toBe(false));
    it('shows a DRAFT to whoever manages it', () => {
      expect(showManagerContent(review(), MANAGER)).toBe(true);
      expect(showManagerContent(review(), ADMIN)).toBe(true);
    });
    it('shows it to everyone once submitted', () => expect(showManagerContent(review({ status: 'SUBMITTED' }), EMPLOYEE)).toBe(true));
  });

  it('canSubmit needs a rating AND non-blank comments (the submit 400)', () => {
    expect(canSubmit({ rating: null, managerComments: 'Good' })).toBe(false);
    expect(canSubmit({ rating: 'OUTSTANDING', managerComments: null })).toBe(false);
    expect(canSubmit({ rating: 'OUTSTANDING', managerComments: '   ' })).toBe(false);
    expect(canSubmit({ rating: 'OUTSTANDING', managerComments: 'Good' })).toBe(true);
  });

  it('isAboutCaller spots the caller\'s own review, and never matches an unknown caller', () => {
    expect(isAboutCaller(review({ employeeId: 'e-mgr' }), MANAGER)).toBe(true);
    expect(isAboutCaller(review(), MANAGER)).toBe(false);
    expect(isAboutCaller(review(), UNKNOWN)).toBe(false);
  });

  it('reads cycle dates as calendar days, never shifted by the time zone', () => {
    expect(cycleDay('2026-01-01T00:00:00.000Z')).toBe('2026-01-01');
    const range = cycleDateRange('2026-01-01T00:00:00.000Z', '2026-06-30T00:00:00.000Z', 'en-US');
    expect(range).toBe('Jan 1, 2026 – Jun 30, 2026');
  });
});
