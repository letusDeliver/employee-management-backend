import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import { Paginated } from '../../../shared/models/paginated.model';
import { toHttpParams } from '../../../shared/utils/http-params.util';
import { INLINE_ERROR } from './leave-http';
import { LeaveRequestResponse, LeaveRequestsListResponse } from './leave.dto';
import { toLeaveRequest } from './leave.mapper';
import {
  CreateLeaveRequestRequest,
  LeaveRequest,
  LeaveRequestListQuery,
  RejectLeaveRequestRequest,
} from './leave.models';

/** Thin HttpClient wrapper - one method per real endpoint, zero business logic (blueprint §8). */
@Injectable({ providedIn: 'root' })
export class LeaveRequestService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}/leave-requests`;

  /** A caller without `leaveRequest:read:any` is scoped to their own requests BY THE SERVER. */
  list(query: LeaveRequestListQuery): Observable<{ items: LeaveRequest[]; pagination: Paginated }> {
    return this.http
      .get<LeaveRequestsListResponse>(this.baseUrl, { params: toHttpParams(query), context: INLINE_ERROR })
      .pipe(map(({ requests, pagination }) => ({ items: requests.map(toLeaveRequest), pagination })));
  }

  /** For the caller's OWN employee; the backend answers 400 when the account has none. */
  create(request: CreateLeaveRequestRequest): Observable<LeaveRequest> {
    return this.http
      .post<LeaveRequestResponse>(this.baseUrl, request, { context: INLINE_ERROR })
      .pipe(map(({ request: created }) => toLeaveRequest(created)));
  }

  approve(id: string): Observable<LeaveRequest> {
    return this.http
      .patch<LeaveRequestResponse>(`${this.baseUrl}/${id}/approve`, {}, { context: INLINE_ERROR })
      .pipe(map(({ request }) => toLeaveRequest(request)));
  }

  reject(id: string, body: RejectLeaveRequestRequest): Observable<LeaveRequest> {
    return this.http
      .patch<LeaveRequestResponse>(`${this.baseUrl}/${id}/reject`, body, { context: INLINE_ERROR })
      .pipe(map(({ request }) => toLeaveRequest(request)));
  }

  cancel(id: string): Observable<LeaveRequest> {
    return this.http
      .patch<LeaveRequestResponse>(`${this.baseUrl}/${id}/cancel`, {}, { context: INLINE_ERROR })
      .pipe(map(({ request }) => toLeaveRequest(request)));
  }
}
