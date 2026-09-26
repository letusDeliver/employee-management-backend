import { localToday, serverToday } from './server-day.util';

// The test runtime is Node, but the app's spec tsconfig deliberately has no Node typings.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

describe('serverToday', () => {
  it('is the UTC calendar date, not the local one', () => {
    expect(serverToday(new Date('2026-09-25T23:59:59.000Z'))).toBe('2026-09-25');
    expect(serverToday(new Date('2026-09-26T00:00:00.000Z'))).toBe('2026-09-26');
    expect(serverToday(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01');
  });

  it.for([
    ['Pacific/Kiritimati', '2026-09-25T15:00:00.000Z', '2026-09-26'], // UTC+14: already tomorrow
    ['Etc/GMT+12', '2026-09-25T05:00:00.000Z', '2026-09-24'], // UTC-12: still yesterday
  ])('differs from the local date in %s - which is why a server-decided day must not use the local one', ([zone, iso, expectedLocal], { skip }) => {
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
