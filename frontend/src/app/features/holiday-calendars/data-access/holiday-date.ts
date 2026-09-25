import { formatDate } from '@angular/common';

import { parseDateOnly } from '../../../shared/utils/date-only.util';
import { Holiday } from './holiday-calendar.models';

/** A year, or every year. */
export type YearFilter = number | 'ALL';

/** The calendar year a holiday falls in - read from the `YYYY-MM-DD` part, never through a `Date`. */
export function holidayYear(holiday: Pick<Holiday, 'date'>): number {
  return Number(holiday.date.slice(0, 4));
}

/**
 * "Sat, 15 Aug 2026". The weekday is part of the label on purpose: a mistyped date is far easier
 * to spot as "Tue" than as a bare number. Built from LOCAL date parts, so no timezone can move it.
 */
export function formatHolidayDate(wire: string): string {
  return formatDate(parseDateOnly(wire), 'EEE, d MMM y', 'en-US');
}

/** Distinct years that have at least one holiday, newest first. */
export function holidayYears(holidays: readonly Holiday[]): number[] {
  return [...new Set(holidays.map(holidayYear))].sort((a, b) => b - a);
}

/**
 * What the year filter shows before the user has chosen: the current year when the calendar has
 * entries in it, otherwise the newest year that does (an admin preparing next year's dates, or a
 * calendar that has not been kept up to date, should still see something), otherwise everything.
 */
export function defaultYear(years: readonly number[], now: Date = new Date()): YearFilter {
  if (years.includes(now.getFullYear())) {
    return now.getFullYear();
  }
  return years.length > 0 ? years[0] : 'ALL';
}

export function filterByYear(holidays: readonly Holiday[], year: YearFilter): Holiday[] {
  return year === 'ALL' ? [...holidays] : holidays.filter((holiday) => holidayYear(holiday) === year);
}
