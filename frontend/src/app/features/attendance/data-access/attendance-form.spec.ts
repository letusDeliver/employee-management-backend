import { AttendanceRecord } from './attendance.models';
import {
  AttendanceFormValue,
  buildAttendanceCreate,
  buildAttendanceUpdate,
  fromDateTimeLocal,
  isAfterServerToday,
  isCheckOutBeforeCheckIn,
  isPunchOnAnotherDay,
  toDateTimeLocal,
} from './attendance-form';

/** A stored record whose punches carry SECONDS, like a real check-in does. */
const record = (overrides: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
  id: 'a-1',
  employeeId: 'e-1',
  date: '2026-09-15T00:00:00.000Z',
  checkIn: new Date(2026, 8, 15, 9, 5, 33).toISOString(),
  checkOut: new Date(2026, 8, 15, 18, 2, 41).toISOString(),
  isHalfDay: false,
  createdAt: '2026-09-15T09:05:33.000Z',
  updatedAt: '2026-09-15T18:02:41.000Z',
  ...overrides,
});

const formOf = (original: AttendanceRecord, overrides: Partial<AttendanceFormValue> = {}): AttendanceFormValue => ({
  employeeId: original.employeeId,
  date: new Date(2026, 8, 15),
  checkIn: toDateTimeLocal(original.checkIn),
  checkOut: toDateTimeLocal(original.checkOut),
  isHalfDay: original.isHalfDay,
  ...overrides,
});

describe('datetime-local conversion', () => {
  it('reads an instant back as local parts, dropping the seconds', () => {
    expect(toDateTimeLocal(new Date(2026, 8, 15, 9, 5, 33).toISOString())).toBe('2026-09-15T09:05');
    expect(toDateTimeLocal(new Date(2026, 0, 2, 3, 4).toISOString())).toBe('2026-01-02T03:04');
  });

  it('is an empty string for no punch', () => {
    expect(toDateTimeLocal(null)).toBe('');
    expect(fromDateTimeLocal('')).toBeNull();
    expect(fromDateTimeLocal('not a date')).toBeNull();
  });

  it('round-trips a minute-precision value without drifting', () => {
    for (const value of ['2026-01-01T00:00', '2026-03-29T02:30', '2026-09-15T09:05', '2026-12-31T23:59']) {
      expect(toDateTimeLocal(fromDateTimeLocal(value))).toBe(value);
    }
  });

  it('sends the LOCAL time the user typed, as the instant it denotes', () => {
    expect(fromDateTimeLocal('2026-09-15T09:05')).toBe(new Date(2026, 8, 15, 9, 5).toISOString());
  });
});

describe('form rules (exactly as strict as the backend)', () => {
  it('blocks a checkout earlier than the check-in, but accepts an equal one', () => {
    expect(isCheckOutBeforeCheckIn('2026-09-15T18:00', '2026-09-15T09:00')).toBe(true);
    expect(isCheckOutBeforeCheckIn('2026-09-15T09:00', '2026-09-15T09:00')).toBe(false);
    expect(isCheckOutBeforeCheckIn('2026-09-15T22:00', '2026-09-16T06:00')).toBe(false);
  });

  it('does not compare when a punch is missing', () => {
    expect(isCheckOutBeforeCheckIn('', '2026-09-15T09:00')).toBe(false);
    expect(isCheckOutBeforeCheckIn('2026-09-15T09:00', '')).toBe(false);
  });

  it("refuses a date after the SERVER's (UTC) today, not the local one", () => {
    const now = new Date('2026-09-25T20:00:00.000Z');

    expect(isAfterServerToday(new Date(2026, 8, 25), now)).toBe(false);
    expect(isAfterServerToday(new Date(2026, 8, 26), now)).toBe(true);
    expect(isAfterServerToday(new Date(2026, 8, 24), now)).toBe(false);
  });

  it('only notes, never blocks, a punch on another calendar day than the record', () => {
    const date = new Date(2026, 8, 15);

    expect(isPunchOnAnotherDay(date, '2026-09-16T06:30')).toBe(true);
    expect(isPunchOnAnotherDay(date, '2026-09-15T06:30')).toBe(false);
    expect(isPunchOnAnotherDay(date, '')).toBe(false);
  });
});

describe('buildAttendanceCreate', () => {
  it('sends the date as YYYY-MM-DD and the punches as instants', () => {
    const request = buildAttendanceCreate({
      employeeId: 'e-1',
      date: new Date(2026, 8, 15),
      checkIn: '2026-09-15T09:05',
      checkOut: '2026-09-15T18:02',
      isHalfDay: false,
    });

    expect(request).toEqual({
      employeeId: 'e-1',
      date: '2026-09-15',
      checkIn: new Date(2026, 8, 15, 9, 5).toISOString(),
      checkOut: new Date(2026, 8, 15, 18, 2).toISOString(),
      isHalfDay: false,
    });
  });

  it('omits a punch that was left empty', () => {
    const request = buildAttendanceCreate({
      employeeId: 'e-1',
      date: new Date(2026, 8, 15),
      checkIn: '2026-09-15T09:05',
      checkOut: '',
      isHalfDay: true,
    });

    expect(request).not.toHaveProperty('checkOut');
    expect(request.isHalfDay).toBe(true);
  });
});

describe('buildAttendanceUpdate', () => {
  it('is empty when nothing changed - even though the stored punches carry seconds', () => {
    const original = record();

    expect(buildAttendanceUpdate(original, formOf(original))).toEqual({});
  });

  it('sends only the punch that changed', () => {
    const original = record();
    const request = buildAttendanceUpdate(original, formOf(original, { checkOut: '2026-09-15T19:00' }));

    expect(request).toEqual({ checkOut: new Date(2026, 8, 15, 19, 0).toISOString() });
  });

  it('clears a punch with null', () => {
    const original = record();

    expect(buildAttendanceUpdate(original, formOf(original, { checkOut: '' }))).toEqual({ checkOut: null });
  });

  it('sets a punch that was empty', () => {
    const original = record({ checkOut: null });
    const request = buildAttendanceUpdate(original, formOf(original, { checkOut: '2026-09-15T18:00' }));

    expect(request).toEqual({ checkOut: new Date(2026, 8, 15, 18, 0).toISOString() });
  });

  it('sends the half-day flag only when it changed', () => {
    const original = record();

    expect(buildAttendanceUpdate(original, formOf(original, { isHalfDay: true }))).toEqual({ isHalfDay: true });
  });
});
