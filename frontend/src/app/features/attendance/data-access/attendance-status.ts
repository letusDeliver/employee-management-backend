import { formatDateOnly, parseDateOnly } from '../../../shared/utils/date-only.util';
import { EffectiveStatus } from './attendance.models';

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

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

/**
 * The calendar date the SERVER treats as "today" for check-in and check-out: the current UTC date
 * (`toDateOnly(new Date())` in `attendance.service.js`). It is NOT the user's local date - for a
 * user behind UTC in the evening or ahead of it in the early morning the two differ. The
 * "today" card must ask about THIS date, or a successful check-in would read back as ABSENT.
 *
 * This is the one place `toISOString()` is right for a calendar date: the point is to mirror the
 * server's UTC day, not to describe the user's own. If the backend ever becomes timezone-aware,
 * this is the single function to change.
 */
export const serverToday = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

/** The user's own local calendar date, for saying so when it differs from `serverToday`. */
export const localToday = (now: Date = new Date()): string => formatDateOnly(now);

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
