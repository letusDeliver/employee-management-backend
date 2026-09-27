import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import { SKIP_GLOBAL_ERROR_NOTIFICATION } from '../../../core/http/http-context-tokens';
import { Paginated } from '../../../shared/models/paginated.model';
import { toHttpParams } from '../../../shared/utils/http-params.util';
import { PayrollRunResponse, PayrollRunsListResponse } from './payroll.dto';
import { toPayrollRun } from './payroll.mapper';
import { CreatePayrollRunRequest, PayrollRun, PayrollRunListQuery } from './payroll.models';

/**
 * Every Payroll screen renders its failure INLINE (dialog banner, table banner, the run page's action
 * banner), so no Payroll request needs the global error toast - the same decision as Attendance and
 * Leave.
 */
export const INLINE_ERROR = new HttpContext().set(SKIP_GLOBAL_ERROR_NOTIFICATION, true);

/**
 * Thin HttpClient wrapper - one method per real endpoint, zero business logic (blueprint §8). Every
 * endpoint is ADMIN-only (`payrollRun:*`, ADR-PR06).
 */
@Injectable({ providedIn: 'root' })
export class PayrollRunService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}/payroll-runs`;

  list(query: PayrollRunListQuery): Observable<{ items: PayrollRun[]; pagination: Paginated }> {
    return this.http
      .get<PayrollRunsListResponse>(this.baseUrl, { params: toHttpParams(query), context: INLINE_ERROR })
      .pipe(map(({ runs, pagination }) => ({ items: runs.map(toPayrollRun), pagination })));
  }

  /** The only response that carries `payslipCount`. */
  getById(id: string): Observable<PayrollRun> {
    return this.http
      .get<PayrollRunResponse>(`${this.baseUrl}/${id}`, { context: INLINE_ERROR })
      .pipe(map(({ run }) => toPayrollRun(run)));
  }

  /** One run per calendar month: a second run for the same period is a 409. */
  create(request: CreatePayrollRunRequest): Observable<PayrollRun> {
    return this.http
      .post<PayrollRunResponse>(this.baseUrl, request, { context: INLINE_ERROR })
      .pipe(map(({ run }) => toPayrollRun(run)));
  }

  /** DRAFT -> PROCESSING, generating every active employee's payslip in the same (slow) request. */
  process(id: string): Observable<PayrollRun> {
    return this.transition(id, 'process');
  }

  finalize(id: string): Observable<PayrollRun> {
    return this.transition(id, 'finalize');
  }

  markPaid(id: string): Observable<PayrollRun> {
    return this.transition(id, 'mark-paid');
  }

  /** Only a DRAFT run; answers 200 with a message. */
  delete(id: string): Observable<void> {
    return this.http.delete(`${this.baseUrl}/${id}`, { context: INLINE_ERROR }).pipe(map(() => undefined));
  }

  private transition(id: string, step: 'process' | 'finalize' | 'mark-paid'): Observable<PayrollRun> {
    return this.http
      .patch<PayrollRunResponse>(`${this.baseUrl}/${id}/${step}`, {}, { context: INLINE_ERROR })
      .pipe(map(({ run }) => toPayrollRun(run)));
  }
}
