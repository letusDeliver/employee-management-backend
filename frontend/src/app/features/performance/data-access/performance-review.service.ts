import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import { Paginated } from '../../../shared/models/paginated.model';
import { toHttpParams } from '../../../shared/utils/http-params.util';
import { INLINE_ERROR } from './performance-http';
import {
  AddendumResponse,
  CreatePerformanceReviewRequest,
  PerformanceReview,
  PerformanceReviewDetail,
  ReviewAddendum,
  ReviewListQuery,
  ReviewResponse,
  ReviewsListResponse,
  UpdatePerformanceReviewRequest,
} from './performance.models';

/** Thin HttpClient wrapper over `/performance-reviews` - one method per endpoint (blueprint §8). */
@Injectable({ providedIn: 'root' })
export class PerformanceReviewService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}/performance-reviews`;

  /**
   * Without `read:any` the server scopes the list to the caller's own reviews AND the ones they author
   * (a MANAGER's list mixes both); an `employeeId` sent is ANDed with that scope. No notes here.
   */
  list(query: ReviewListQuery): Observable<{ items: PerformanceReview[]; pagination: Paginated }> {
    return this.http
      .get<ReviewsListResponse>(this.baseUrl, { params: toHttpParams(query), context: INLINE_ERROR })
      .pipe(map(({ reviews, pagination }) => ({ items: reviews, pagination })));
  }

  /** With its notes. Someone else's review is a 403; an unknown id a 404. */
  getById(id: string): Observable<PerformanceReviewDetail> {
    return this.http.get<ReviewResponse>(`${this.baseUrl}/${id}`, { context: INLINE_ERROR }).pipe(map(({ review }) => review));
  }

  create(request: CreatePerformanceReviewRequest): Observable<PerformanceReview> {
    return this.http.post<ReviewResponse>(this.baseUrl, request, { context: INLINE_ERROR }).pipe(map(({ review }) => review));
  }

  /** DRAFT only; at least one of the two fields. */
  update(id: string, request: UpdatePerformanceReviewRequest): Observable<PerformanceReview> {
    return this.http
      .patch<ReviewResponse>(`${this.baseUrl}/${id}`, request, { context: INLINE_ERROR })
      .pipe(map(({ review }) => review));
  }

  /** DRAFT -> SUBMITTED; a 400 unless a rating and comments are saved. Records the org names. */
  submit(id: string): Observable<PerformanceReview> {
    return this.patch(id, 'submit', {});
  }

  /** SUBMITTED -> ACKNOWLEDGED, by the reviewed employee only. */
  acknowledge(id: string): Observable<PerformanceReview> {
    return this.patch(id, 'acknowledge', {});
  }

  /** The reviewed employee's own text; replaceable until acknowledged. */
  setSelfAssessment(id: string, selfComments: string): Observable<PerformanceReview> {
    return this.patch(id, 'self-assessment', { selfComments });
  }

  /** DRAFT only; answers 200 with a message. */
  delete(id: string): Observable<void> {
    return this.http.delete(`${this.baseUrl}/${id}`, { context: INLINE_ERROR }).pipe(map(() => undefined));
  }

  addNote(id: string, comment: string): Observable<ReviewAddendum> {
    return this.http
      .post<AddendumResponse>(`${this.baseUrl}/${id}/addenda`, { comment }, { context: INLINE_ERROR })
      .pipe(map(({ addendum }) => addendum));
  }

  private patch(id: string, step: string, body: object): Observable<PerformanceReview> {
    return this.http
      .patch<ReviewResponse>(`${this.baseUrl}/${id}/${step}`, body, { context: INLINE_ERROR })
      .pipe(map(({ review }) => review));
  }
}
