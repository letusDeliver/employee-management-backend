import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import {
  MasterDataApi,
  MasterDataListQuery,
  MasterDataPage,
} from '../../../shared/master-data/master-data.models';
import { toHttpParams } from '../../../shared/utils/http-params.util';
import {
  CreateDepartmentRequest,
  Department,
  DepartmentResponse,
  DepartmentsListResponse,
  UpdateDepartmentRequest,
} from './department.models';

/**
 * Thin HttpClient wrapper - one method per real endpoint, zero business
 * logic (blueprint §8). Owns the `/departments` path and maps this
 * endpoint's own response key (`departments`) into the shared, neutral
 * `items` that `MasterDataStore` consumes.
 */
@Injectable({ providedIn: 'root' })
export class DepartmentService implements MasterDataApi<Department, CreateDepartmentRequest, UpdateDepartmentRequest> {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(query: MasterDataListQuery): Observable<MasterDataPage<Department>> {
    const params = toHttpParams(query);

    return this.http
      .get<DepartmentsListResponse>(`${this.baseUrl}/departments`, { params })
      .pipe(map(({ departments, pagination }) => ({ items: departments, pagination })));
  }

  getById(id: string): Observable<Department> {
    return this.http
      .get<DepartmentResponse>(`${this.baseUrl}/departments/${id}`)
      .pipe(map(({ department }) => department));
  }

  create(request: CreateDepartmentRequest): Observable<Department> {
    return this.http
      .post<DepartmentResponse>(`${this.baseUrl}/departments`, request)
      .pipe(map(({ department }) => department));
  }

  update(id: string, request: UpdateDepartmentRequest): Observable<Department> {
    return this.http
      .patch<DepartmentResponse>(`${this.baseUrl}/departments/${id}`, request)
      .pipe(map(({ department }) => department));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/departments/${id}`).pipe(map(() => undefined));
  }
}
