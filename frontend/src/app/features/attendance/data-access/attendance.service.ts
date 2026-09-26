import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import { SKIP_GLOBAL_ERROR_NOTIFICATION } from '../../../core/http/http-context-tokens';
import { Paginated } from '../../../shared/models/paginated.model';
import { toHttpParams } from '../../../shared/utils/http-params.util';
import {
  AttendanceListQuery,
  AttendanceListResponse,
  AttendanceRecord,
  AttendanceRecordResponse,
  CreateAttendanceRequest,
  EffectiveStatusResult,
  UpdateAttendanceRequest,
} from './attendance.models';

/**
 * Every attendance screen renders its failure INLINE - the "today" card and the status lookup, the
 * dialogs' error banner, the table's load-error banner and the page's delete banner - so no request
 * here needs the global error toast, which would only repeat the same message a second time.
 */
const INLINE_ERROR = new HttpContext().set(SKIP_GLOBAL_ERROR_NOTIFICATION, true);

/** Thin HttpClient wrapper - one method per real endpoint, zero business logic (blueprint §8). */
@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}/attendance`;

  /** `attendance:read:any` only - there is no "list my own records" endpoint. */
  list(query: AttendanceListQuery): Observable<{ records: AttendanceRecord[]; pagination: Paginated }> {
    return this.http
      .get<AttendanceListResponse>(this.baseUrl, { params: toHttpParams(query), context: INLINE_ERROR })
      .pipe(map(({ records, pagination }) => ({ records, pagination })));
  }

  create(request: CreateAttendanceRequest): Observable<AttendanceRecord> {
    return this.http.post<AttendanceRecordResponse>(this.baseUrl, request, { context: INLINE_ERROR }).pipe(map(({ record }) => record));
  }

  update(id: string, request: UpdateAttendanceRequest): Observable<AttendanceRecord> {
    return this.http.patch<AttendanceRecordResponse>(`${this.baseUrl}/${id}`, request, { context: INLINE_ERROR }).pipe(map(({ record }) => record));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/${id}`, { context: INLINE_ERROR }).pipe(map(() => undefined));
  }

  /** Acts on the caller's OWN employee record, for the server's current UTC date. */
  checkIn(): Observable<AttendanceRecord> {
    return this.http.post<AttendanceRecordResponse>(`${this.baseUrl}/check-in`, {}, { context: INLINE_ERROR }).pipe(map(({ record }) => record));
  }

  checkOut(): Observable<AttendanceRecord> {
    return this.http.patch<AttendanceRecordResponse>(`${this.baseUrl}/check-out`, {}, { context: INLINE_ERROR }).pipe(map(({ record }) => record));
  }

  /**
   * One employee, one calendar day (`YYYY-MM-DD`). Without an `employeeId` the server resolves the
   * caller's own employee record - and answers 400 when the account has none.
   */
  effectiveStatus(date: string, employeeId?: string): Observable<EffectiveStatusResult> {
    let params = new HttpParams().set('date', date);
    if (employeeId) {
      params = params.set('employeeId', employeeId);
    }
    return this.http.get<EffectiveStatusResult>(`${this.baseUrl}/effective-status`, { params, context: INLINE_ERROR });
  }
}
