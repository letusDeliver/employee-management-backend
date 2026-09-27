import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Sort } from '@angular/material/sort';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { tap } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { EmployeePickerComponent } from '../../../shared/components/employee-picker/employee-picker.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusPillComponent } from '../../../shared/components/status-pill/status-pill.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { ConfirmDeleteCopy, createConfirmDelete } from '../../../shared/master-data/confirm-delete';
import { serverToday } from '../../../shared/utils/server-day.util';
import { PayrollRun } from '../data-access/payroll.models';
import {
  RUN_ACTION_LABEL,
  RUN_STATUSES,
  RUN_STATUS_HINT,
  RUN_STATUS_META,
  RunAction,
  canDelete,
  isPeriodOver,
  nextAction,
  periodLabel,
} from '../data-access/payroll-rules';
import { PayrollRunDetailStore } from '../data-access/payroll-run-detail.store';
import { RunPayslipTableComponent } from './run-payslip-table.component';

/** The permission each transition needs (`payrollRun.routes.js`). */
const ACTION_PERMISSION: Record<RunAction, string> = {
  process: 'payrollRun:process',
  finalize: 'payrollRun:finalize',
  markPaid: 'payrollRun:markPaid',
};

/**
 * Routed at `/payroll/:runId` (ADMIN). The run's lifecycle as steps, the ONE next action the server
 * accepts from its status (`nextAction`), Delete while it is a DRAFT, and its payslips.
 *
 * Each confirm says what that step actually does. Processing is the one-way door - afterwards the
 * run can be neither deleted nor processed again - and it counts every working day without an
 * attendance record as unpaid; when the month has not ended by the SERVER's day, the remaining days
 * are among them, so the confirm carries a warning (the backend allows it, so the UI does not block).
 *
 * The in-flight action replaces the button with a spinner ("Generating payslips…" for processing, one
 * synchronous request), and leaving the page cancels it (`createConfirmDelete` subscribes with
 * `takeUntilDestroyed`).
 */
@Component({
  selector: 'app-payroll-run-detail-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
    StatusPillComponent,
    EmployeePickerComponent,
    RunPayslipTableComponent,
  ],
  providers: [PayrollRunDetailStore],
  templateUrl: './payroll-run-detail-page.component.html',
  styleUrl: './payroll-run-detail-page.component.scss',
})
export class PayrollRunDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly runId = this.route.snapshot.paramMap.get('runId') ?? '';
  private readonly destroyRef = inject(DestroyRef);
  private readonly sessionStore = inject(SessionStore);
  protected readonly directory = inject(EmployeeDirectoryService);
  protected readonly store = inject(PayrollRunDetailStore);
  protected readonly icons = ICON_NAMES;
  protected readonly steps = RUN_STATUSES.map((status) => ({ status, label: RUN_STATUS_META[status].label }));

  // One confirm -> request -> report-failure flow per kind of action; only one can be in flight.
  private readonly transition = createConfirmDelete((action) => this.store.perform(action as RunAction));
  // After a delete the run no longer exists, so the page goes back to the list.
  private readonly removal = createConfirmDelete(() =>
    this.store.delete().pipe(tap(() => void this.router.navigate(['/payroll']))),
  );

  protected readonly actionError = computed(() => this.transition.deleteError() ?? this.removal.deleteError());
  protected readonly busyAction = computed<string | null>(() => {
    const [transition] = this.transition.deletingIds();
    return transition ?? (this.removal.deletingIds().size > 0 ? 'delete' : null);
  });

  protected readonly employeeFilter = new FormControl<string | null>(null);

  protected readonly action = computed<RunAction | null>(() => {
    const run = this.store.run();
    if (!run) {
      return null;
    }
    const next = nextAction(run);
    return next && this.sessionStore.hasAnyPermission(ACTION_PERMISSION[next]) ? next : null;
  });

  protected readonly deletable = computed(() => {
    const run = this.store.run();
    return run !== null && canDelete(run) && this.sessionStore.hasAnyPermission('payrollRun:delete');
  });

  protected readonly title = computed(() => {
    const run = this.store.run();
    return run ? `Payroll — ${periodLabel(run.periodMonth, run.periodYear)}` : 'Payroll run';
  });

  ngOnInit(): void {
    this.store.load(this.runId);
    // Names for the employee filter only; the table shows each payslip's own snapshot.
    this.directory.refresh().subscribe({ error: () => undefined });

    this.employeeFilter.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((employeeId) => this.store.setEmployee(employeeId ?? undefined));
  }

  protected actionLabel(action: RunAction): string {
    return RUN_ACTION_LABEL[action];
  }

  protected statusHint(run: PayrollRun): string {
    return RUN_STATUS_HINT[run.status];
  }

  protected statusMeta(run: PayrollRun) {
    return RUN_STATUS_META[run.status];
  }

  /** `done` / `current` / `todo` for the step list. */
  protected stepState(run: PayrollRun, index: number): 'done' | 'current' | 'todo' {
    const current = RUN_STATUSES.indexOf(run.status);
    return index < current ? 'done' : index === current ? 'current' : 'todo';
  }

  protected onAction(run: PayrollRun, action: RunAction): void {
    this.transition.request(action, this.confirmCopy(run, action));
  }

  protected onDelete(run: PayrollRun): void {
    this.removal.request(run.id, {
      title: 'Delete payroll run?',
      message: `The ${periodLabel(run.periodMonth, run.periodYear)} run has no payslips yet, so nothing else is removed.`,
    });
  }

  protected reloadDirectory(): void {
    this.directory.refresh().subscribe({ error: () => undefined });
  }

  protected onPageChange(event: PageEvent): void {
    this.store.setPayslipPage(event.pageIndex + 1, event.pageSize);
  }

  protected onSortChange(sort: Sort): void {
    if (!sort.direction) {
      // MatSort's "cleared" third-click state - keep the previous order rather than send none.
      return;
    }
    this.store.setPayslipSort(sort.direction);
  }

  private confirmCopy(run: PayrollRun, action: RunAction): ConfirmDeleteCopy {
    const period = periodLabel(run.periodMonth, run.periodYear);

    if (action === 'process') {
      return {
        title: `Process ${period} payroll?`,
        message:
          'This creates a payslip for every active employee from their salary, attendance and approved leave. ' +
          'A working day with no attendance record counts as unpaid. ' +
          "A processed run can't be deleted or processed again.",
        confirmLabel: 'Process payroll',
        tone: 'warn',
        warning: isPeriodOver(run, serverToday())
          ? undefined
          : `${period} hasn't ended yet (server date ${serverToday()}), so its remaining days have no attendance and will be counted as unpaid.`,
      };
    }

    if (action === 'finalize') {
      return {
        title: `Finalize ${period} payroll?`,
        message: 'This marks the payslips as final. Corrections after this are made as adjustments in a later run.',
        confirmLabel: 'Finalize',
        tone: 'primary',
      };
    }

    return {
      title: `Mark ${period} as paid?`,
      message: 'This records that the payslips were paid. It does not move any money.',
      confirmLabel: 'Mark as paid',
      tone: 'primary',
    };
  }
}
