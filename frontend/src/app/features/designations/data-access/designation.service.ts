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
  CreateDesignationRequest,
  Designation,
  DesignationResponse,
  DesignationsListResponse,
  UpdateDesignationRequest,
} from './designation.models';

/**
 * Thin HttpClient wrapper - one method per real endpoint, zero business
 * logic (blueprint §8). Owns the `/designations` path and maps this
 * endpoint's own response key (`designations`) into the shared, neutral
 * `items` that `MasterDataStore` consumes.
 */
@Injectable({ providedIn: 'root' })
export class DesignationService
  implements MasterDataApi<Designation, CreateDesignationRequest, UpdateDesignationRequest>
{
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(query: MasterDataListQuery): Observable<MasterDataPage<Designation>> {
    const params = toHttpParams(query);

    return this.http
      .get<DesignationsListResponse>(`${this.baseUrl}/designations`, { params })
      .pipe(map(({ designations, pagination }) => ({ items: designations, pagination })));
  }

  getById(id: string): Observable<Designation> {
    return this.http
      .get<DesignationResponse>(`${this.baseUrl}/designations/${id}`)
      .pipe(map(({ designation }) => designation));
  }

  create(request: CreateDesignationRequest): Observable<Designation> {
    return this.http
      .post<DesignationResponse>(`${this.baseUrl}/designations`, request)
      .pipe(map(({ designation }) => designation));
  }

  update(id: string, request: UpdateDesignationRequest): Observable<Designation> {
    return this.http
      .patch<DesignationResponse>(`${this.baseUrl}/designations/${id}`, request)
      .pipe(map(({ designation }) => designation));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/designations/${id}`).pipe(map(() => undefined));
  }
}
