import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

import { formatDateOnly } from '../../../shared/utils/date-only.util';
import { CreateReviewCycleRequest, ReviewCycle, ReviewCycleStatus, UpdateReviewCycleRequest } from './performance.models';
import { cycleDay } from './review-rules';

export interface CycleFormValue {
  name: string;
  startDate: Date;
  endDate: Date;
  status: ReviewCycleStatus;
}

/** New cycles are always OPEN (the backend's default); dates go out as LOCAL calendar days. */
export const buildCycleCreate = (value: CycleFormValue): CreateReviewCycleRequest => ({
  name: value.name.trim(),
  startDate: formatDateOnly(value.startDate),
  endDate: formatDateOnly(value.endDate),
});

/** Only what changed - no changes means no request (a no-op PATCH still writes an audit row). */
export function buildCycleUpdate(original: ReviewCycle, value: CycleFormValue): UpdateReviewCycleRequest {
  const changes: UpdateReviewCycleRequest = {};
  const name = value.name.trim();
  const startDate = formatDateOnly(value.startDate);
  const endDate = formatDateOnly(value.endDate);

  if (name !== original.name) changes.name = name;
  if (startDate !== cycleDay(original.startDate)) changes.startDate = startDate;
  if (endDate !== cycleDay(original.endDate)) changes.endDate = endDate;
  if (value.status !== original.status) changes.status = value.status;

  return changes;
}

/**
 * On the END date control, so its `mat-error` can show it (a group-level error never renders inside a
 * form field). Mirrors the backend's `startDate <= endDate` (the same day is allowed). The page
 * re-validates this control when the start date changes.
 */
export const endNotBeforeStartValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const start = control.parent?.get('startDate')?.value as Date | null | undefined;
  const end = control.value as Date | null;
  if (!start || !end) {
    return null;
  }
  return formatDateOnly(end) < formatDateOnly(start) ? { endBeforeStart: true } : null;
};
