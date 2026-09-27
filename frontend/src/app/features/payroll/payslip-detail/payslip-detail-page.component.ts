import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { APP_CURRENCY } from '../../../core/config/app-currency';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { EMPLOYMENT_TYPE_LABELS } from '../../../shared/models/employment-type';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { PayslipDetail } from '../data-access/payroll.models';
import { formatDays, payslipEmployeeName, periodLabel } from '../data-access/payroll-rules';
import { PayslipService } from '../data-access/payslip.service';

/** Which area opened the payslip - decides where "back" goes. Set as route data. */
export type PayslipOrigin = 'payroll' | 'mine';

/**
 * One payslip, read like a document: who it was for and in what role (as snapshotted), the
 * attendance it was calculated from, its earnings and deductions, and the net pay.
 *
 * The SAME component serves `/payroll/:runId/payslips/:payslipId` (ADMIN, from a run) and
 * `/my-payslips/:payslipId` (anyone, their own), so "back" always returns to where the user came
 * from. The run's status is not shown: an employee cannot read runs, and a status this page cannot
 * see is not guessed.
 *
 * Three different "can't show it" states: someone else's payslip (403), an unknown one (404), and a
 * failed load (with Retry).
 */
@Component({
  selector: 'app-payslip-detail-page',
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './payslip-detail-page.component.html',
  styleUrl: './payslip-detail-page.component.scss',
})
export class PayslipDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(PayslipService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly icons = ICON_NAMES;
  protected readonly currencyCode = APP_CURRENCY;

  private readonly payslipId = this.route.snapshot.paramMap.get('payslipId') ?? '';
  // ':runId' belongs to the parent wrapper route, and a non-empty child does not inherit it.
  private readonly runId = this.route.snapshot.pathFromRoot
    .map((snapshot) => snapshot.paramMap.get('runId'))
    .find((id) => id !== null);
  protected readonly origin: PayslipOrigin = this.route.routeConfig?.data?.['origin'] === 'payroll' ? 'payroll' : 'mine';

  protected readonly payslip = signal<PayslipDetail | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notFound = signal(false);
  protected readonly forbidden = signal(false);

  protected readonly back = computed(() =>
    this.origin === 'payroll' && this.runId
      ? { link: ['/payroll', this.runId], label: 'Back to the payroll run' }
      : { link: ['/my-payslips'], label: 'Back to my payslips' },
  );

  protected readonly title = computed(() => {
    const payslip = this.payslip();
    return payslip ? `Payslip — ${periodLabel(payslip.periodMonth, payslip.periodYear)}` : 'Payslip';
  });

  protected readonly name = payslipEmployeeName;
  protected readonly days = formatDays;
  protected readonly employmentTypeLabels = EMPLOYMENT_TYPE_LABELS;

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.error.set(null);
    this.notFound.set(false);
    this.forbidden.set(false);
    this.loading.set(true);

    this.api
      .getById(this.payslipId)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (payslip) => this.payslip.set(payslip),
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
}
