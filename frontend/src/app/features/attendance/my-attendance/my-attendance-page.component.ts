import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { parseDateOnly } from '../../../shared/utils/date-only.util';
import { AttendanceStatusBadgeComponent } from '../attendance-status-badge/attendance-status-badge.component';
import { STATUS_META, localToday, punchLabel, workedDuration } from '../data-access/attendance-status';
import { MyAttendanceStore } from '../data-access/my-attendance.store';

/**
 * Routed at `/my-attendance`, open to every role (`attendance:checkin`). Today's card: the
 * computed status and the caller's own punches, with Check in / Check out. The store is provided
 * HERE, so every visit starts fresh.
 *
 * The day shown is the SERVER's day (UTC), because that is the day the buttons act on - see
 * `MyAttendanceStore`. When it is not the user's local date the card says so, instead of quietly
 * showing a date that looks wrong. There is no history here: the backend has no "list my own
 * records" endpoint (only `attendance:read:any` can list).
 */
@Component({
  selector: 'app-my-attendance-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
    AttendanceStatusBadgeComponent,
  ],
  providers: [MyAttendanceStore],
  templateUrl: './my-attendance-page.component.html',
  styleUrl: './my-attendance-page.component.scss',
})
export class MyAttendancePageComponent implements OnInit {
  protected readonly store = inject(MyAttendanceStore);
  protected readonly icons = ICON_NAMES;

  /** The card's day as a local calendar `Date`, for the date pipe. */
  protected readonly day = computed(() => parseDateOnly(this.store.date()));

  /** The user's own date, only when it differs from the day the server files punches under. */
  protected readonly differingLocalDate = computed(() => {
    const local = localToday();
    return local === this.store.date() ? null : parseDateOnly(local);
  });

  protected readonly explanation = computed(() => {
    const result = this.store.status();
    return result ? STATUS_META[result.status].explanation : '';
  });

  protected readonly checkIn = computed(() => punchLabel(this.store.record()?.checkIn ?? null, this.store.date()));
  protected readonly checkOut = computed(() => punchLabel(this.store.record()?.checkOut ?? null, this.store.date()));

  protected readonly worked = computed(() => {
    const record = this.store.record();
    return record ? workedDuration(record.checkIn, record.checkOut) : null;
  });

  ngOnInit(): void {
    this.store.load();
  }

  protected reload(): void {
    this.store.load();
  }
}
