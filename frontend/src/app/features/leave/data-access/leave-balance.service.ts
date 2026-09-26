import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import { Paginated } from '../../../shared/models/paginated.model';
import { toHttpParams } from '../../../shared/utils/http-params.util';
import { INLINE_ERROR } from './leave-http';
import { LeaveBalanceResponse, LeaveBalancesListResponse } from './leave.dto';
import { toLeaveBalance } from './leave.mapper';
import { AdjustLeaveBalanceRequest, LeaveBalance, LeaveBalanceListQuery } from './leave.models';

/** Thin HttpClient wrapper - one method per real endpoint, zero business logic (blueprint §8). */
@Injectable({ providedIn: 'root' })
export class LeaveBalanceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}/leave-balances`;

  /**
   * A caller without `leaveBalance:read:any` is scoped to their own balances BY THE SERVER. A row
   * exists only once a leave was first approved for that employee, type and year (lazy creation).
   */
  list(query: LeaveBalanceListQuery): Observable<{ items: LeaveBalance[]; pagination: Paginated }> {
    return this.http
      .get<LeaveBalancesListResponse>(this.baseUrl, { params: toHttpParams(query), context: INLINE_ERROR })
      .pipe(map(({ balances, pagination }) => ({ items: balances.map(toLeaveBalance), pagination })));
  }

  /** ADMIN only (`leaveBalance:adjust:any`); always audit-logged. */
  adjust(id: string, request: AdjustLeaveBalanceRequest): Observable<LeaveBalance> {
    return this.http
      .patch<LeaveBalanceResponse>(`${this.baseUrl}/${id}`, request, { context: INLINE_ERROR })
      .pipe(map(({ balance }) => toLeaveBalance(balance)));
  }
}
