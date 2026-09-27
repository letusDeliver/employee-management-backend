import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subscription, catchError, finalize, tap, throwError } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { PerformanceReviewDetail, UpdatePerformanceReviewRequest } from './performance.models';
import { PerformanceReviewService } from './performance-review.service';

/**
 * ONE review and its notes. Provided by the page, so every visit starts empty.
 *
 * Not found (404), someone else's (403) and a failed load are three different states. After EVERY
 * successful action the review is refetched: the server stamps statuses, times and the recorded
 * department/designation/branch, and a note's list comes only with the review. A refused action whose
 * cause may be a change made elsewhere (409) refetches too, so the page shows the real status.
 */
@Injectable()
export class ReviewDetailStore {
  private readonly api = inject(PerformanceReviewService);
  private readonly notifications = inject(NotificationService);

  readonly review = signal<PerformanceReviewDetail | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notFound = signal(false);
  readonly forbidden = signal(false);

  private reviewId: string | null = null;
  private subscription: Subscription | null = null;

  load(id: string): void {
    this.reviewId = id;
    this.reload();
  }

  reload(): void {
    const id = this.requireId();
    this.subscription?.unsubscribe();
    this.error.set(null);
    this.notFound.set(false);
    this.forbidden.set(false);
    this.loading.set(true);

    this.subscription = this.api
      .getById(id)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (review) => this.review.set(review),
        error: (failure: unknown) => {
          if (failure instanceof HttpErrorResponse && failure.status === 404) {
            this.notFound.set(true);
          } else if (failure instanceof HttpErrorResponse && failure.status === 403) {
            this.forbidden.set(true);
          } else {
            this.error.set(extractErrorMessage(failure));
          }
        },
      });
  }

  save(changes: UpdatePerformanceReviewRequest): Observable<unknown> {
    return this.act(this.api.update(this.requireId(), changes), 'Review saved.');
  }

  submit(): Observable<unknown> {
    return this.act(this.api.submit(this.requireId()), 'Review submitted.');
  }

  acknowledge(): Observable<unknown> {
    return this.act(this.api.acknowledge(this.requireId()), 'Review acknowledged.');
  }

  saveSelfAssessment(selfComments: string): Observable<unknown> {
    return this.act(this.api.setSelfAssessment(this.requireId(), selfComments), 'Self-assessment saved.');
  }

  addNote(comment: string): Observable<unknown> {
    return this.act(this.api.addNote(this.requireId(), comment), 'Note added.');
  }

  /** DRAFT only; the page leaves afterwards (there is nothing left to show). */
  delete(): Observable<void> {
    return this.api.delete(this.requireId()).pipe(tap(() => this.notifications.showSuccess('Draft review deleted.')));
  }

  private act<T>(request: Observable<T>, success: string): Observable<T> {
    return request.pipe(
      tap(() => {
        this.notifications.showSuccess(success);
        this.reload();
      }),
      catchError((failure: unknown) => {
        if (failure instanceof HttpErrorResponse && failure.status === 409) {
          this.reload();
        }
        return throwError(() => failure);
      }),
    );
  }

  private requireId(): string {
    if (!this.reviewId) {
      throw new Error('ReviewDetailStore: load(id) was not called');
    }
    return this.reviewId;
  }
}
