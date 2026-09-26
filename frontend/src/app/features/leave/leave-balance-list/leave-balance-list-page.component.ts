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
import { LeaveBalance, LeaveBalanceSortField } from '../data-access/leave.models';
import { LeaveBalanceFilters, LeaveBalanceStore } from '../data-access/leave-balance.store';
import { AdjustBalanceDialogComponent, AdjustBalanceDialogData } from './adjust-balance-dialog.component';
import { LeaveBalanceTableComponent } from './leave-balance-table.component';
import { LeaveBalanceToolbarComponent } from './leave-balance-toolbar.component';

/**
 * Routed at `/leave-balances` (`leaveBalance:read:any`: ADMIN and MANAGER). The balances ledger: a
 * server-paginated table filtered by employee, leave type and year, with an Adjust action for
 * `leaveBalance:adjust:any` (ADMIN). The store is provided HERE, so every visit starts fresh.
 *
 * A balance row exists only once a leave was first approved for that employee, type and year - so an
 * empty page is a normal state and the copy says why, rather than reading as a failure. Employee and
 * leave-type names are display-only (a failure degrades to "Unknown ..." and never blocks the table).
 */
@Component({
  selector: 'app-leave-balance-list-page',
  imports: [PageHeaderComponent, InlineBannerComponent, EmptyStateComponent, LeaveBalanceToolbarComponent, LeaveBalanceTableComponent],
  providers: [LeaveBalanceStore],
  templateUrl: './leave-balance-list-page.component.html',
  styleUrl: './leave-balance-list-page.component.scss',
})
export class LeaveBalanceListPageComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly sessionStore = inject(SessionStore);
  protected readonly store = inject(LeaveBalanceStore);
  protected readonly directory = inject(EmployeeDirectoryService);
  private readonly leaveTypes = inject(LeaveTypeDirectoryService);
  protected readonly icons = ICON_NAMES;

  protected readonly canAdjust = computed(() => this.sessionStore.hasAnyPermission('leaveBalance:adjust:any'));

  /** The store's filters, handed back to the toolbar so its fields follow the store. */
  protected readonly filters = computed<LeaveBalanceFilters>(() => {
    const { employeeId, leaveTypeId, year } = this.store.query();
    return { employeeId, leaveTypeId, year };
  });

  protected readonly hasActiveFilters = computed(() => {
    const { employeeId, leaveTypeId, year } = this.filters();
    return Boolean(employeeId || leaveTypeId || year);
  });

  ngOnInit(): void {
    this.store.loadList();
    this.reloadDirectory();
    this.leaveTypes.refresh().subscribe({ error: () => undefined });
  }

  protected reloadDirectory(): void {
    this.directory.refresh().subscribe({ error: () => undefined });
  }

  protected onFiltersChange(filters: LeaveBalanceFilters): void {
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
    this.store.setSort(sort.active as LeaveBalanceSortField, sort.direction);
  }

  protected openAdjustDialog(balance: LeaveBalance): void {
    const type = this.leaveTypes.nameOf(balance.leaveTypeId) ?? 'Unknown leave type';
    const summary = `${this.directory.labelOf(balance.employeeId)} - ${type} ${balance.year}`;

    this.dialog.open<AdjustBalanceDialogComponent, AdjustBalanceDialogData, LeaveBalance>(AdjustBalanceDialogComponent, {
      data: { balance, summary, store: this.store },
      width: '480px',
      maxWidth: '95vw',
    });
  }
}
