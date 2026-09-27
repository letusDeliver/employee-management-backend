import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import { Paginated } from '../../../shared/models/paginated.model';
import { toHttpParams } from '../../../shared/utils/http-params.util';
import { INLINE_ERROR } from './performance-http';
import {
  CreateReviewCycleRequest,
  ReviewCycle,
  ReviewCycleListQuery,
  ReviewCycleResponse,
  ReviewCyclesListResponse,
  UpdateReviewCycleRequest,
} from './performance.models';

/**
 * Thin HttpClient wrapper - one method per real endpoint (blueprint §8). Reading is open to every role
 * (`reviewCycle:read`); every mutation is ADMIN-only.
 */
@Injectable({ providedIn: 'root' })
export class ReviewCycleService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}/review-cycles`;

  list(query: ReviewCycleListQuery): Observable<{ items: ReviewCycle[]; pagination: Paginated }> {
    return this.http
      .get<ReviewCyclesListResponse>(this.baseUrl, { params: toHttpParams(query), context: INLINE_ERROR })
      .pipe(map(({ cycles, pagination }) => ({ items: cycles, pagination })));
  }

  /** Names are unique ignoring case (409); `endDate` before `startDate` is a 400. */
  create(request: CreateReviewCycleRequest): Observable<ReviewCycle> {
    return this.http.post<ReviewCycleResponse>(this.baseUrl, request, { context: INLINE_ERROR }).pipe(map(({ cycle }) => cycle));
  }

  update(id: string, request: UpdateReviewCycleRequest): Observable<ReviewCycle> {
    return this.http
      .patch<ReviewCycleResponse>(`${this.baseUrl}/${id}`, request, { context: INLINE_ERROR })
      .pipe(map(({ cycle }) => cycle));
  }

  /** A 409 while any review references the cycle ("close it instead"). */
  delete(id: string): Observable<void> {
    return this.http.delete(`${this.baseUrl}/${id}`, { context: INLINE_ERROR }).pipe(map(() => undefined));
  }
}
