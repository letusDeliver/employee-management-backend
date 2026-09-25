import { Holiday } from './holiday-calendar.models';
import { buildHolidayCreate, buildHolidayUpdate } from './holiday-update';

const original: Holiday = {
  id: 'h-1',
  holidayCalendarId: 'cal-1',
  date: '2026-08-15T00:00:00.000Z',
  name: 'Independence Day',
  isOptional: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// The picker hands over a Date at LOCAL midnight.
const form = (overrides: Partial<{ date: Date; name: string; isOptional: boolean }> = {}) => ({
  date: new Date(2026, 7, 15),
  name: 'Independence Day',
  isOptional: false,
  ...overrides,
});

describe('buildHolidayCreate', () => {
  it('sends the date as YYYY-MM-DD from local parts, a trimmed name and the optional flag', () => {
    expect(buildHolidayCreate(form({ name: '  Diwali  ', isOptional: true, date: new Date(2026, 10, 8) }))).toEqual({
      date: '2026-11-08',
      name: 'Diwali',
      isOptional: true,
    });
  });
});

describe('buildHolidayUpdate', () => {
  it('is empty when nothing changed - the UTC-midnight original equals the picker date', () => {
    expect(buildHolidayUpdate(original, form())).toEqual({});
  });

  it('sends only the date when only the date changed', () => {
    expect(buildHolidayUpdate(original, form({ date: new Date(2026, 7, 16) }))).toEqual({ date: '2026-08-16' });
  });

  it('sends only the name, trimmed, when only the name changed', () => {
    expect(buildHolidayUpdate(original, form({ name: '  Independence Day (India) ' }))).toEqual({
      name: 'Independence Day (India)',
    });
  });

  it('sends the flag when it flips, in either direction', () => {
    expect(buildHolidayUpdate(original, form({ isOptional: true }))).toEqual({ isOptional: true });
    expect(buildHolidayUpdate({ ...original, isOptional: true }, form({ isOptional: false }))).toEqual({
      isOptional: false,
    });
  });

  it('does not treat a whitespace-only difference in the name as a change', () => {
    expect(buildHolidayUpdate(original, form({ name: ' Independence Day ' }))).toEqual({});
  });
});
