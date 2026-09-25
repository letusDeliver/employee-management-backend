import { Shift } from './shift.models';
import { ShiftFormValue, buildShiftCreate, buildShiftUpdate, sortWeekdays } from './shift-update';

const original: Shift = {
  id: 'sh-1',
  name: 'Day Shift',
  startTime: '09:00',
  endTime: '18:00',
  workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  status: 'ACTIVE',
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
};

const formFor = (overrides: Partial<ShiftFormValue> = {}): ShiftFormValue => ({
  name: original.name,
  startTime: original.startTime,
  endTime: original.endTime,
  workingDays: [...original.workingDays],
  status: original.status,
  ...overrides,
});

describe('sortWeekdays', () => {
  it('orders days Monday-first regardless of the order they were picked in', () => {
    expect(sortWeekdays(['SUNDAY', 'FRIDAY', 'MONDAY'])).toEqual(['MONDAY', 'FRIDAY', 'SUNDAY']);
  });

  it('drops duplicates', () => {
    expect(sortWeekdays(['MONDAY', 'MONDAY'])).toEqual(['MONDAY']);
  });
});

describe('buildShiftCreate', () => {
  it('trims the name and sends working days in calendar order', () => {
    expect(
      buildShiftCreate(formFor({ name: '  Night Shift  ', startTime: '22:00', endTime: '06:00', workingDays: ['SATURDAY', 'MONDAY'] })),
    ).toEqual({ name: 'Night Shift', startTime: '22:00', endTime: '06:00', workingDays: ['MONDAY', 'SATURDAY'] });
  });

  it('never sends a status - a new shift is always created ACTIVE server-side', () => {
    expect(buildShiftCreate(formFor())).not.toHaveProperty('status');
  });
});

describe('buildShiftUpdate', () => {
  it('is empty when nothing changed, so the caller sends no request', () => {
    expect(buildShiftUpdate(original, formFor())).toEqual({});
  });

  it('sends only the fields that changed', () => {
    expect(buildShiftUpdate(original, formFor({ endTime: '17:30' }))).toEqual({ endTime: '17:30' });
    expect(buildShiftUpdate(original, formFor({ status: 'INACTIVE' }))).toEqual({ status: 'INACTIVE' });
    expect(buildShiftUpdate(original, formFor({ name: 'Early Shift', startTime: '07:00' }))).toEqual({
      name: 'Early Shift',
      startTime: '07:00',
    });
  });

  it('does not treat surrounding whitespace in the name as a change', () => {
    expect(buildShiftUpdate(original, formFor({ name: '  Day Shift ' }))).toEqual({});
  });

  it('treats working days as a set - the same days in another click order are not a change', () => {
    expect(buildShiftUpdate(original, formFor({ workingDays: ['FRIDAY', 'THURSDAY', 'WEDNESDAY', 'TUESDAY', 'MONDAY'] }))).toEqual({});
  });

  it('sends the full, ordered working-days list when it changes (adding or removing a day)', () => {
    expect(buildShiftUpdate(original, formFor({ workingDays: [...original.workingDays, 'SATURDAY'] }))).toEqual({
      workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
    });
    expect(buildShiftUpdate(original, formFor({ workingDays: ['FRIDAY', 'MONDAY'] }))).toEqual({
      workingDays: ['MONDAY', 'FRIDAY'],
    });
  });

  it('is unaffected by the original arriving in a different order', () => {
    const shuffled: Shift = { ...original, workingDays: ['FRIDAY', 'MONDAY', 'WEDNESDAY', 'TUESDAY', 'THURSDAY'] };
    expect(buildShiftUpdate(shuffled, formFor())).toEqual({});
  });
});
