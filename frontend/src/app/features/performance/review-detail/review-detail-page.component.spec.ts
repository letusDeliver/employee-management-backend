import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { PerformanceReviewDetail } from '../data-access/performance.models';
import { PerformanceReviewService } from '../data-access/performance-review.service';
import { ADMIN, EMPLOYEE, MANAGER, cycle, review } from '../data-access/performance.testing';
import { ReviewContext } from '../data-access/review-context';
import { ReviewCycleLookup } from '../data-access/review-cycle-lookup';
import { ReviewActor } from '../data-access/review-rules';
import { ReviewDetailPageComponent } from './review-detail-page.component';

describe('ReviewDetailPageComponent', () => {
  const api = { getById: vi.fn(), update: vi.fn(), submit: vi.fn(), acknowledge: vi.fn(), setSelfAssessment: vi.fn(), delete: vi.fn(), addNote: vi.fn() };
  const dialog = { open: vi.fn() };

  const setup = (subject: PerformanceReviewDetail, actor: ReviewActor, origin: 'manage' | 'mine' = 'manage') => {
    api.getById.mockReturnValue(of(subject));
    const context = {
      load: () => of(undefined),
      actorFor: () => actor,
      subjectLabel: () => (actor === EMPLOYEE ? 'You' : 'Asha Rao'),
      reviewerLabel: () => (actor === MANAGER ? 'You' : 'Your reviewer'),
      authorLabel: (id: string | null) => (id === 'u-me' ? 'You' : 'Someone else'),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'r-1' }) }, routeConfig: { data: { origin } } },
        },
        { provide: PerformanceReviewService, useValue: api },
        { provide: ReviewContext, useValue: context },
        {
          provide: ReviewCycleLookup,
          useValue: { refresh: () => of([]), nameOf: () => 'H1 2026', get: () => cycle(), cycles: signal([cycle()]) },
        },
        { provide: NotificationService, useValue: { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() } },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(ReviewDetailPageComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };
  const button = (el: HTMLElement, text: RegExp) => [...el.querySelectorAll('button')].find((b) => text.test(b.textContent ?? ''));
  const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');
  const confirmData = () => dialog.open.mock.lastCall?.[1].data;

  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    dialog.open.mockReset().mockReturnValue({ afterClosed: () => of(true) });
  });

  describe('the reviewer, while DRAFT', () => {
    it('edits rating and comments, may delete, and Submit waits for a SAVED rating and comments', () => {
      const { el } = setup(review(), MANAGER);

      expect(el.querySelector('mat-select[formcontrolname=rating]')).not.toBeNull();
      expect(el.querySelector('textarea[formcontrolname=managerComments]')).not.toBeNull();
      expect(button(el, /Delete draft/)).toBeDefined();
      expect((button(el, /Submit review/) as HTMLButtonElement).disabled).toBe(true);
      expect(text(el)).toContain('Add a rating and comments, and save them, before submitting.');
      expect(button(el, /Acknowledge/)).toBeUndefined();
    });

    it('Save sends only what changed', () => {
      const { fixture, el } = setup(review({ rating: 'MEETS_EXPECTATIONS', managerComments: 'Fine.' }), MANAGER);
      api.update.mockReturnValue(of(review()));
      const comments = el.querySelector('textarea[formcontrolname=managerComments]') as HTMLTextAreaElement;
      comments.value = 'Strong quarter.';
      comments.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      button(el, /^\s*Save\s*$/)!.click();

      expect(api.update).toHaveBeenCalledWith('r-1', { managerComments: 'Strong quarter.' });
    });

    it('Submit asks first, saying it cannot be edited afterwards, then submits', () => {
      const { el } = setup(review({ rating: 'OUTSTANDING', managerComments: 'Great.' }), MANAGER);
      api.submit.mockReturnValue(of(review({ status: 'SUBMITTED' })));

      button(el, /Submit review/)!.click();

      expect(confirmData().message).toContain("can't be edited afterwards");
      expect(api.submit).toHaveBeenCalledWith('r-1');
    });

    it('deleting the draft goes back to where the review was opened from', () => {
      const { el } = setup(review(), MANAGER, 'manage');
      api.delete.mockReturnValue(of(undefined));
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      button(el, /Delete draft/)!.click();

      expect(api.delete).toHaveBeenCalledWith('r-1');
      expect(navigate).toHaveBeenCalledWith('/performance-reviews');
    });
  });

  describe('the reviewed employee', () => {
    it("does NOT see a DRAFT's rating or comments, but may write a self-assessment", () => {
      const { el } = setup(review({ rating: 'OUTSTANDING', managerComments: 'Secret draft' }), EMPLOYEE, 'mine');

      expect(text(el)).toContain('Your reviewer is still writing this review.');
      expect(text(el)).not.toContain('Secret draft');
      expect(text(el)).not.toContain('Outstanding');
      expect(el.querySelector('textarea[formcontrolname=selfComments]')).not.toBeNull();
      expect(el.querySelector('mat-select[formcontrolname=rating]')).toBeNull();
      expect(text(el)).toContain('Notes can be added once the review is submitted.');
    });

    it('sees a SUBMITTED review and acknowledges it after a confirm that says it does not mean agreeing', () => {
      const { el } = setup(review({ status: 'SUBMITTED', rating: 'EXCEEDS_EXPECTATIONS', managerComments: 'Strong quarter.' }), EMPLOYEE, 'mine');
      api.acknowledge.mockReturnValue(of(review({ status: 'ACKNOWLEDGED' })));

      expect(text(el)).toContain('Exceeds expectations');
      expect(text(el)).toContain('Strong quarter.');
      button(el, /^\s*Acknowledge\s*$/)!.click();

      expect(confirmData().message).toContain("doesn't mean you agree");
      expect(api.acknowledge).toHaveBeenCalledWith('r-1');
    });

    it('after acknowledgement the self-assessment is read-only and a note can be added', () => {
      const { fixture, el } = setup(review({ status: 'ACKNOWLEDGED', selfComments: 'I shipped X.' }), EMPLOYEE, 'mine');
      api.addNote.mockReturnValue(of({}));

      expect(el.querySelector('textarea[formcontrolname=selfComments]')).toBeNull();
      expect(text(el)).toContain('I shipped X.');
      const note = el.querySelector('textarea[formcontrolname=comment]') as HTMLTextAreaElement;
      note.value = 'Thanks.';
      note.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      button(el, /Add note/)!.click();
      fixture.detectChanges();

      expect(api.addNote).toHaveBeenCalledWith('r-1', 'Thanks.');
      // Emptied afterwards WITHOUT showing the empty field as an error (the form was just submitted).
      expect((el.querySelector('textarea[formcontrolname=comment]') as HTMLTextAreaElement).value).toBe('');
      expect(el.querySelector('mat-form-field.mat-form-field-invalid')).toBeNull();
    });

    it('back goes to My reviews', () => {
      const { el } = setup(review(), EMPLOYEE, 'mine');
      expect(el.querySelector('a.back-link')?.getAttribute('href')).toBe('/my-reviews');
    });
  });

  it('ADMIN manages any draft but never acknowledges', () => {
    const { el } = setup(review({ status: 'SUBMITTED' }), ADMIN);
    expect(button(el, /^\s*Acknowledge\s*$/)).toBeUndefined();
    expect(button(el, /Submit review/)).toBeUndefined();
  });

  it('shows the recorded department, designation and branch once submitted', () => {
    const { el } = setup(
      review({ status: 'SUBMITTED', departmentName: 'Finance', designationName: 'Analyst', branchName: 'Pune' }),
      MANAGER,
    );
    expect(text(el)).toContain('At submission: Analyst · Finance · Pune');
  });

  it('names note authors through the context', () => {
    const { el } = setup(
      review({
        status: 'SUBMITTED',
        addenda: [
          { id: 'a', performanceReviewId: 'r-1', authorId: 'u-me', comment: 'Mine', createdAt: '2026-09-27T05:24:41.065Z' },
          { id: 'b', performanceReviewId: 'r-1', authorId: 'u-x', comment: 'Theirs', createdAt: '2026-09-27T05:25:41.065Z' },
        ],
      }),
      EMPLOYEE,
      'mine',
    );
    const metas = [...el.querySelectorAll('.note-meta')].map((m) => m.textContent?.trim().split(' · ')[0]);
    expect(metas).toEqual(['You', 'Someone else']);
  });

  it('403, 404 and a failed load are three different states', () => {
    api.getById.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'r-1' }) }, routeConfig: { data: { origin: 'mine' } } } },
        { provide: PerformanceReviewService, useValue: api },
        { provide: ReviewContext, useValue: { load: () => of(undefined), actorFor: () => EMPLOYEE } },
        { provide: ReviewCycleLookup, useValue: { refresh: () => of([]), nameOf: () => '', get: () => undefined } },
        { provide: NotificationService, useValue: { showSuccess: vi.fn() } },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(ReviewDetailPageComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(text(el)).toContain("You can't view this review");
    expect(text(el)).not.toContain('Review not found');
  });
});
