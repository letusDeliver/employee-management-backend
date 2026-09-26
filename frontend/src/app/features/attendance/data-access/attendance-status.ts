import { StatusTone } from '../../../shared/components/status-pill/status-pill.component';
import { formatDateOnly, parseDateOnly } from '../../../shared/utils/date-only.util';
import { EffectiveStatus } from './attendance.models';

export interface StatusMeta {
  label: string;
  tone: StatusTone;
  /** A Material Symbols glyph - the badge never relies on colour alone. */
  icon: string;
  /** One line saying what the status means, for the lookup and the "today" card. */
  explanation: string;
}

/**
 * Wording and look for the seven computed statuses (docs/domain-attendance.md ADR-AT03). The icons
 * are literal Material Symbols names, not `ICON_NAMES` keys: this module is the one place that
 * names them, and it stays free of UI imports so it is a plain, unit-testable table.
 */
export const STATUS_META: Record<EffectiveStatus, StatusMeta> = {
  PRESENT: { label: 'Present', tone: 'success', icon: 'check_circle', explanation: 'Checked in for the day.' },
  LATE: { label: 'Late', tone: 'warning', icon: 'schedule', explanation: "Checked in after the shift's start time." },
  HALF_DAY: { label: 'Half day', tone: 'warning', icon: 'timelapse', explanation: 'Recorded as a half day.' },
  ABSENT: { label: 'Absent', tone: 'error', icon: 'cancel', explanation: 'No check-in is recorded for this day.' },
  HOLIDAY: { label: 'Holiday', tone: 'info', icon: 'event', explanation: "A holiday in the branch's holiday calendar." },
  WEEK_OFF: { label: 'Week off', tone: 'neutral', icon: 'weekend', explanation: "Not a working day on the employee's shift." },
  ON_LEAVE: { label: 'On leave', tone: 'info', icon: 'beach_access', explanation: 'An approved leave covers this day.' },
};

/** `null` when either punch is missing or the checkout precedes the check-in (nothing sensible to show). */
export const workedDuration = (checkIn: string | null, checkOut: string | null): string | null => {
  if (!checkIn || !checkOut) {
    return null;
  }

  const minutes = Math.floor((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) {
    return null;
  }

  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
};

/**
 * A punch for display, in the viewer's local time. The time alone when it falls on the record's
 * own calendar date; with the date too when it does not (a night shift's check-out), so
 * "2:05 AM" is never ambiguous. `null` (no punch) is "—".
 */
export const punchLabel = (instant: string | null, recordDate: string, locale?: string): string => {
  if (!instant) {
    return '—';
  }

  const moment = new Date(instant);
  const sameDay = formatDateOnly(moment) === recordDate.slice(0, 10);

  return new Intl.DateTimeFormat(
    locale,
    sameDay
      ? { hour: 'numeric', minute: '2-digit' }
      : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  ).format(moment);
};

/** A record's calendar date as a local `Date`, for the `date` pipe. */
export const recordDate = (value: string): Date => parseDateOnly(value);
