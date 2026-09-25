import { calendarChangeForUpdate, calendarForCreate } from './branch-calendar';

describe('calendarChangeForUpdate', () => {
  it('sends nothing when the calendar is unchanged (an inactive current calendar must not be re-validated)', () => {
    expect(calendarChangeForUpdate('cal-1', 'cal-1')).toEqual({});
  });

  it('sends nothing when there was no calendar and none is chosen', () => {
    expect(calendarChangeForUpdate(null, '')).toEqual({});
  });

  it('sends the new id when another calendar is chosen', () => {
    expect(calendarChangeForUpdate('cal-1', 'cal-2')).toEqual({ holidayCalendarId: 'cal-2' });
    expect(calendarChangeForUpdate(null, 'cal-2')).toEqual({ holidayCalendarId: 'cal-2' });
  });

  it('sends null to clear the calendar - not an absent key, which would leave it unchanged', () => {
    const change = calendarChangeForUpdate('cal-1', '');

    expect(change).toEqual({ holidayCalendarId: null });
    expect('holidayCalendarId' in change).toBe(true);
  });
});

describe('calendarForCreate', () => {
  it('sends the chosen id', () => {
    expect(calendarForCreate('cal-1')).toEqual({ holidayCalendarId: 'cal-1' });
  });

  it('omits the key for "No calendar"', () => {
    expect(calendarForCreate('')).toEqual({});
  });
});
