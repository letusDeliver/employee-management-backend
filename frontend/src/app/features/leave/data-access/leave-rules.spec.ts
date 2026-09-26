import { LEAVE_STATUSES, LEAVE_STATUS_META, canCancel, canDecide, formatDateRange, formatDays, remainingDays } from './leave-rules';

describe('LEAVE_STATUS_META', () => {
  it('describes every status with a word AND a glyph', () => {
    expect([...LEAVE_STATUSES].sort()).toEqual(['APPROVED', 'CANCELLED', 'PENDING', 'REJECTED']);
    for (const status of LEAVE_STATUSES) {
      expect(LEAVE_STATUS_META[status].label).not.toBe('');
      expect(LEAVE_STATUS_META[status].icon).not.toBe('');
    }
  });
});

describe('canCancel (the backend\'s rule, judged against the SERVER\'s UTC day)', () => {
  const day = '2026-09-26';

  it('always allows a PENDING request', () => {
    expect(canCancel({ status: 'PENDING', startDate: '2026-09-01T00:00:00.000Z' }, day)).toBe(true);
    expect(canCancel({ status: 'PENDING', startDate: '2026-12-01T00:00:00.000Z' }, day)).toBe(true);
  });

  it('allows an APPROVED request only while it has NOT started', () => {
    expect(canCancel({ status: 'APPROVED', startDate: '2026-09-27T00:00:00.000Z' }, day)).toBe(true);
  });

  it('refuses an APPROVED request that starts today or earlier - the backend answers 400 for start <= today', () => {
    expect(canCancel({ status: 'APPROVED', startDate: '2026-09-26T00:00:00.000Z' }, day)).toBe(false);
    expect(canCancel({ status: 'APPROVED', startDate: '2026-09-25T00:00:00.000Z' }, day)).toBe(false);
  });

  it('treats the day as the one it is GIVEN - so a caller that passes the local date gets the wrong answer, which is why it must pass the server day', () => {
    // Same request, two "todays": what the server sees (UTC 26th) vs what a user west of UTC sees (25th).
    const request = { status: 'APPROVED' as const, startDate: '2026-09-26T00:00:00.000Z' };

    expect(canCancel(request, '2026-09-26')).toBe(false);
    expect(canCancel(request, '2026-09-25')).toBe(true);
  });

  it('never allows a REJECTED or CANCELLED request', () => {
    expect(canCancel({ status: 'REJECTED', startDate: '2030-01-01T00:00:00.000Z' }, day)).toBe(false);
    expect(canCancel({ status: 'CANCELLED', startDate: '2030-01-01T00:00:00.000Z' }, day)).toBe(false);
  });
});

describe('canDecide', () => {
  const managerIds: Record<string, string | null> = { 'e-report': 'e-boss', 'e-other': 'e-someone-else', 'e-none': null };
  const managerIdOf = (id: string) => managerIds[id];
  const pending = (employeeId: string) => ({ status: 'PENDING' as const, employeeId });

  const admin = { canDecideAny: true, canDecideReports: false, ownEmployeeId: null };
  const manager = { canDecideAny: false, canDecideReports: true, ownEmployeeId: 'e-boss' };
  const employee = { canDecideAny: false, canDecideReports: false, ownEmployeeId: 'e-report' };

  it('lets ADMIN decide any pending request, even with no employee record of their own', () => {
    expect(canDecide(pending('e-report'), managerIdOf, admin)).toBe(true);
    expect(canDecide(pending('e-none'), managerIdOf, admin)).toBe(true);
  });

  it('lets a MANAGER decide only their own direct reports', () => {
    expect(canDecide(pending('e-report'), managerIdOf, manager)).toBe(true);
    expect(canDecide(pending('e-other'), managerIdOf, manager)).toBe(false);
    expect(canDecide(pending('e-none'), managerIdOf, manager)).toBe(false);
  });

  it('says NO when the manager\'s own employee id is not known (no record, or the directory has not loaded)', () => {
    expect(canDecide(pending('e-report'), managerIdOf, { ...manager, ownEmployeeId: null })).toBe(false);
  });

  it('says NO for a manager-permitted caller when the requester is unknown to the directory', () => {
    expect(canDecide(pending('e-unknown'), managerIdOf, manager)).toBe(false);
  });

  it('never lets a plain EMPLOYEE decide', () => {
    expect(canDecide(pending('e-report'), managerIdOf, employee)).toBe(false);
  });

  it('only a PENDING request is decidable, for anyone', () => {
    for (const status of ['APPROVED', 'REJECTED', 'CANCELLED'] as const) {
      expect(canDecide({ status, employeeId: 'e-report' }, managerIdOf, admin)).toBe(false);
      expect(canDecide({ status, employeeId: 'e-report' }, managerIdOf, manager)).toBe(false);
    }
  });
});

describe('day arithmetic', () => {
  it('computes the remaining days to two decimals, without floating-point noise', () => {
    expect(remainingDays({ entitlement: 10, consumed: 4 })).toBe(6);
    expect(remainingDays({ entitlement: 9.07, consumed: 3.02 })).toBe(6.05);
    expect(remainingDays({ entitlement: 0.3, consumed: 0.1 })).toBe(0.2);
  });

  it('can be negative (an admin override may leave more consumed than granted)', () => {
    expect(remainingDays({ entitlement: 5, consumed: 6.5 })).toBe(-1.5);
  });

  it('formats a day count with at most two decimals and no trailing zeros', () => {
    expect(formatDays(10)).toBe('10');
    expect(formatDays(9.07)).toBe('9.07');
    expect(formatDays(2.5)).toBe('2.5');
    expect(formatDays(0.1 + 0.2)).toBe('0.3');
  });
});

describe('formatDateRange', () => {
  it('shows one day for a single-day request', () => {
    expect(formatDateRange('2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z', 'en-US')).toBe('Nov 2, 2026');
  });

  it('shows both ends for a range, read from the calendar date (never shifted by the time zone)', () => {
    expect(formatDateRange('2026-11-02T00:00:00.000Z', '2026-11-06T00:00:00.000Z', 'en-US')).toBe('Nov 2, 2026 – Nov 6, 2026');
  });
});
