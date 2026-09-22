import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import { Paginated } from '../../../shared/models/paginated.model';
import { toHttpParams } from '../../../shared/utils/http-params.util';
import {
  Branch,
  BranchListQuery,
  BranchResponse,
  BranchesListResponse,
  CreateBranchRequest,
  UpdateBranchRequest,
} from './branch.models';

/** Thin HttpClient wrapper - one method per real endpoint, zero business logic (blueprint §8). */
@Injectable({ providedIn: 'root' })
export class BranchService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(query: BranchListQuery): Observable<{ branches: Branch[]; pagination: Paginated }> {
    const params = toHttpParams(query);

    return this.http
      .get<BranchesListResponse>(`${this.baseUrl}/branches`, { params })
      .pipe(map(({ branches, pagination }) => ({ branches, pagination })));
  }

  getById(id: string): Observable<Branch> {
    return this.http.get<BranchResponse>(`${this.baseUrl}/branches/${id}`).pipe(map(({ branch }) => branch));
  }

  create(request: CreateBranchRequest): Observable<Branch> {
    return this.http.post<BranchResponse>(`${this.baseUrl}/branches`, request).pipe(map(({ branch }) => branch));
  }

  update(id: string, request: UpdateBranchRequest): Observable<Branch> {
    return this.http
      .patch<BranchResponse>(`${this.baseUrl}/branches/${id}`, request)
      .pipe(map(({ branch }) => branch));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/branches/${id}`).pipe(map(() => undefined));
  }
}
