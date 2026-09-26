import { AbstractControl, ValidationErrors } from '@angular/forms';

import { MasterDataStatus } from '../../../shared/master-data/master-data.models';
import { formatDateOnly } from '../../../shared/utils/date-only.util';
import {
  AdjustLeaveBalanceRequest,
  CreateLeaveRequestRequest,
  CreateLeaveTypeRequest,
  LeaveBalance,
  LeaveType,
  UpdateLeaveTypeRequest,
} from './leave.models';

// ---- apply for leave ---------------------------------------------------------------------------

export interface LeaveApplyFormValue {
  leaveTypeId: string;
  /** The range picker's local-midnight `Date`s. */
  start: Date;
  end: Date;
  reason: string;
}

/**
 * Dates go out as `YYYY-MM-DD` from LOCAL parts (a calendar date, never `toISOString()`); an empty
 * reason is omitted - the backend rejects a blank one (`min(1)`), it does not treat it as absent.
 * Past start dates are allowed: the backend does not refuse them, so neither does the form.
 */
export function buildLeaveCreate(form: LeaveApplyFormValue): CreateLeaveRequestRequest {
  const request: CreateLeaveRequestRequest = {
    leaveTypeId: form.leaveTypeId,
    startDate: formatDateOnly(form.start),
    endDate: formatDateOnly(form.end),
  };

  const reason = form.reason.trim();
  if (reason) {
    request.reason = reason;
  }

  return request;
}

// ---- day counts typed as text ------------------------------------------------------------------

/**
 * A non-negative day count typed as text (`type="text" inputmode="decimal"`, never `type="number"`,
 * which silently reports an empty value on any unparseable entry). `null` for anything that is not a
 * plain non-negative number. The backend accepts any number >= 0 (fractions arise from hire-year
 * proration), so this is exactly as strict.
 */
export const parseDecimalDays = (text: string): number | null => {
  const trimmed = text.trim();
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : null;
};

/** A whole number of days from 1 to 365 - `LeaveType.defaultAnnualEntitlement`'s own rule. */
export const parseWholeDays = (text: string): number | null => {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return value >= 1 && value <= 365 ? value : null;
};

export const decimalDaysValidator = (control: AbstractControl): ValidationErrors | null =>
  parseDecimalDays(String(control.value ?? '')) === null ? { decimalDays: true } : null;

export const wholeDaysValidator = (control: AbstractControl): ValidationErrors | null =>
  parseWholeDays(String(control.value ?? '')) === null ? { wholeDays: true } : null;

// ---- balance adjustment (ADMIN) ----------------------------------------------------------------

export interface BalanceFormValue {
  entitlement: string;
  consumed: string;
}

/**
 * A PATCH body with ONLY what changed, so an edit that touches nothing is not a request at all (a
 * no-op PATCH still writes an audit row and bumps `updatedAt`) - the caller closes the dialog when
 * this returns `{}`. Values are compared as numbers: "10" and "10.0" are the same entitlement.
 */
export function buildBalanceAdjust(original: LeaveBalance, form: BalanceFormValue): AdjustLeaveBalanceRequest {
  const request: AdjustLeaveBalanceRequest = {};

  const entitlement = parseDecimalDays(form.entitlement);
  if (entitlement !== null && entitlement !== original.entitlement) {
    request.entitlement = entitlement;
  }

  const consumed = parseDecimalDays(form.consumed);
  if (consumed !== null && consumed !== original.consumed) {
    request.consumed = consumed;
  }

  return request;
}

/** The backend allows it (the admin override is the escape hatch), so the form only WARNS. */
export const leavesNegativeBalance = (form: BalanceFormValue): boolean => {
  const entitlement = parseDecimalDays(form.entitlement);
  const consumed = parseDecimalDays(form.consumed);
  return entitlement !== null && consumed !== null && consumed > entitlement;
};

// ---- leave types (ADMIN master data) -----------------------------------------------------------

export interface LeaveTypeFormValue {
  name: string;
  defaultAnnualEntitlement: string;
  isPaid: boolean;
  status: MasterDataStatus;
}

export function buildLeaveTypeCreate(form: LeaveTypeFormValue): CreateLeaveTypeRequest {
  return {
    name: form.name.trim(),
    defaultAnnualEntitlement: parseWholeDays(form.defaultAnnualEntitlement) as number,
    isPaid: form.isPaid,
  };
}

/** Only what changed; `{}` means no request (see `buildBalanceAdjust`). */
export function buildLeaveTypeUpdate(original: LeaveType, form: LeaveTypeFormValue): UpdateLeaveTypeRequest {
  const request: UpdateLeaveTypeRequest = {};

  const name = form.name.trim();
  if (name !== original.name) {
    request.name = name;
  }

  const entitlement = parseWholeDays(form.defaultAnnualEntitlement);
  if (entitlement !== null && entitlement !== original.defaultAnnualEntitlement) {
    request.defaultAnnualEntitlement = entitlement;
  }

  if (form.isPaid !== original.isPaid) {
    request.isPaid = form.isPaid;
  }

  if (form.status !== original.status) {
    request.status = form.status;
  }

  return request;
}
