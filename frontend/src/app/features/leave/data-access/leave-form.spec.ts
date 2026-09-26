import { FormControl } from '@angular/forms';

import { LeaveBalance, LeaveType } from './leave.models';
import {
  buildBalanceAdjust,
  buildLeaveCreate,
  buildLeaveTypeCreate,
  buildLeaveTypeUpdate,
  decimalDaysValidator,
  leavesNegativeBalance,
  parseDecimalDays,
  parseWholeDays,
  wholeDaysValidator,
} from './leave-form';

describe('buildLeaveCreate', () => {
  it('sends the range as YYYY-MM-DD from LOCAL parts - a calendar date, never an instant', () => {
    const request = buildLeaveCreate({
      leaveTypeId: 't-1',
      start: new Date(2026, 10, 2),
      end: new Date(2026, 10, 6),
      reason: 'Family function',
    });

    expect(request).toEqual({ leaveTypeId: 't-1', startDate: '2026-11-02', endDate: '2026-11-06', reason: 'Family function' });
  });

  it('trims the reason and OMITS a blank one (the backend refuses an empty string)', () => {
    const blank = buildLeaveCreate({ leaveTypeId: 't-1', start: new Date(2026, 10, 2), end: new Date(2026, 10, 2), reason: '   ' });
    const padded = buildLeaveCreate({ leaveTypeId: 't-1', start: new Date(2026, 10, 2), end: new Date(2026, 10, 2), reason: '  trip  ' });

    expect(blank).not.toHaveProperty('reason');
    expect(padded.reason).toBe('trip');
  });

  it('allows a single-day range (start equal to end)', () => {
    const request = buildLeaveCreate({ leaveTypeId: 't-1', start: new Date(2026, 10, 2), end: new Date(2026, 10, 2), reason: '' });

    expect(request.startDate).toBe(request.endDate);
  });
});

describe('day-count parsing', () => {
  it('parses a non-negative decimal, fractions included', () => {
    expect(parseDecimalDays('10')).toBe(10);
    expect(parseDecimalDays(' 9.07 ')).toBe(9.07);
    expect(parseDecimalDays('0')).toBe(0);
  });

  it.for(['', '  ', '-1', 'abc', '1,5', '1e3', '.5', '1.', '--2'])('refuses %j', (text) => {
    expect(parseDecimalDays(text)).toBeNull();
  });

  it('parses whole days between 1 and 365 only', () => {
    expect(parseWholeDays('1')).toBe(1);
    expect(parseWholeDays('365')).toBe(365);
    for (const text of ['0', '366', '1.5', '', 'x', '-3']) {
      expect(parseWholeDays(text)).toBeNull();
    }
  });

  it('exposes both as form validators', () => {
    expect(decimalDaysValidator(new FormControl('4.5'))).toBeNull();
    expect(decimalDaysValidator(new FormControl('nope'))).toEqual({ decimalDays: true });
    expect(wholeDaysValidator(new FormControl('18'))).toBeNull();
    expect(wholeDaysValidator(new FormControl('0'))).toEqual({ wholeDays: true });
  });
});

describe('buildBalanceAdjust', () => {
  const balance: LeaveBalance = {
    id: 'b-1',
    employeeId: 'e-1',
    leaveTypeId: 't-1',
    year: 2026,
    entitlement: 10,
    consumed: 4,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };

  it('is empty when nothing changed - so no request is sent at all', () => {
    expect(buildBalanceAdjust(balance, { entitlement: '10', consumed: '4' })).toEqual({});
  });

  it('treats "10.0" as the same entitlement as 10 (numbers, not strings)', () => {
    expect(buildBalanceAdjust(balance, { entitlement: '10.0', consumed: '4.00' })).toEqual({});
  });

  it('sends ONLY the field that changed', () => {
    expect(buildBalanceAdjust(balance, { entitlement: '12', consumed: '4' })).toEqual({ entitlement: 12 });
    expect(buildBalanceAdjust(balance, { entitlement: '10', consumed: '3.5' })).toEqual({ consumed: 3.5 });
  });

  it('sends both when both changed', () => {
    expect(buildBalanceAdjust(balance, { entitlement: '12', consumed: '0' })).toEqual({ entitlement: 12, consumed: 0 });
  });

  it('warns - without blocking - when consumed would exceed the entitlement', () => {
    expect(leavesNegativeBalance({ entitlement: '5', consumed: '6' })).toBe(true);
    expect(leavesNegativeBalance({ entitlement: '5', consumed: '5' })).toBe(false);
    expect(leavesNegativeBalance({ entitlement: 'x', consumed: '6' })).toBe(false);
  });
});

describe('leave type builders', () => {
  const type: LeaveType = {
    id: 't-1',
    name: 'Annual Leave',
    defaultAnnualEntitlement: 18,
    isPaid: true,
    status: 'ACTIVE',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
  const same = { name: 'Annual Leave', defaultAnnualEntitlement: '18', isPaid: true, status: 'ACTIVE' as const };

  it('creates with a trimmed name, whole-day entitlement and the paid flag', () => {
    expect(buildLeaveTypeCreate({ ...same, name: '  Sick Leave ', defaultAnnualEntitlement: '10', isPaid: false })).toEqual({
      name: 'Sick Leave',
      defaultAnnualEntitlement: 10,
      isPaid: false,
    });
  });

  it('sends nothing when an edit changes nothing', () => {
    expect(buildLeaveTypeUpdate(type, same)).toEqual({});
  });

  it('sends only what changed', () => {
    expect(buildLeaveTypeUpdate(type, { ...same, name: 'Annual' })).toEqual({ name: 'Annual' });
    expect(buildLeaveTypeUpdate(type, { ...same, defaultAnnualEntitlement: '20' })).toEqual({ defaultAnnualEntitlement: 20 });
    expect(buildLeaveTypeUpdate(type, { ...same, isPaid: false })).toEqual({ isPaid: false });
    expect(buildLeaveTypeUpdate(type, { ...same, status: 'INACTIVE' })).toEqual({ status: 'INACTIVE' });
  });
});
