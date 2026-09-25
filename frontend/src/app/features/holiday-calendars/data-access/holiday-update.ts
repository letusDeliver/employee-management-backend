import { formatDateOnly } from '../../../shared/utils/date-only.util';
import { CreateHolidayRequest, Holiday, UpdateHolidayRequest } from './holiday-calendar.models';

/** What the holiday form holds. `date` is the picker's local-midnight `Date`. */
export interface HolidayFormValue {
  date: Date;
  name: string;
  isOptional: boolean;
}

export function buildHolidayCreate(form: HolidayFormValue): CreateHolidayRequest {
  return { date: formatDateOnly(form.date), name: form.name.trim(), isOptional: form.isOptional };
}

/**
 * A PATCH body with ONLY what changed, so an edit that touches nothing is not a request at all
 * (a no-op PATCH still writes an audit row) - the caller closes the dialog when this returns `{}`.
 * The date is compared as `YYYY-MM-DD` strings: the original arrives as an ISO instant at UTC
 * midnight, so comparing `Date` objects would report a change that is not one.
 */
export function buildHolidayUpdate(original: Holiday, form: HolidayFormValue): UpdateHolidayRequest {
  const request: UpdateHolidayRequest = {};

  const date = formatDateOnly(form.date);
  if (date !== original.date.slice(0, 10)) {
    request.date = date;
  }

  const name = form.name.trim();
  if (name !== original.name) {
    request.name = name;
  }

  if (form.isOptional !== original.isOptional) {
    request.isOptional = form.isOptional;
  }

  return request;
}
