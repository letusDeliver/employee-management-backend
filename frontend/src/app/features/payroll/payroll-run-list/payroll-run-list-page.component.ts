import { Component, OnInit, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';

import { SessionStore } from '../../../core/auth/session.store';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { createConfirmDelete } from '../../../shared/master-data/confirm-delete';
import { serverToday } from '../../../shared/utils/server-day.util';
import { PayrollRun, PayrollRunStatus } from '../data-access/payroll.models';
import { RUN_STATUSES, RUN_STATUS_META, periodLabel } from '../data-access/payroll-rules';
import { PayrollRunListStore } from '../data-access/payroll-run-list.store';
import { NewRunDialogComponent, NewRunDialogData } from './new-run-dialog.component';
import { PayrollRunTableComponent } from './payroll-run-table.component';

/**
 * Routed at `/payroll` (`payrollRun:read`, ADMIN - ADR-PR06). One year of runs, newest month first;
 * the year is always chosen (see `PayrollRunListStore`). Creating a run opens the new run's page,
 * where its next step (Process) is.
 */
@Component({
  selector: 'app-payroll-run-list-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
    PayrollRunTableComponent,
  ],
  providers: [PayrollRunListStore],
  templateUrl: './payroll-run-list-page.component.html',
  styleUrl: './payroll-run-list-page.component.scss',
})
export class PayrollRunListPageComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly sessionStore = inject(SessionStore);
  protected readonly store = inject(PayrollRunListStore);
  protected readonly icons = ICON_NAMES;

  private readonly confirmDelete = createConfirmDelete((id) => this.store.delete(id));
  protected readonly deleteError = this.confirmDelete.deleteError;
  protected readonly deletingIds = this.confirmDelete.deletingIds;

  protected readonly canCreate = computed(() => this.sessionStore.hasAnyPermission('payrollRun:create'));
  protected readonly canDeleteRuns = computed(() => this.sessionStore.hasAnyPermission('payrollRun:delete'));

  protected readonly statusOptions = RUN_STATUSES.map((value) => ({ value, label: RUN_STATUS_META[value].label }));

  /** Next year back to five years ago (by the server's year), plus whatever is selected. */
  protected readonly years = computed(() => {
    const current = Number(serverToday().slice(0, 4));
    const range = Array.from({ length: 7 }, (_, index) => current + 1 - index);
    const selected = this.store.query().periodYear;
    return [...new Set(selected === undefined ? range : [...range, selected])].sort((a, b) => b - a);
  });

  ngOnInit(): void {
    this.store.load();
  }

  protected onYearChange(year: number): void {
    this.store.setYear(year);
  }

  protected onStatusChange(status: PayrollRunStatus | ''): void {
    this.store.setStatus(status || undefined);
  }

  protected onPageChange(event: PageEvent): void {
    this.store.setPage(event.pageIndex + 1, event.pageSize);
  }

  protected openNewRunDialog(): void {
    this.dialog
      .open<NewRunDialogComponent, NewRunDialogData, PayrollRun>(NewRunDialogComponent, {
        data: { store: this.store },
        width: '440px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((run) => {
        if (run) {
          void this.router.navigate(['/payroll', run.id]);
        }
      });
  }

  protected onDeleteRequested(run: PayrollRun): void {
    this.confirmDelete.request(run.id, {
      title: 'Delete payroll run?',
      message: `The ${periodLabel(run.periodMonth, run.periodYear)} run has no payslips yet, so nothing else is removed.`,
    });
  }
}
