import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription, finalize, switchMap, tap } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { AttendanceRecord, EffectiveStatusResult } from './attendance.models';
import { AttendanceService } from './attendance.service';
import { serverToday } from './attendance-status';

/**
 * Is this the backend's "your account has no employee record" answer? It is a 400 from
 * `attendance.service.js`'s `resolveOwnEmployee` with a fixed message - the only 400 the own-status
 * call can produce (the `date` we send is always valid). Matching the message as well as the status
 * keeps any other 400 an ordinary error.
 */
const isNotLinked = (error: unknown): boolean =>
  error instanceof HttpErrorResponse &&
  error.status === 400 &&
  /no employee record/i.test((error.error as { message?: string } | null)?.message ?? '');

/**
 * The "today" card of a signed-in user (every role). Provided by the page component, so each visit
 * starts fresh.
 *
 * Which day? Check-in and check-out act on the SERVER's current UTC date, so the card asks about
 * `serverToday()` - not the user's local date - and, after an action, follows the date of the record
 * the server returned. Otherwise a check-in from a zone whose local date differs from UTC's would
 * succeed and then read back as ABSENT.
 *
 * One backend quirk shapes `record`: on a HOLIDAY / WEEK_OFF / ON_LEAVE day the effective-status
 * response carries `record: null` even when a record exists (it answers before looking the record
 * up). So the punches a user just made are remembered from the action's own response, and on a
 * fresh load of such a day the card cannot know - the server's 409 then says so.
 */
@Injectable()
export class MyAttendanceStore {
  private readonly api = inject(AttendanceService);
  private readonly notifications = inject(NotificationService);

  readonly status = signal<EffectiveStatusResult | null>(null);
  readonly record = signal<AttendanceRecord | null>(null);
  /** The `YYYY-MM-DD` day the card is about. */
  readonly date = signal<string>(serverToday());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** The account has no employee record: nothing to check in as. A different screen from an error. */
  readonly notLinked = signal(false);
  readonly acting = signal(false);
  readonly actionError = signal<string | null>(null);

  readonly canCheckIn = computed(() => !this.acting() && this.status() !== null && !this.record()?.checkIn);
  readonly canCheckOut = computed(() => {
    const record = this.record();
    return !this.acting() && this.status() !== null && !!record?.checkIn && !record.checkOut;
  });

  // Only the latest load may write to state; unsubscribing first runs the old finalize().
  private loadSubscription: Subscription | null = null;

  /** (Re)loads the status of `date` - by default the server's current day. */
  load(date: string = serverToday()): void {
    this.loadSubscription?.unsubscribe();
    this.error.set(null);
    this.notLinked.set(false);
    this.loading.set(true);
    this.date.set(date);

    this.loadSubscription = this.api
      .effectiveStatus(date)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (result) => this.applyStatus(result),
        error: (error: unknown) => {
          if (isNotLinked(error)) {
            this.notLinked.set(true);
          } else {
            this.error.set(extractErrorMessage(error));
          }
        },
      });
  }

  checkIn(): void {
    this.act(this.api.checkIn(), 'Checked in.');
  }

  checkOut(): void {
    this.act(this.api.checkOut(), 'Checked out.');
  }

  private act(request$: ReturnType<AttendanceService['checkIn']>, success: string): void {
    this.actionError.set(null);
    this.acting.set(true);

    request$
      .pipe(
        tap((record) => {
          this.record.set(record);
          this.date.set(record.date.slice(0, 10));
        }),
        // The response is only the record; the STATUS (Present or Late) is computed by the server.
        switchMap((record) => this.api.effectiveStatus(record.date.slice(0, 10))),
        finalize(() => this.acting.set(false)),
      )
      .subscribe({
        next: (result) => {
          this.notifications.showSuccess(success);
          this.applyStatus(result);
        },
        error: (error: unknown) => {
          // A 409/400 means the card was stale (another tab, another device) - say what the server said, then resync.
          this.actionError.set(extractErrorMessage(error));
          this.load(this.date());
        },
      });
  }

  private applyStatus(result: EffectiveStatusResult): void {
    this.status.set(result);

    if (result.record) {
      this.record.set(result.record);
      return;
    }

    // Only a non-working day hides an existing record (see the class comment), so only there may
    // a remembered record survive - on a working day `record: null` means there really is none.
    const known = this.record();
    const hidesRecord = result.status === 'HOLIDAY' || result.status === 'WEEK_OFF' || result.status === 'ON_LEAVE';
    if (!(hidesRecord && known && known.date.slice(0, 10) === result.date.slice(0, 10))) {
      this.record.set(null);
    }
  }
}
