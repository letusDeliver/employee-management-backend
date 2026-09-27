import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { UserDirectoryService } from '../../../core/users/user-directory.service';
import { ReviewActor } from './review-rules';

/** Whether the caller's own employee is known yet: loading, known (id or `null` = no record), or failed. */
export type OwnEmployeeState = 'loading' | 'known' | 'failed';

/**
 * WHO the caller is, as far as reviews go, and how to NAME the people on a review for this caller.
 *
 * The caller's own employee id comes from the employee directory, which needs `employee:read:any`
 * (ADMIN, MANAGER). An EMPLOYEE cannot list employees and the API has no "my employee record"
 * endpoint - but an EMPLOYEE holds only `performanceReview:read:own`, so any review the server RETURNS
 * to them is theirs (someone else's is a 403). `actorFor(review)` uses exactly that: for a caller who
 * can read only their own reviews, the subject of a review they could load is themselves.
 *
 * Names never fall back to an id: ADMIN sees real names; MANAGER sees "Designation, Department" (the
 * directory's existing wording - they cannot list users) and "You"; EMPLOYEE sees "You" and "Your
 * reviewer" (they cannot look anyone up - a recorded backend gap).
 */
@Injectable({ providedIn: 'root' })
export class ReviewContext {
  private readonly sessionStore = inject(SessionStore);
  private readonly directory = inject(EmployeeDirectoryService);
  private readonly users = inject(UserDirectoryService);

  readonly ownEmployeeId = signal<string | null>(null);
  readonly ownState = signal<OwnEmployeeState>('loading');

  /** Can this caller use the employee directory at all (names, own id, managers)? */
  readonly canUseDirectory = computed(() => this.sessionStore.hasAnyPermission('employee:read:any'));

  readonly manageAny = computed(() => this.sessionStore.hasAnyPermission('performanceReview:manage:any'));
  readonly manageReports = computed(() => this.sessionStore.hasAnyPermission('performanceReview:manage:reports'));

  /** Only their own reviews are readable to this caller (EMPLOYEE). */
  readonly ownOnly = computed(
    () =>
      !this.sessionStore.hasAnyPermission(
        'performanceReview:read:any',
        'performanceReview:manage:any',
        'performanceReview:manage:reports',
      ),
  );

  /**
   * Resolves the caller's own employee id when the directory is available to them; otherwise it stays
   * unknown (`null`, 'known') and `actorFor` relies on server scoping. Emits once done; never errors
   * (a failure sets `ownState` to 'failed' so a page can block with a Retry).
   */
  load(): Observable<void> {
    this.ownState.set('loading');

    if (!this.canUseDirectory()) {
      this.ownEmployeeId.set(null);
      this.ownState.set('known');
      return of(undefined);
    }

    return this.directory.refresh().pipe(
      tap(() => {
        this.ownEmployeeId.set(this.directory.ownEmployeeId(this.sessionStore.user()?.id));
        this.ownState.set('known');
      }),
      map(() => undefined),
      catchError(() => {
        this.ownEmployeeId.set(null);
        this.ownState.set('failed');
        return of(undefined);
      }),
    );
  }

  /** The actor `reviewActions` judges - see the class comment for the own-only case. */
  actorFor(review: { employeeId: string } | null): ReviewActor {
    const own = this.ownEmployeeId() ?? (this.ownOnly() && review ? review.employeeId : null);
    return { manageAny: this.manageAny(), manageReports: this.manageReports(), ownEmployeeId: own };
  }

  /** The reviewed employee. */
  subjectLabel(review: { employeeId: string }, actor: ReviewActor): string {
    if (actor.ownEmployeeId !== null && review.employeeId === actor.ownEmployeeId) {
      return 'You';
    }
    return this.canUseDirectory() ? this.directory.labelOf(review.employeeId) : 'Employee';
  }

  /** The stored reviewer (an employee id). */
  reviewerLabel(review: { reviewerId: string }, actor: ReviewActor): string {
    if (actor.ownEmployeeId !== null && review.reviewerId === actor.ownEmployeeId) {
      return 'You';
    }
    return this.canUseDirectory() ? this.directory.labelOf(review.reviewerId) : 'Your reviewer';
  }

  /** A note's author - a USER id, `null` when that user was deleted. */
  authorLabel(authorId: string | null): string {
    if (authorId === null) {
      return 'A removed user';
    }
    if (authorId === this.sessionStore.user()?.id) {
      return 'You';
    }
    if (this.canUseDirectory()) {
      const employee = this.directory.entries().find((entry) => entry.userId === authorId);
      if (employee) {
        return this.directory.labelOf(employee.id);
      }
    }
    return this.users.resolveDisplayName(authorId) ?? 'Someone else';
  }
}
