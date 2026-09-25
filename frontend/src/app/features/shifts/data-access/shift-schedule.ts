import { WEEKDAYS, Weekday } from './shift.models';

export const WEEKDAY_LABELS: Record<Weekday, { short: string; full: string }> = {
  MONDAY: { short: 'Mon', full: 'Monday' },
  TUESDAY: { short: 'Tue', full: 'Tuesday' },
  WEDNESDAY: { short: 'Wed', full: 'Wednesday' },
  THURSDAY: { short: 'Thu', full: 'Thursday' },
  FRIDAY: { short: 'Fri', full: 'Friday' },
  SATURDAY: { short: 'Sat', full: 'Saturday' },
  SUNDAY: { short: 'Sun', full: 'Sunday' },
};

/**
 * A shift whose end time is earlier than its start time crosses midnight (22:00-06:00) and
 * belongs to the day it STARTS on. The backend defines this once, in
 * `shift.service.js#isOvernightShift` (docs/domain-shift.md, ADR-SH03); the UI needs the
 * same one-line comparison purely for display, so keep it here and keep it in step.
 *
 * `"HH:mm"` is zero-padded and 24-hour, so a plain string comparison orders it correctly.
 * Equal times are NOT overnight - a zero-length shift is accepted by the backend.
 */
export function isOvernight(startTime: string, endTime: string): boolean {
  return endTime < startTime;
}

/** Below this many consecutive days a run is listed ("Mon, Tue"), not collapsed ("Mon–Tue"). */
const MIN_RUN_TO_COLLAPSE = 3;

/**
 * A compact, order-independent summary of working days: `Mon-Fri`, `Mon, Wed, Sat`,
 * `Mon–Wed, Fri`, or `Every day`. Weeks are Monday-first and never wrap, so `Sat, Sun` stays
 * a list. Duplicates are ignored; an empty set (which the backend never returns) is `—`.
 */
export function formatWorkingDays(days: readonly Weekday[]): string {
  const present = WEEKDAYS.map((day) => days.includes(day));
  const count = present.filter(Boolean).length;

  if (count === 0) {
    return '—';
  }
  if (count === WEEKDAYS.length) {
    return 'Every day';
  }

  const parts: string[] = [];
  let index = 0;

  while (index < WEEKDAYS.length) {
    if (!present[index]) {
      index += 1;
      continue;
    }

    let end = index;
    while (end + 1 < WEEKDAYS.length && present[end + 1]) {
      end += 1;
    }

    const runLength = end - index + 1;
    if (runLength >= MIN_RUN_TO_COLLAPSE) {
      parts.push(`${WEEKDAY_LABELS[WEEKDAYS[index]].short}–${WEEKDAY_LABELS[WEEKDAYS[end]].short}`);
    } else {
      for (let i = index; i <= end; i += 1) {
        parts.push(WEEKDAY_LABELS[WEEKDAYS[i]].short);
      }
    }
    index = end + 1;
  }

  return parts.join(', ');
}
