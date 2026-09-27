import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroupDirective, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, finalize, tap } from 'rxjs';

import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusPillComponent } from '../../../shared/components/status-pill/status-pill.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { createConfirmDelete } from '../../../shared/master-data/confirm-delete';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { notBlankValidator } from '../../../shared/validators/not-blank.validator';
import { ReviewRating, UpdatePerformanceReviewRequest } from '../data-access/performance.models';
import { ReviewContext } from '../data-access/review-context';
import { ReviewCycleLookup } from '../data-access/review-cycle-lookup';
import { ReviewDetailStore } from '../data-access/review-detail.store';
import {
  RATINGS,
  RATING_LABEL,
  REVIEW_STATUS_META,
  ReviewActions,
  canSubmit,
  cycleDateRange,
  reviewActions,
  showManagerContent,
} from '../data-access/review-rules';

/** Which area opened the review - decides the breadcrumb trail and where "back" goes. Route data. */
export type ReviewOrigin = 'manage' | 'mine';

const NO_ACTIONS: ReviewActions = { edit: false, submit: false, delete: false, selfAssess: false, acknowledge: false, addNote: false };

const STATUS_HINT = {
  DRAFT: 'Draft - the reviewer is still writing it.',
  SUBMITTED: 'Submitted - waiting for the employee to acknowledge it.',
  ACKNOWLEDGED: 'Acknowledged - this review is final; later remarks are added as notes.',
} as const;

/**
 * One review, read like a document, with exactly the actions `reviewActions` allows THIS caller:
 * - the reviewer (or ADMIN), while DRAFT: rating + comments (Save sends only what changed), Submit
 *   (confirm; offered once a rating and comments are SAVED), Delete draft (confirm);
 * - the reviewed employee: a self-assessment until acknowledged (also during DRAFT, as the backend
 *   allows), Acknowledge once SUBMITTED (confirm - it does not mean agreeing);
 * - anyone who can see it, once SUBMITTED: notes (append-only).
 * While DRAFT, the reviewed employee does not see the draft's rating or comments (the API still sends
 * them - presentation, not privacy; a recorded backend gap).
 *
 * The SAME component serves `/performance-reviews/:id` and `/my-reviews/:id`; 403, 404 and a failed load
 * are separate states.
 */
@Component({
  selector: 'app-review-detail-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
    StatusPillComponent,
  ],
  providers: [ReviewDetailStore],
  templateUrl: './review-detail-page.component.html',
  styleUrl: './review-detail-page.component.scss',
})
export class ReviewDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly store = inject(ReviewDetailStore);
  protected readonly context = inject(ReviewContext);
  protected readonly cycles = inject(ReviewCycleLookup);
  protected readonly icons = ICON_NAMES;
  protected readonly ratings = RATINGS.map((value) => ({ value, label: RATING_LABEL[value] }));
  protected readonly ratingLabel = RATING_LABEL;

  private readonly reviewId = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly origin: ReviewOrigin = this.route.routeConfig?.data?.['origin'] === 'manage' ? 'manage' : 'mine';
  protected readonly back =
    this.origin === 'manage'
      ? { link: '/performance-reviews', label: 'Back to performance reviews' }
      : { link: '/my-reviews', label: 'Back to my reviews' };

  // Confirmed actions (submit / acknowledge / delete) share the confirm -> request -> report flow.
  private readonly confirmed = createConfirmDelete((action) => this.runConfirmed(action));
  /** Save / self-assessment / note - no confirm, their own busy flag. */
  protected readonly busy = signal<'save' | 'self' | 'note' | null>(null);
  private readonly directError = signal<string | null>(null);

  protected readonly actionError = computed(() => this.confirmed.deleteError() ?? this.directError());
  protected readonly confirmBusy = computed(() => {
    const [action] = this.confirmed.deletingIds();
    return action ?? null;
  });

  protected readonly actor = computed(() => this.context.actorFor(this.store.review()));
  protected readonly actions = computed<ReviewActions>(() => {
    const review = this.store.review();
    return review ? reviewActions(review, this.actor()) : NO_ACTIONS;
  });
  protected readonly showContent = computed(() => {
    const review = this.store.review();
    return review !== null && showManagerContent(review, this.actor());
  });
  protected readonly canSubmitNow = computed(() => {
    const review = this.store.review();
    return review !== null && canSubmit(review);
  });

  protected readonly assessment = this.formBuilder.group({
    rating: [null as ReviewRating | null],
    managerComments: [''],
  });
  protected readonly selfForm = this.formBuilder.nonNullable.group({ selfComments: ['', notBlankValidator] });
  protected readonly noteForm = this.formBuilder.nonNullable.group({ comment: ['', notBlankValidator] });

  constructor() {
    // Every (re)load puts the SAVED values back into the forms - what the page shows is what is stored.
    effect(() => {
      const review = this.store.review();
      if (!review) {
        return;
      }
      this.assessment.reset({ rating: review.rating, managerComments: review.managerComments ?? '' });
      this.selfForm.reset({ selfComments: review.selfComments ?? '' });
    });
  }

  ngOnInit(): void {
    this.store.load(this.reviewId);
    this.context.load().subscribe();
    this.cycles.refresh().subscribe({ error: () => undefined });
  }

  protected statusMeta(status: keyof typeof REVIEW_STATUS_META) {
    return REVIEW_STATUS_META[status];
  }

  protected statusHint(status: keyof typeof STATUS_HINT): string {
    return STATUS_HINT[status];
  }

  protected cycleLine(cycleId: string): string {
    const cycle = this.cycles.get(cycleId);
    return cycle ? `${cycle.name} (${cycleDateRange(cycle.startDate, cycle.endDate)})` : this.cycles.nameOf(cycleId);
  }

  /** The reviewer's unsaved edits, or `{}` - Save sends only what changed. */
  protected assessmentChanges(): UpdatePerformanceReviewRequest {
    const review = this.store.review();
    if (!review) {
      return {};
    }
    const raw = this.assessment.getRawValue();
    const changes: UpdatePerformanceReviewRequest = {};
    const comments = (raw.managerComments ?? '').trim();
    if (raw.rating !== null && raw.rating !== review.rating) changes.rating = raw.rating;
    if (comments !== '' && comments !== (review.managerComments ?? '')) changes.managerComments = comments;
    return changes;
  }

  protected hasUnsavedAssessment(): boolean {
    return Object.keys(this.assessmentChanges()).length > 0;
  }

  protected saveAssessment(): void {
    const changes = this.assessmentChanges();
    if (Object.keys(changes).length === 0) {
      return;
    }
    this.direct('save', this.store.save(changes));
  }

  protected saveSelfAssessment(): void {
    if (this.selfForm.invalid) {
      this.selfForm.markAllAsTouched();
      return;
    }
    this.direct('self', this.store.saveSelfAssessment(this.selfForm.getRawValue().selfComments.trim()));
  }

  /**
   * After a note is added the field is emptied through the FORM DIRECTIVE (`resetForm`), not just the
   * group: the directive stays "submitted" otherwise, and Material shows an empty, submitted field as an
   * error - the blank note box turned red after every successful note.
   */
  protected addNote(directive: FormGroupDirective): void {
    if (this.noteForm.invalid) {
      this.noteForm.markAllAsTouched();
      return;
    }
    this.direct(
      'note',
      this.store.addNote(this.noteForm.getRawValue().comment.trim()).pipe(tap(() => directive.resetForm({ comment: '' }))),
    );
  }

  protected requestSubmit(): void {
    this.confirmed.request('submit', {
      title: 'Submit this review?',
      message:
        "The employee will be able to read it and acknowledge it. The rating and comments can't be edited afterwards - later remarks are added as notes.",
      confirmLabel: 'Submit review',
      tone: 'primary',
    });
  }

  protected requestAcknowledge(): void {
    this.confirmed.request('acknowledge', {
      title: 'Acknowledge this review?',
      message:
        "This confirms you have read it. It doesn't mean you agree - you can add a note afterwards. Your self-assessment can't be changed once acknowledged.",
      confirmLabel: 'Acknowledge',
      tone: 'primary',
    });
  }

  protected requestDelete(): void {
    this.confirmed.request('delete', {
      title: 'Delete this draft review?',
      message: 'The draft and its rating and comments will be deleted. A new review can then be started for this employee and cycle.',
    });
  }

  protected authorLabel(authorId: string | null): string {
    return this.context.authorLabel(authorId);
  }

  private runConfirmed(action: string): Observable<unknown> {
    this.directError.set(null);
    if (action === 'submit') {
      return this.store.submit();
    }
    if (action === 'acknowledge') {
      return this.store.acknowledge();
    }
    return this.store.delete().pipe(tap(() => void this.router.navigateByUrl(this.back.link)));
  }

  private direct(kind: 'save' | 'self' | 'note', request: Observable<unknown>): void {
    this.directError.set(null);
    this.confirmed.deleteError.set(null);
    this.busy.set(kind);
    request
      .pipe(
        finalize(() => this.busy.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({ error: (failure: unknown) => this.directError.set(extractErrorMessage(failure)) });
  }
}
