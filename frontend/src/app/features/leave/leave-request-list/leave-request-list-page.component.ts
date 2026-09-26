import { Component, OnInit, computed, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';

import { SessionStore } from '../../../core/auth/session.store';
import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { LeaveTypeDirectoryService } from '../../../core/master-data-directory/leave-type-directory.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { createConfirmDelete } from '../../../shared/master-data/confirm-delete';
import { LeaveRequest, LeaveRequestSortField } from '../data-access/leave.models';
import { DecideActor, canDecide, formatDateRange } from '../data-access/leave-rules';
import { LeaveRequestFilters, LeaveRequestStore } from '../data-access/leave-request.store';
import { LeaveRequestTableComponent } from './leave-request-table.component';
import { LeaveRequestToolbarComponent } from './leave-request-toolbar.component';
import { RejectLeaveDialogComponent, RejectLeaveDialogData } from './reject-leave-dialog.component';

/**
 * Routed at `/leave-requests` (`leaveRequest:read:any`: ADMIN and MANAGER). The requests ledger:
 * a server-paginated table with employee, status, type and date filters, starting on PENDING - what
 * an approver came for. The store is provided HERE, so every visit starts from that default.
 *
 * WHO MAY DECIDE is not on the request, so the page works it out (`canDecide`): ADMIN
 * (`decide:any`) any pending request; a MANAGER (`decide:reports`) only where the requester's
 * `managerId` is THEIR OWN employee id, both read from the employee directory. Until the directory
 * loads - or if it fails, in which case a warning with a Retry says so - no decision buttons are
 * offered rather than ones the server may refuse; the server stays the authority either way and a
 * 403 / 409 (already decided, insufficient balance) is shown inline. Rows the caller cannot decide
 * say "Not your report" instead of being hidden.
 *
 * Employee and leave-type names are display-only here: a failure degrades to "Unknown employee" /
 * "Unknown leave type" and never blocks the table.
 */
@Component({
  selector: 'app-leave-request-list-page',
  imports: [
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
    LeaveRequestToolbarComponent,
    LeaveRequestTableComponent,
  ],
  providers: [LeaveRequestStore],
  templateUrl: './leave-request-list-page.component.html',
  styleUrl: './leave-request-list-page.component.scss',
})
export class LeaveRequestListPageComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly sessionStore = inject(SessionStore);
  protected readonly store = inject(LeaveRequestStore);
  protected readonly directory = inject(EmployeeDirectoryService);
  private readonly leaveTypes = inject(LeaveTypeDirectoryService);
  protected readonly icons = ICON_NAMES;

  private readonly approveFlow = createConfirmDelete((id) => this.store.approve(id));
  private readonly cancelFlow = createConfirmDelete((id) => this.store.cancel(id));

  /**
   * The failure to show: an approval or a cancellation the server refused. (A rejection's failure is
   * shown inside its own dialog, which stays open.)
   */
  protected readonly actionError = computed(() => this.approveFlow.deleteError() ?? this.cancelFlow.deleteError());

  protected readonly busyIds = computed(() => new Set([...this.approveFlow.deletingIds(), ...this.cancelFlow.deletingIds()]));

  protected readonly canCancelAny = computed(() => this.sessionStore.hasAnyPermission('leaveRequest:cancel:any'));

  private readonly actor = computed<DecideActor>(() => ({
    canDecideAny: this.sessionStore.hasAnyPermission('leaveRequest:decide:any'),
    canDecideReports: this.sessionStore.hasAnyPermission('leaveRequest:decide:reports'),
    ownEmployeeId: this.directory.ownEmployeeId(this.sessionStore.user()?.id),
  }));

  /** The PENDING rows on this page the caller may approve or reject. */
  protected readonly decidableIds = computed(
    () =>
      new Set(
        this.store
          .requests()
          .filter((request) => canDecide(request, (id) => this.directory.managerIdOf(id), this.actor()))
          .map((request) => request.id),
      ),
  );

  /** A MANAGER (who may decide only their reports) is told which pending rows are not theirs. */
  protected readonly showNotYourReport = computed(() => {
    const actor = this.actor();
    return actor.canDecideReports && !actor.canDecideAny && this.directory.loaded();
  });

  /** The store's filters, handed back to the toolbar so its fields follow the store. */
  protected readonly filters = computed<LeaveRequestFilters>(() => {
    const { employeeId, leaveTypeId, status, dateFrom, dateTo } = this.store.query();
    return { employeeId, leaveTypeId, status, dateFrom, dateTo };
  });

  // Distinguishes "the ledger is empty" from "this filter matched nothing" - different copy.
  protected readonly hasActiveFilters = computed(() => {
    const { employeeId, leaveTypeId, status, dateFrom, dateTo } = this.filters();
    return Boolean(employeeId || leaveTypeId || status || dateFrom || dateTo);
  });

  ngOnInit(): void {
    this.store.loadList();
    // Display-only names, but ALSO what decides whether decision buttons are offered: a failure is a
    // warning with a Retry, never a replacement for the table.
    this.reloadDirectory();
    this.leaveTypes.refresh().subscribe({ error: () => undefined });
  }

  protected reloadDirectory(): void {
    this.directory.refresh().subscribe({ error: () => undefined });
  }

  protected onFiltersChange(filters: LeaveRequestFilters): void {
    this.store.setFilters(filters);
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

  private summary(request: LeaveRequest): string {
    const type = this.leaveTypes.nameOf(request.leaveTypeId) ?? 'leave';
    return `${this.directory.labelOf(request.employeeId)} - ${type}, ${formatDateRange(request.startDate, request.endDate)}`;
  }

  private clearErrors(): void {
    this.approveFlow.deleteError.set(null);
    this.cancelFlow.deleteError.set(null);
  }

  protected onApproveRequested(request: LeaveRequest): void {
    this.clearErrors();
    this.approveFlow.request(request.id, {
      title: 'Approve leave request',
      message: `Approve ${this.summary(request)}? The days counted for it are worked out now and deducted from the employee's balance; this fails if the balance is too low.`,
      confirmLabel: 'Approve',
      tone: 'primary',
    });
  }

  protected onRejectRequested(request: LeaveRequest): void {
    this.clearErrors();
    this.dialog.open<RejectLeaveDialogComponent, RejectLeaveDialogData, LeaveRequest>(RejectLeaveDialogComponent, {
      data: { request, summary: this.summary(request), store: this.store },
      width: '480px',
      maxWidth: '95vw',
    });
  }

  protected onCancelRequested(request: LeaveRequest): void {
    this.clearErrors();
    this.cancelFlow.request(request.id, {
      title: 'Cancel leave request',
      message: `Cancel ${this.summary(request)}?${request.status === 'APPROVED' ? " The days will be given back to the employee's balance." : ''}`,
      confirmLabel: 'Cancel request',
      cancelLabel: 'Keep request',
    });
  }
}
