import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import { MasterDataApi, MasterDataPage } from '../../../shared/master-data/master-data.models';
import { toHttpParams } from '../../../shared/utils/http-params.util';
import {
  CreateHolidayCalendarRequest,
  HolidayCalendar,
  HolidayCalendarListQuery,
  HolidayCalendarResponse,
  HolidayCalendarsListResponse,
  UpdateHolidayCalendarRequest,
} from './holiday-calendar.models';

/**
 * Thin HttpClient wrapper - one method per real endpoint, zero business logic (blueprint §8).
 * Owns the `/holiday-calendars` path and maps this endpoint's own response key
 * (`holidayCalendars`) into the neutral `items` that `MasterDataStore` consumes. The child
 * `/holidays` endpoints live in `HolidayService`.
 */
@Injectable({ providedIn: 'root' })
export class HolidayCalendarService
  implements
    MasterDataApi<HolidayCalendar, CreateHolidayCalendarRequest, UpdateHolidayCalendarRequest, HolidayCalendarListQuery>
{
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}/holiday-calendars`;

  list(query: HolidayCalendarListQuery): Observable<MasterDataPage<HolidayCalendar>> {
    return this.http
      .get<HolidayCalendarsListResponse>(this.baseUrl, { params: toHttpParams(query) })
      .pipe(map(({ holidayCalendars, pagination }) => ({ items: holidayCalendars, pagination })));
  }

  getById(id: string): Observable<HolidayCalendar> {
    return this.http
      .get<HolidayCalendarResponse>(`${this.baseUrl}/${id}`)
      .pipe(map(({ holidayCalendar }) => holidayCalendar));
  }

  create(request: CreateHolidayCalendarRequest): Observable<HolidayCalendar> {
    return this.http
      .post<HolidayCalendarResponse>(this.baseUrl, request)
      .pipe(map(({ holidayCalendar }) => holidayCalendar));
  }

  update(id: string, request: UpdateHolidayCalendarRequest): Observable<HolidayCalendar> {
    return this.http
      .patch<HolidayCalendarResponse>(`${this.baseUrl}/${id}`, request)
      .pipe(map(({ holidayCalendar }) => holidayCalendar));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/${id}`).pipe(map(() => undefined));
  }
}
