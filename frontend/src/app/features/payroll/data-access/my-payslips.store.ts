import { Injectable, computed, inject, signal } from '@angular/core';
import { EMPTY, Observable, Subscription, expand, finalize, map, reduce } from 'rxjs';

import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { Payslip } from './payroll.models';
import { byPeriodDesc } from './payroll-rules';
import { PayslipService } from './payslip.service';

/** The largest page the API allows. A person has one payslip a month, so this is rarely more than one page. */
const PAGE_SIZE = 100;

/**
 * "My payslips" (every role). Provided by the page, so every visit starts fresh.
 *
 * ALL of the caller's payslips are loaded (paging through every page) and ordered here, newest
 * period first. The backend sorts by one key with `id` as the tie-break and has no year filter on
 * `/payslips`, so neither "by year" nor "by month" alone gives calendar order; a person's payslips
 * are one a month, so loading them all is small and always right.
 *
 * WHO "my" is: a caller without `payslip:read:any` (MANAGER, EMPLOYEE) is scoped to themselves BY
 * THE SERVER, so `start()` sends no employee id. An ADMIN holds `:read:any`, and an unfiltered list
 * would be the whole organisation's pay - so the page passes the ADMIN's own employee id, and
 * without one `markNotLinked()` shows that state and nothing is fetched.
 */
@Injectable()
export class MyPayslipsStore {
  private readonly api = inject(PayslipService);

  readonly payslips = signal<Payslip[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notLinked = signal(false);
  /** False until the first load finished - an empty list before that is not "no payslips". */
  readonly loaded = signal(false);

  // `null` = not chosen; the newest year with payslips is shown.
  private readonly yearChoice = signal<number | null>(null);

  /** Years that actually have payslips, newest first. */
  readonly years = computed(() => [...new Set(this.payslips().map((payslip) => payslip.periodYear))].sort((a, b) => b - a));

  readonly selectedYear = computed<number | null>(() => {
    const choice = this.yearChoice();
    const years = this.years();
    return choice !== null && years.includes(choice) ? choice : (years[0] ?? null);
  });

  readonly visiblePayslips = computed(() => this.payslips().filter((payslip) => payslip.periodYear === this.selectedYear()));

  private employeeId: string | undefined;
  private subscription: Subscription | null = null;

  /** `employeeId` only for a caller with `payslip:read:any` (see the class comment). */
  start(employeeId?: string): void {
    this.employeeId = employeeId;
    this.notLinked.set(false);
    this.load();
  }

  markNotLinked(): void {
    this.notLinked.set(true);
  }

  load(): void {
    this.subscription?.unsubscribe();
    this.error.set(null);
    this.loading.set(true);

    this.subscription = this.fetchAll()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (payslips) => {
          this.payslips.set([...payslips].sort(byPeriodDesc));
          this.loaded.set(true);
        },
        error: (failure: unknown) => this.error.set(extractErrorMessage(failure)),
      });
  }

  selectYear(year: number): void {
    this.yearChoice.set(year);
  }

  private fetchAll(): Observable<Payslip[]> {
    const page = (number: number) =>
      this.api.list({ page: number, limit: PAGE_SIZE, employeeId: this.employeeId, sortBy: 'periodYear', order: 'desc' });

    return page(1).pipe(
      expand((result) =>
        result.pagination.page < result.pagination.totalPages ? page(result.pagination.page + 1) : EMPTY,
      ),
      map((result) => result.items),
      reduce((all, items) => [...all, ...items], [] as Payslip[]),
    );
  }
}
