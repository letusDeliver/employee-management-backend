import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import { Paginated } from '../../../shared/models/paginated.model';
import { toHttpParams } from '../../../shared/utils/http-params.util';
import { INLINE_ERROR } from './payroll-run.service';
import { PayslipResponse, PayslipsListResponse } from './payroll.dto';
import { toPayslip, toPayslipDetail } from './payroll.mapper';
import { Payslip, PayslipDetail, PayslipListQuery } from './payroll.models';

/** Thin HttpClient wrapper over `/payslips` (blueprint §8). */
@Injectable({ providedIn: 'root' })
export class PayslipService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}/payslips`;

  /**
   * A caller without `payslip:read:any` is scoped to their own payslips BY THE SERVER (an
   * `employeeId` they send is silently replaced). With `:read:any` an unfiltered list is everyone's.
   * No line items here.
   */
  list(query: PayslipListQuery): Observable<{ items: Payslip[]; pagination: Paginated }> {
    return this.http
      .get<PayslipsListResponse>(this.baseUrl, { params: toHttpParams(query), context: INLINE_ERROR })
      .pipe(map(({ payslips, pagination }) => ({ items: payslips.map(toPayslip), pagination })));
  }

  /** With line items. Someone else's payslip without `:read:any` is a 403; an unknown id a 404. */
  getById(id: string): Observable<PayslipDetail> {
    return this.http
      .get<PayslipResponse>(`${this.baseUrl}/${id}`, { context: INLINE_ERROR })
      .pipe(map(({ payslip }) => toPayslipDetail(payslip)));
  }
}
