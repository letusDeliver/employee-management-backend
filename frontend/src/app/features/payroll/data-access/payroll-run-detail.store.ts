import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subscription, catchError, finalize, tap, throwError } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { createPagedList } from '../../../shared/utils/paged-list.util';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { Payslip, PayslipListQuery, PayrollRun } from './payroll.models';
import { RunAction } from './payroll-rules';
import { PayrollRunService } from './payroll-run.service';
import { PayslipService } from './payslip.service';

const SUCCESS: Record<RunAction, string> = {
  process: 'Payslips generated.',
  finalize: 'Payroll run finalized.',
  markPaid: 'Payroll run marked as paid.',
};

/**
 * ONE payroll run's page: the run (with its `payslipCount`, only on `GET /:id`) and its payslips.
 * Provided by the page component, so every visit starts empty.
 *
 * Payslips are sorted by net pay, lowest first - the heaviest deductions are what a reviewer checks
 * before finalizing. (Within one run the period is constant, and the server cannot sort by name.)
 *
 * After every transition the run AND its payslips are refetched: processing creates the payslips,
 * and the server's response to a transition carries no `payslipCount`. A refused transition (409 -
 * someone else moved the run meanwhile) refetches the run too, so the page shows the real status.
 */
@Injectable()
export class PayrollRunDetailStore {
  private readonly runApi = inject(PayrollRunService);
  private readonly payslipApi = inject(PayslipService);
  private readonly notifications = inject(NotificationService);

  readonly run = signal<PayrollRun | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** The run does not exist (or was deleted meanwhile) - a different screen from a load error. */
  readonly notFound = signal(false);

  private runId: string | null = null;
  private runSubscription: Subscription | null = null;

  private readonly payslipList = createPagedList<Payslip, PayslipListQuery>((query) => this.payslipApi.list(query), {
    page: 1,
    limit: 10,
    sortBy: 'netPay',
    order: 'asc',
  });

  readonly payslips = this.payslipList.items;
  readonly payslipPagination = this.payslipList.pagination;
  readonly payslipsLoading = this.payslipList.loading;
  readonly payslipsError = this.payslipList.error;
  readonly payslipQuery = this.payslipList.query;

  load(runId: string): void {
    this.runId = runId;
    this.loadRun();
    this.payslipList.setFilters({ payrollRunId: runId, employeeId: undefined });
  }

  /** Retry after a failed load: the run and, once it is known, its payslips. */
  reload(): void {
    this.loadRun();
    this.payslipList.load();
  }

  setEmployee(employeeId: string | undefined): void {
    this.payslipList.setFilters({ employeeId });
  }

  setPayslipPage(page: number, limit: number): void {
    this.payslipList.setPage(page, limit);
  }

  setPayslipSort(order: 'asc' | 'desc'): void {
    this.payslipList.setSort('netPay', order);
  }

  perform(action: RunAction): Observable<PayrollRun> {
    const id = this.requireRunId();
    const request =
      action === 'process' ? this.runApi.process(id) : action === 'finalize' ? this.runApi.finalize(id) : this.runApi.markPaid(id);

    return request.pipe(
      tap(() => {
        this.notifications.showSuccess(SUCCESS[action]);
        this.reload();
      }),
      catchError((failure: unknown) => {
        if (failure instanceof HttpErrorResponse && failure.status === 409) {
          this.loadRun();
        }
        return throwError(() => failure);
      }),
    );
  }

  /** Only a DRAFT run; the page navigates back to the list afterwards. */
  delete(): Observable<void> {
    return this.runApi.delete(this.requireRunId()).pipe(tap(() => this.notifications.showSuccess('Payroll run deleted.')));
  }

  private loadRun(): void {
    const id = this.requireRunId();
    this.runSubscription?.unsubscribe();
    this.error.set(null);
    this.notFound.set(false);
    this.loading.set(true);

    this.runSubscription = this.runApi
      .getById(id)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (run) => this.run.set(run),
        error: (failure: unknown) => {
          if (failure instanceof HttpErrorResponse && failure.status === 404) {
            this.notFound.set(true);
          } else {
            this.error.set(extractErrorMessage(failure));
          }
        },
      });
  }

  private requireRunId(): string {
    if (!this.runId) {
      throw new Error('PayrollRunDetailStore: load(runId) was not called');
    }
    return this.runId;
  }
}
