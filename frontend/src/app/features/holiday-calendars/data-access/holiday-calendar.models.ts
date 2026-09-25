import { MasterDataBase, MasterDataQueryBase, MasterDataStatus } from '../../../shared/master-data/master-data.models';
import { Paginated } from '../../../shared/models/paginated.model';

/**
 * A named, year-agnostic container of holidays (ADR-HC02). Like Shift it has NO `code`, so it
 * satisfies only `MasterDataBase` - all `MasterDataStore` needs. No DTO/Model/Mapper split: the
 * wire and domain shapes do not diverge (timestamps stay ISO strings).
 */
export interface HolidayCalendar extends MasterDataBase {
  createdAt: string;
  updatedAt: string;
}

/** The backend's own sort whitelist (`holidayCalendar.validation.js`). */
export type HolidayCalendarSortField = 'name' | 'status' | 'createdAt';

export interface HolidayCalendarListQuery extends MasterDataQueryBase {
  sortBy: HolidayCalendarSortField;
}

export interface CreateHolidayCalendarRequest {
  name: string;
}

export interface UpdateHolidayCalendarRequest {
  name?: string;
  status?: MasterDataStatus;
}

/**
 * One dated entry of a calendar. `date` is a CALENDAR DATE that the API returns as an ISO instant
 * at UTC midnight (`2026-08-15T00:00:00.000Z`) - it is only ever read through
 * `shared/utils/date-only.util.ts` / `holiday-date.ts`, never `new Date(holiday.date)`.
 */
export interface Holiday {
  id: string;
  holidayCalendarId: string;
  date: string;
  name: string;
  isOptional: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHolidayRequest {
  /** `YYYY-MM-DD`. */
  date: string;
  name: string;
  isOptional: boolean;
}

export interface UpdateHolidayRequest {
  date?: string;
  name?: string;
  isOptional?: boolean;
}

// The wire shapes: each endpoint returns its own key, never a generic envelope (blueprint §0).
export interface HolidayCalendarsListResponse {
  holidayCalendars: HolidayCalendar[];
  pagination: Paginated;
}

export interface HolidayCalendarResponse {
  holidayCalendar: HolidayCalendar;
}

export interface HolidaysListResponse {
  holidays: Holiday[];
}

export interface HolidayResponse {
  holiday: Holiday;
}
