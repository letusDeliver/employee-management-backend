import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Sort } from '@angular/material/sort';

import { SessionStore } from '../../../core/auth/session.store';
import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { LeaveTypeDirectoryService } from '../../../core/master-data-directory/leave-type-directory.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { createConfirmDelete } from '../../../shared/master-data/confirm-delete';
import { serverToday } from '../../../shared/utils/server-day.util';
import { LeaveRequest, LeaveRequestSortField, LeaveRequestStatus } from '../data-access/leave.models';
import { LEAVE_STATUSES, LEAVE_STATUS_META, formatDateRange, formatDays, remainingDays } from '../data-access/leave-rules';
import { MyLeaveStore } from '../data-access/my-leave.store';
import { ApplyLeaveDialogComponent, ApplyLeaveDialogData } from './apply-leave-dialog.component';
import { MyLeaveTableComponent } from './my-leave-table.component';

/**
 * Routed at `/my-leave`, open to every role (`leaveRequest:create:own`). The caller's own balances
 * and requests, with Apply and Cancel. The store is provided HERE, so every visit starts fresh.
 *
 * WHO "my" is: a plain EMPLOYEE is scoped to themselves by the server. ADMIN and MANAGER can read
 * everyone's leave, so for them the page first resolves THEIR OWN employee record from the employee
 * directory (their permissions allow that) and hands its id to the store; without one it shows the
 * "not linked" state and fetches nothing - the organisation's leave must never appear under "My
 * leave". A failed directory load is a blocking error with a Retry for the same reason.
 *
 * The leave-type directory is display-only here (names in the table and the balance cards): a failed
 * load degrades to "Unknown leave type". (The apply dialog, where a type is mandatory, blocks instead.)
 */
@Component({
  selector: 'app-my-leave-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
    MyLeaveTableComponent,
  ],
  providers: [MyLeaveStore],
  templateUrl: './my-leave-page.component.html',
  styleUrl: './my-leave-page.component.scss',
})
export class MyLeavePageComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly sessionStore = inject(SessionStore);
  private readonly employeeDirectory = inject(EmployeeDirectoryService);
  private readonly leaveTypes = inject(LeaveTypeDirectoryService);
  protected readonly store = inject(MyLeaveStore);
  protected readonly icons = ICON_NAMES;

  private readonly confirmCancel = createConfirmDelete((id) => this.store.cancel(id));
  protected readonly actionError = this.confirmCancel.deleteError;
  protected readonly cancellingIds = this.confirmCancel.deletingIds;

  /** Set when the caller can read everyone's leave but their own employee could not be determined. */
  protected readonly ownerError = signal<string | null>(null);

  protected readonly statusOptions = LEAVE_STATUSES.map((value) => ({ value, label: LEAVE_STATUS_META[value].label }));

  /** This year, the year before and the year after - where a person's leave realistically is. */
  protected readonly years = computed(() => {
    const current = Number(serverToday().slice(0, 4));
    const selected = this.store.year();
    return [...new Set([current - 1, current, current + 1, selected])].sort((a, b) => a - b);
  });

  protected readonly balanceCards = computed(() =>
    this.store.balances().map((balance) => ({
      id: balance.id,
      name: this.leaveTypes.nameOf(balance.leaveTypeId) ?? 'Unknown leave type',
      remaining: formatDays(remainingDays(balance)),
      used: formatDays(balance.consumed),
      entitlement: formatDays(balance.entitlement),
    })),
  );

  ngOnInit(): void {
    // Display-only names: a failure degrades to "Unknown leave type", it never blocks the page.
    this.leaveTypes.refresh().subscribe({ error: () => undefined });
    this.resolveOwner();
  }

  /** A caller with `:read:any` needs their own employee id; everyone else is scoped by the server. */
  protected resolveOwner(): void {
    this.ownerError.set(null);

    if (!this.sessionStore.hasAnyPermission('leaveRequest:read:any', 'leaveBalance:read:any')) {
      this.store.start();
      return;
    }

    this.employeeDirectory.refresh().subscribe({
      next: () => {
        const ownId = this.employeeDirectory.ownEmployeeId(this.sessionStore.user()?.id);
        if (ownId) {
          this.store.start(ownId);
        } else {
          this.store.markNotLinked();
        }
      },
      error: () => this.ownerError.set("Couldn't work out which employee record is yours, so your leave can't be shown."),
    });
  }

  protected onStatusChange(status: LeaveRequestStatus | ''): void {
    this.store.setStatus(status || undefined);
  }

  protected onPageChange(event: PageEvent): void {
    this.store.setPage(event.pageIndex + 1, event.pageSize);
  }

  protected onSortChange(sort: Sort): void {
    if (!sort.direction) {
      // MatSort's "cleared" third-click state - keep the previous sort rather than send no direction.
      return;
    }
    this.store.setSort(sort.active as LeaveRequestSortField, sort.direction);
  }

  protected openApplyDialog(): void {
    this.dialog.open<ApplyLeaveDialogComponent, ApplyLeaveDialogData, LeaveRequest>(ApplyLeaveDialogComponent, {
      data: { store: this.store },
      width: '520px',
      maxWidth: '95vw',
    });
  }

  protected onCancelRequested(request: LeaveRequest): void {
    const type = this.leaveTypes.nameOf(request.leaveTypeId) ?? 'leave';
    const approved = request.status === 'APPROVED';

    this.confirmCancel.request(request.id, {
      title: 'Cancel leave request',
      message: `Cancel your ${type} request for ${formatDateRange(request.startDate, request.endDate)}?${approved ? ' The days will be given back to your balance.' : ''}`,
      confirmLabel: 'Cancel request',
      cancelLabel: 'Keep request',
    });
  }
}
