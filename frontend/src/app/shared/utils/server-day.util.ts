import { formatDateOnly } from './date-only.util';

/**
 * The calendar date the SERVER treats as "today" when it decides the day itself: the current UTC
 * date (`toDateOnly(new Date())` in `attendance.service.js` and `leave.service.js`). It is NOT the
 * user's local date - for a user behind UTC in the evening or ahead of it in the early morning the
 * two differ. Attendance's "today" card and Leave's "has this approved leave started?" rule must
 * ask about THIS date, or a successful check-in reads back as Absent and a cancel button is offered
 * that the server will refuse.
 *
 * This is the one place `toISOString()` is right for a calendar date: the point is to mirror the
 * server's UTC day, not to describe the user's own. If the backend ever becomes timezone-aware, this
 * is the single function to change. (Promoted to `shared/` when Leave became the second consumer.)
 */
export const serverToday = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

/** The user's own local calendar date, for saying so when it differs from `serverToday`. */
export const localToday = (now: Date = new Date()): string => formatDateOnly(now);
