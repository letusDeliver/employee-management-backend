import { MasterDataStatus } from '../../../shared/master-data/master-data.models';
import { CreateShiftRequest, Shift, UpdateShiftRequest, WEEKDAYS, Weekday } from './shift.models';

/** What the shift form holds. */
export interface ShiftFormValue {
  name: string;
  startTime: string;
  endTime: string;
  workingDays: Weekday[];
  status: MasterDataStatus;
}

/** Working days in calendar order, so the request body (and the comparison below) never depends on click order. */
export function sortWeekdays(days: readonly Weekday[]): Weekday[] {
  return WEEKDAYS.filter((day) => days.includes(day));
}

export function buildShiftCreate(form: ShiftFormValue): CreateShiftRequest {
  return {
    name: form.name.trim(),
    startTime: form.startTime,
    endTime: form.endTime,
    workingDays: sortWeekdays(form.workingDays),
  };
}

/**
 * A PATCH body with ONLY what actually changed, so an edit that touches nothing is not a
 * request at all (a no-op PATCH still writes an audit row and bumps `updatedAt`) - the
 * caller closes the dialog when this returns `{}`. Working days are compared as a set:
 * the same days selected in a different click order are not a change.
 */
export function buildShiftUpdate(original: Shift, form: ShiftFormValue): UpdateShiftRequest {
  const request: UpdateShiftRequest = {};

  const name = form.name.trim();
  if (name !== original.name) {
    request.name = name;
  }
  if (form.startTime !== original.startTime) {
    request.startTime = form.startTime;
  }
  if (form.endTime !== original.endTime) {
    request.endTime = form.endTime;
  }

  const days = sortWeekdays(form.workingDays);
  const originalDays = sortWeekdays(original.workingDays);
  if (days.length !== originalDays.length || days.some((day, index) => day !== originalDays[index])) {
    request.workingDays = days;
  }

  if (form.status !== original.status) {
    request.status = form.status;
  }

  return request;
}
