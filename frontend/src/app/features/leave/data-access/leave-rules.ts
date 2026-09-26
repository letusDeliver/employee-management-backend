import { StatusTone } from '../../../shared/components/status-pill/status-pill.component';
import { parseDateOnly } from '../../../shared/utils/date-only.util';
import { LeaveRequestStatus } from './leave.dto';

/** Wording, tone and glyph of the four request statuses (a glyph AND a word, never colour alone). */
export const LEAVE_STATUS_META: Record<LeaveRequestStatus, { label: string; tone: StatusTone; icon: string }> = {
  PENDING: { label: 'Pending', tone: 'warning', icon: 'hourglass_empty' },
  APPROVED: { label: 'Approved', tone: 'success', icon: 'check_circle' },
  REJECTED: { label: 'Rejected', tone: 'error', icon: 'cancel' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', icon: 'block' },
};

export const LEAVE_STATUSES: readonly LeaveRequestStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

/**
 * May this request still be cancelled? Exactly the backend's rule (`cancelLeaveRequest`): a PENDING
 * request always; an APPROVED one only while it has not started, judged against the SERVER's UTC
 * day (`request.startDate <= today` is refused with a 400) - so `serverDay` must come from
 * `serverToday()`, never the local date, or a cancel button is offered that the server refuses.
 * REJECTED and CANCELLED are final. Whose request it is (own vs any) is a permission concern the
 * caller applies on top.
 */
export function canCancel(request: { status: LeaveRequestStatus; startDate: string }, serverDay: string): boolean {
  if (request.status === 'PENDING') {
    return true;
  }
  return request.status === 'APPROVED' && request.startDate.slice(0, 10) > serverDay;
}

export interface DecideActor {
  /** `leaveRequest:decide:any` - ADMIN, unconditionally. */
  canDecideAny: boolean;
  /** `leaveRequest:decide:reports` - MANAGER, only for their own direct reports. */
  canDecideReports: boolean;
  /** The caller's own employee id, or `null` when unknown (no employee record, or the directory has not loaded). */
  ownEmployeeId: string | null;
}

/**
 * May the caller approve or reject this request? Mirrors `assertCanDecide`: only a PENDING request is
 * decidable; `decide:any` may decide any; `decide:reports` only where the requester's `managerId` is
 * the caller's own employee id. Anything unknown answers NO - the buttons stay hidden rather than
 * being offered and refused. The server stays the authority (a 403 is shown inline).
 */
export function canDecide(
  request: { status: LeaveRequestStatus; employeeId: string },
  managerIdOf: (employeeId: string) => string | null | undefined,
  actor: DecideActor,
): boolean {
  if (request.status !== 'PENDING') {
    return false;
  }
  if (actor.canDecideAny) {
    return true;
  }
  return actor.canDecideReports && actor.ownEmployeeId !== null && managerIdOf(request.employeeId) === actor.ownEmployeeId;
}

/** Days left in a balance, to two decimals (hire-year proration produces fractions like 9.07). */
export const remainingDays = (balance: { entitlement: number; consumed: number }): number =>
  Math.round((balance.entitlement - balance.consumed) * 100) / 100;

/** "10", "9.07", "0.5" - at most two decimals, no trailing zeros. */
export const formatDays = (days: number): string => String(Math.round(days * 100) / 100);

/**
 * A request's dates for display: one day ("Nov 2, 2026") or a range ("Nov 2 - Nov 6, 2026"), read from
 * the calendar-date part only (`parseDateOnly`), never through a `Date` that has been through UTC.
 */
export const formatDateRange = (startDate: string, endDate: string, locale?: string): string => {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  const full = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  if (start.getTime() === end.getTime()) {
    return full.format(start);
  }

  return `${full.format(start)} – ${full.format(end)}`;
};
