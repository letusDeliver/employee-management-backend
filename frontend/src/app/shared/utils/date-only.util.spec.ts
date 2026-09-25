import { formatDateOnly, parseDateOnly } from './date-only.util';

// The test runtime is Node, but the app's spec tsconfig deliberately has no Node typings.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

describe('date-only util', () => {
  it('parses the YYYY-MM-DD part of a UTC-midnight instant as that local calendar date', () => {
    const date = parseDateOnly('2026-08-15T00:00:00.000Z');

    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 7, 15]);
    expect(date.getHours()).toBe(0);
  });

  it('parses a bare YYYY-MM-DD the same way', () => {
    const date = parseDateOnly('2027-01-01');

    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2027, 0, 1]);
  });

  it('formats from local parts and zero-pads month and day', () => {
    expect(formatDateOnly(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatDateOnly(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('round-trips a wire value without drifting the day', () => {
    for (const wire of ['2026-01-01', '2026-03-29', '2026-08-15', '2026-12-31']) {
      expect(formatDateOnly(parseDateOnly(`${wire}T00:00:00.000Z`))).toBe(wire);
    }
  });

  // The whole point of this util: the day must not move with the timezone.
  it.for(['America/New_York', 'America/Los_Angeles', 'Pacific/Auckland', 'Asia/Kolkata', 'UTC'])(
    'keeps a UTC-midnight date on the same calendar day in %s',
    (zone, { skip }) => {
      const original = env['TZ'];
      env['TZ'] = zone;

      try {
        // Prove the zone change actually took effect in this runtime; otherwise this test could
        // not have failed and must not pretend to have passed.
        const probe = new Date('2026-08-15T00:00:00.000Z');
        const expectedLocalDay = zone.startsWith('America/') ? 14 : 15;
        if (probe.getDate() !== expectedLocalDay) {
          skip('the runtime did not honour a TZ change');
        }

        const date = parseDateOnly('2026-08-15T00:00:00.000Z');

        expect(formatDateOnly(date)).toBe('2026-08-15');
        expect(date.getDate()).toBe(15);
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
