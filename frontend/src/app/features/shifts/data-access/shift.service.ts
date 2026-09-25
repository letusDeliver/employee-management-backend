import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import { MasterDataApi, MasterDataPage } from '../../../shared/master-data/master-data.models';
import { toHttpParams } from '../../../shared/utils/http-params.util';
import {
  CreateShiftRequest,
  Shift,
  ShiftListQuery,
  ShiftResponse,
  ShiftsListResponse,
  UpdateShiftRequest,
} from './shift.models';

/**
 * Thin HttpClient wrapper - one method per real endpoint, zero business logic (blueprint
 * §8). Owns the `/shifts` path and maps this endpoint's own response key (`shifts`) into
 * the neutral `items` that `MasterDataStore` consumes.
 */
@Injectable({ providedIn: 'root' })
export class ShiftService implements MasterDataApi<Shift, CreateShiftRequest, UpdateShiftRequest, ShiftListQuery> {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(query: ShiftListQuery): Observable<MasterDataPage<Shift>> {
    const params = toHttpParams(query);

    return this.http
      .get<ShiftsListResponse>(`${this.baseUrl}/shifts`, { params })
      .pipe(map(({ shifts, pagination }) => ({ items: shifts, pagination })));
  }

  getById(id: string): Observable<Shift> {
    return this.http.get<ShiftResponse>(`${this.baseUrl}/shifts/${id}`).pipe(map(({ shift }) => shift));
  }

  create(request: CreateShiftRequest): Observable<Shift> {
    return this.http.post<ShiftResponse>(`${this.baseUrl}/shifts`, request).pipe(map(({ shift }) => shift));
  }

  update(id: string, request: UpdateShiftRequest): Observable<Shift> {
    return this.http.patch<ShiftResponse>(`${this.baseUrl}/shifts/${id}`, request).pipe(map(({ shift }) => shift));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/shifts/${id}`).pipe(map(() => undefined));
  }
}
