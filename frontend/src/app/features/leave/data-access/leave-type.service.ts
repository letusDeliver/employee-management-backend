import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import { MasterDataApi, MasterDataPage } from '../../../shared/master-data/master-data.models';
import { Paginated } from '../../../shared/models/paginated.model';
import { toHttpParams } from '../../../shared/utils/http-params.util';
import { INLINE_ERROR } from './leave-http';
import { CreateLeaveTypeRequest, LeaveType, LeaveTypeListQuery, UpdateLeaveTypeRequest } from './leave.models';

/**
 * Thin HttpClient wrapper - one method per real endpoint, zero business logic (blueprint §8). Owns
 * the `/leave-types` path and maps this endpoint's own response key (`leaveTypes`) into the neutral
 * `items` that `MasterDataStore` consumes.
 */
@Injectable({ providedIn: 'root' })
export class LeaveTypeService
  implements MasterDataApi<LeaveType, CreateLeaveTypeRequest, UpdateLeaveTypeRequest, LeaveTypeListQuery>
{
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}/leave-types`;

  list(query: LeaveTypeListQuery): Observable<MasterDataPage<LeaveType>> {
    return this.http
      .get<{ leaveTypes: LeaveType[]; pagination: Paginated }>(this.baseUrl, { params: toHttpParams(query), context: INLINE_ERROR })
      .pipe(map(({ leaveTypes, pagination }) => ({ items: leaveTypes, pagination })));
  }

  create(request: CreateLeaveTypeRequest): Observable<LeaveType> {
    return this.http
      .post<{ leaveType: LeaveType }>(this.baseUrl, request, { context: INLINE_ERROR })
      .pipe(map(({ leaveType }) => leaveType));
  }

  update(id: string, request: UpdateLeaveTypeRequest): Observable<LeaveType> {
    return this.http
      .patch<{ leaveType: LeaveType }>(`${this.baseUrl}/${id}`, request, { context: INLINE_ERROR })
      .pipe(map(({ leaveType }) => leaveType));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/${id}`, { context: INLINE_ERROR }).pipe(map(() => undefined));
  }
}
