import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import {
  CreateHolidayRequest,
  Holiday,
  HolidayResponse,
  HolidaysListResponse,
  UpdateHolidayRequest,
} from './holiday-calendar.models';

/**
 * The child endpoints of a calendar (`/holiday-calendars/:id/holidays`). The list is NOT
 * paginated - it returns every entry of the calendar, oldest date first - so there is no query.
 * Adding, editing and removing a holiday all need `holidayCalendar:update`, not `:delete`.
 */
@Injectable({ providedIn: 'root' })
export class HolidayService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}/holiday-calendars`;

  list(calendarId: string): Observable<Holiday[]> {
    return this.http
      .get<HolidaysListResponse>(`${this.baseUrl}/${calendarId}/holidays`)
      .pipe(map(({ holidays }) => holidays));
  }

  create(calendarId: string, request: CreateHolidayRequest): Observable<Holiday> {
    return this.http
      .post<HolidayResponse>(`${this.baseUrl}/${calendarId}/holidays`, request)
      .pipe(map(({ holiday }) => holiday));
  }

  update(calendarId: string, holidayId: string, request: UpdateHolidayRequest): Observable<Holiday> {
    return this.http
      .patch<HolidayResponse>(`${this.baseUrl}/${calendarId}/holidays/${holidayId}`, request)
      .pipe(map(({ holiday }) => holiday));
  }

  delete(calendarId: string, holidayId: string): Observable<void> {
    return this.http
      .delete<{ message: string }>(`${this.baseUrl}/${calendarId}/holidays/${holidayId}`)
      .pipe(map(() => undefined));
  }
}
