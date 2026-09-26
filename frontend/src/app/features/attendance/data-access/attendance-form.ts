import { formatDateOnly } from '../../../shared/utils/date-only.util';
import { AttendanceRecord, CreateAttendanceRequest, UpdateAttendanceRequest } from './attendance.models';
import { serverToday } from './attendance-status';

/**
 * What the attendance form holds. The punches are native `datetime-local` values
 * (`YYYY-MM-DDTHH:mm`, local time, no zone) - a punch is an INSTANT and a night shift's check-out
 * can fall on the next day, which a bare time input could not express. `''` means "no punch".
 */
export interface AttendanceFormValue {
  employeeId: string;
  /** The picker's local-midnight `Date`. */
  date: Date;
  checkIn: string;
  checkOut: string;
  isHalfDay: boolean;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** An ISO instant as a `datetime-local` value, from LOCAL parts. Seconds are dropped. */
export const toDateTimeLocal = (instant: string | null): string => {
  if (!instant) {
    return '';
  }

  const moment = new Date(instant);
  return `${formatDateOnly(moment)}T${pad(moment.getHours())}:${pad(moment.getMinutes())}`;
};

/**
 * A `datetime-local` value as an ISO instant. `new Date('YYYY-MM-DDTHH:mm')` reads it as LOCAL
 * time, so `toISOString()` is right here - unlike for a calendar date, this really is an instant.
 * `null` for an empty or unparseable value.
 */
export const fromDateTimeLocal = (value: string): string | null => {
  if (!value) {
    return null;
  }

  const moment = new Date(value);
  return Number.isNaN(moment.getTime()) ? null : moment.toISOString();
};

/**
 * The backend refuses a checkout earlier than the check-in (equal is accepted), so this blocks
 * exactly that and nothing stricter. Only meaningful when both punches are present.
 */
export const isCheckOutBeforeCheckIn = (checkIn: string, checkOut: string): boolean => {
  const from = fromDateTimeLocal(checkIn);
  const to = fromDateTimeLocal(checkOut);
  return from !== null && to !== null && new Date(to).getTime() < new Date(from).getTime();
};

/**
 * The backend refuses a record `date` whose UTC-midnight instant is after now, which is exactly
 * "the date is after the UTC date of now" - so this compares against the SERVER's today, not the
 * local one (a local "today" can already be tomorrow in UTC, which the API would refuse).
 */
export const isAfterServerToday = (date: Date, now: Date = new Date()): boolean =>
  formatDateOnly(date) > serverToday(now);

/**
 * A punch on another local calendar day than the record's is ALLOWED (a night shift) - the form
 * only says so, it never blocks. `false` for an empty punch.
 */
export const isPunchOnAnotherDay = (date: Date, punch: string): boolean =>
  punch !== '' && punch.slice(0, 10) !== formatDateOnly(date);

export function buildAttendanceCreate(form: AttendanceFormValue): CreateAttendanceRequest {
  const request: CreateAttendanceRequest = {
    employeeId: form.employeeId,
    date: formatDateOnly(form.date),
    isHalfDay: form.isHalfDay,
  };

  const checkIn = fromDateTimeLocal(form.checkIn);
  if (checkIn) {
    request.checkIn = checkIn;
  }

  const checkOut = fromDateTimeLocal(form.checkOut);
  if (checkOut) {
    request.checkOut = checkOut;
  }

  return request;
}

/**
 * A PATCH body with ONLY what changed (a no-op PATCH still writes an audit row) - the caller closes
 * the dialog when this returns `{}`. A punch is compared at the form's own minute precision: the
 * stored instant usually carries seconds, and re-sending an unchanged, truncated value would
 * silently rewrite it. Clearing a punch sends `null`.
 */
export function buildAttendanceUpdate(
  original: AttendanceRecord,
  form: Pick<AttendanceFormValue, 'checkIn' | 'checkOut' | 'isHalfDay'>,
): UpdateAttendanceRequest {
  const request: UpdateAttendanceRequest = {};

  if (form.checkIn !== toDateTimeLocal(original.checkIn)) {
    request.checkIn = fromDateTimeLocal(form.checkIn);
  }

  if (form.checkOut !== toDateTimeLocal(original.checkOut)) {
    request.checkOut = fromDateTimeLocal(form.checkOut);
  }

  if (form.isHalfDay !== original.isHalfDay) {
    request.isHalfDay = form.isHalfDay;
  }

  return request;
}
