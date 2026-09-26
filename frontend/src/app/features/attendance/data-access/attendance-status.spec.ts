import { STATUS_META, localToday, punchLabel, serverToday, workedDuration } from './attendance-status';

// The test runtime is Node, but the app's spec tsconfig deliberately has no Node typings.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

/** A local-time instant, so these specs mean the same thing in whatever zone they run. */
const local = (y: number, month: number, d: number, h: number, mi: number): string =>
  new Date(y, month - 1, d, h, mi).toISOString();

describe('STATUS_META', () => {
  it('describes every one of the seven computed statuses with text AND an icon', () => {
    const statuses = ['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'HOLIDAY', 'WEEK_OFF', 'ON_LEAVE'] as const;

    expect(Object.keys(STATUS_META).sort()).toEqual([...statuses].sort());
    for (const status of statuses) {
      expect(STATUS_META[status].label).not.toBe('');
      expect(STATUS_META[status].icon).not.toBe('');
      expect(STATUS_META[status].explanation).not.toBe('');
    }
  });
});

describe('serverToday', () => {
  it('is the UTC calendar date, not the local one', () => {
    expect(serverToday(new Date('2026-09-25T23:59:59.000Z'))).toBe('2026-09-25');
    expect(serverToday(new Date('2026-09-26T00:00:00.000Z'))).toBe('2026-09-26');
    expect(serverToday(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01');
  });

  it.for([
    ['Pacific/Kiritimati', '2026-09-25T15:00:00.000Z', '2026-09-26'], // UTC+14: already tomorrow
    ['Etc/GMT+12', '2026-09-25T05:00:00.000Z', '2026-09-24'], // UTC-12: still yesterday
  ])('differs from the local date in %s - which is why the card must not use the local one', ([zone, iso, expectedLocal], { skip }) => {
    const original = env['TZ'];
    env['TZ'] = zone;

    try {
      const probe = new Date(iso);
      if (probe.getDate() === probe.getUTCDate()) {
        skip('the runtime did not honour a TZ change');
      }

      expect(serverToday(probe)).toBe('2026-09-25');
      expect(localToday(probe)).toBe(expectedLocal);
    } finally {
      if (original === undefined) {
        delete env['TZ'];
      } else {
        env['TZ'] = original;
      }
    }
  });
});

describe('workedDuration', () => {
  it('is hours and zero-padded minutes between the two punches', () => {
    expect(workedDuration(local(2026, 9, 15, 9, 5), local(2026, 9, 15, 18, 2))).toBe('8h 57m');
    expect(workedDuration(local(2026, 9, 15, 9, 0), local(2026, 9, 15, 17, 5))).toBe('8h 05m');
    expect(workedDuration(local(2026, 9, 15, 9, 0), local(2026, 9, 15, 9, 0))).toBe('0h 00m');
  });

  it('spans midnight for a night shift', () => {
    expect(workedDuration(local(2026, 9, 15, 22, 0), local(2026, 9, 16, 6, 30))).toBe('8h 30m');
  });

  it('is null when a punch is missing or the checkout precedes the check-in', () => {
    expect(workedDuration(null, local(2026, 9, 15, 18, 0))).toBeNull();
    expect(workedDuration(local(2026, 9, 15, 9, 0), null)).toBeNull();
    expect(workedDuration(local(2026, 9, 15, 18, 0), local(2026, 9, 15, 9, 0))).toBeNull();
  });
});

describe('punchLabel', () => {
  it('is a dash for no punch', () => {
    expect(punchLabel(null, '2026-09-15T00:00:00.000Z', 'en-US')).toBe('—');
  });

  it('shows the time alone when the punch is on the record date', () => {
    const label = punchLabel(local(2026, 9, 15, 9, 5), '2026-09-15T00:00:00.000Z', 'en-US');

    expect(label).toMatch(/9:05/);
    expect(label).not.toMatch(/Sep/);
  });

  it('adds the date when the punch is on another local day (a night shift)', () => {
    const label = punchLabel(local(2026, 9, 16, 6, 30), '2026-09-15T00:00:00.000Z', 'en-US');

    expect(label).toMatch(/Sep 16/);
    expect(label).toMatch(/6:30/);
  });
});
