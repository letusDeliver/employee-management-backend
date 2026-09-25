/**
 * A date-only value (a hire date, a holiday) is a CALENDAR DATE, not an instant. The API returns
 * it as an ISO instant at UTC midnight (`2024-01-01T00:00:00.000Z`) and accepts `YYYY-MM-DD`.
 * Everything here works on the `YYYY-MM-DD` part and local date parts only - never on a `Date`
 * that has been through UTC - so no timezone can move the day.
 */

/**
 * Parses the `YYYY-MM-DD` part of a wire value as a LOCAL calendar date. `new Date(iso)` in a
 * timezone BEHIND UTC is the previous evening locally, and because an edit re-sends the displayed
 * date, each save then drifted it a further day earlier (verified for Employees:
 * `America/New_York` gave 2023-12-31 for 2024-01-01; `Asia/Kolkata` and `UTC` happened to be fine).
 */
export const parseDateOnly = (value: string): Date => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
};

/**
 * `YYYY-MM-DD` from a `Date`'s LOCAL parts. Deliberately not `toISOString()`: `MatDatepicker`
 * produces a `Date` at local midnight, and `toISOString()` converts to UTC first - for any
 * timezone ahead of UTC, local midnight is still the previous day in UTC, silently shifting a
 * freshly-picked date back by one.
 */
export const formatDateOnly = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
