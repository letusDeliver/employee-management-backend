import { Holiday } from './holiday-calendar.models';
import { defaultYear, filterByYear, formatHolidayDate, holidayYear, holidayYears } from './holiday-date';

// The test runtime is Node, but the app's spec tsconfig deliberately has no Node typings.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

const holiday = (date: string, id = date): Holiday => ({
  id,
  holidayCalendarId: 'cal-1',
  date: `${date}T00:00:00.000Z`,
  name: `Holiday ${date}`,
  isOptional: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('holiday-date', () => {
  it('reads the year from the wire string, not through a Date (a UTC-midnight 1 Jan stays in its year)', () => {
    expect(holidayYear(holiday('2027-01-01'))).toBe(2027);
    expect(holidayYear(holiday('2026-12-31'))).toBe(2026);
  });

  it('labels a date with its weekday', () => {
    expect(formatHolidayDate('2026-08-15T00:00:00.000Z')).toBe('Sat, 15 Aug 2026');
    expect(formatHolidayDate('2027-01-01')).toBe('Fri, 1 Jan 2027');
  });

  it('lists the distinct years that have entries, newest first', () => {
    const holidays = [holiday('2025-01-26'), holiday('2027-01-01'), holiday('2026-08-15'), holiday('2026-01-26')];

    expect(holidayYears(holidays)).toEqual([2027, 2026, 2025]);
    expect(holidayYears([])).toEqual([]);
  });

  describe('defaultYear', () => {
    const now = new Date(2026, 5, 1);

    it('is the current year when it has entries', () => {
      expect(defaultYear([2027, 2026, 2025], now)).toBe(2026);
    });

    it('is the newest year when the current one has none', () => {
      expect(defaultYear([2028, 2027], now)).toBe(2028);
    });

    it('shows everything when there are no entries at all', () => {
      expect(defaultYear([], now)).toBe('ALL');
    });
  });

  it('filters by year, or returns everything for ALL', () => {
    const holidays = [holiday('2026-01-26'), holiday('2027-01-01'), holiday('2026-08-15')];

    expect(filterByYear(holidays, 2026).map((h) => h.date.slice(0, 10))).toEqual(['2026-01-26', '2026-08-15']);
    expect(filterByYear(holidays, 'ALL')).toHaveLength(3);
    expect(filterByYear(holidays, 2030)).toEqual([]);
  });

  // A UTC-midnight instant is the PREVIOUS evening in a zone behind UTC, so a year or a label read
  // through `new Date(...)` would move 1 Jan 2027 into 2026 there.
  it.for(['America/New_York', 'America/Los_Angeles', 'Asia/Kolkata', 'UTC'])(
    'keeps the year and the label of 1 Jan 2027 in %s',
    (zone, { skip }) => {
      const original = env['TZ'];
      env['TZ'] = zone;

      try {
        const probe = new Date('2027-01-01T00:00:00.000Z');
        if (probe.getDate() !== (zone.startsWith('America/') ? 31 : 1)) {
          skip('the runtime did not honour a TZ change');
        }

        expect(holidayYear(holiday('2027-01-01'))).toBe(2027);
        expect(formatHolidayDate('2027-01-01T00:00:00.000Z')).toBe('Fri, 1 Jan 2027');
        expect(holidayYears([holiday('2027-01-01')])).toEqual([2027]);
      } finally {
        if (original === undefined) {
          delete env['TZ'];
        } else {
          env['TZ'] = original;
        }
      }
    },
  );
});
