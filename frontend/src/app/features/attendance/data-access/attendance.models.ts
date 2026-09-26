import { Paginated } from '../../../shared/models/paginated.model';

/**
 * The seven statuses `GET /attendance/effective-status` can resolve (docs/domain-attendance.md
 * ADR-AT03). They are COMPUTED on read from Attendance + Leave + Holiday Calendar + Shift and never
 * stored, so a row of the records list has no status of its own.
 */
export type EffectiveStatus = 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' | 'HOLIDAY' | 'WEEK_OFF' | 'ON_LEAVE';

/**
 * One employee's punches for one calendar day. No DTO/Model/Mapper split: the wire and domain
 * shapes do not diverge (Auth's precedent), so every timestamp stays the ISO string the API sent.
 *
 * `date` is a CALENDAR DATE the API returns as an ISO instant at UTC midnight - read it only
 * through `shared/utils/date-only.util.ts`. `checkIn`/`checkOut` are real INSTANTS.
 */
export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  isHalfDay: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The backend's own sort whitelist (`attendance.validation.js`). */
export type AttendanceSortField = 'date' | 'checkIn' | 'checkOut' | 'createdAt';

export interface AttendanceListQuery {
  page: number;
  limit: number;
  employeeId?: string;
  /** `YYYY-MM-DD`, inclusive. */
  dateFrom?: string;
  /** `YYYY-MM-DD`, inclusive. */
  dateTo?: string;
  sortBy: AttendanceSortField;
  order: 'asc' | 'desc';
}

export interface CreateAttendanceRequest {
  employeeId: string;
  /** `YYYY-MM-DD`. The backend rejects a date after today's UTC date. */
  date: string;
  /** ISO instants. */
  checkIn?: string;
  checkOut?: string;
  isHalfDay?: boolean;
}

/**
 * A correction. `employeeId` and `date` are deliberately absent: changing whose day a record is
 * is a different record, not a correction. `null` clears a punch; an absent key leaves it alone.
 */
export interface UpdateAttendanceRequest {
  checkIn?: string | null;
  checkOut?: string | null;
  isHalfDay?: boolean;
}

export interface EffectiveStatusResult {
  employeeId: string;
  date: string;
  status: EffectiveStatus;
  /**
   * `null` on a HOLIDAY / WEEK_OFF / ON_LEAVE day even when a record exists: the backend returns
   * those statuses before it ever looks the record up.
   */
  record: AttendanceRecord | null;
}

// The wire shapes: each endpoint returns its own key, never a generic envelope (blueprint §0).
export interface AttendanceListResponse {
  records: AttendanceRecord[];
  pagination: Paginated;
}

export interface AttendanceRecordResponse {
  record: AttendanceRecord;
}
