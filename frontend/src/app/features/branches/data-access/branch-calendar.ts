/**
 * What the Branch form's "Holiday calendar" select means on the wire. The select holds a calendar
 * id, or `''` for "No calendar".
 *
 * The backend re-validates a `holidayCalendarId` it is SENT (only an ACTIVE calendar is
 * assignable) and leaves an omitted one alone, so an edit must not re-send an unchanged value: a
 * branch that keeps a calendar which has since been deactivated would otherwise be rejected on
 * every save. `null` clears the link; a value equal to the original is simply absent.
 */
export function calendarChangeForUpdate(original: string | null, selected: string): { holidayCalendarId?: string | null } {
  const next = selected === '' ? null : selected;
  return next === original ? {} : { holidayCalendarId: next };
}

/** Create: a chosen calendar is sent, "No calendar" is simply absent (there is nothing to clear yet). */
export function calendarForCreate(selected: string): { holidayCalendarId?: string } {
  return selected === '' ? {} : { holidayCalendarId: selected };
}
