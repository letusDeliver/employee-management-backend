import { Weekday } from './shift.models';
import { formatWorkingDays, isOvernight } from './shift-schedule';

describe('isOvernight', () => {
  it('is false for an ordinary day shift', () => {
    expect(isOvernight('09:00', '18:00')).toBe(false);
  });

  it('is true when the end is earlier than the start (crosses midnight)', () => {
    expect(isOvernight('22:00', '06:00')).toBe(true);
    expect(isOvernight('18:00', '09:00')).toBe(true);
  });

  it('is false for a zero-length shift - the backend accepts it and it does not cross midnight', () => {
    expect(isOvernight('09:00', '09:00')).toBe(false);
  });

  it('compares zero-padded 24h strings correctly around the single-digit-hour boundary', () => {
    expect(isOvernight('09:30', '10:00')).toBe(false);
    expect(isOvernight('10:00', '09:30')).toBe(true);
    expect(isOvernight('00:00', '23:59')).toBe(false);
  });
});

describe('formatWorkingDays', () => {
  const days = (...names: Weekday[]): Weekday[] => names;

  it('collapses a run of three or more consecutive days', () => {
    expect(formatWorkingDays(days('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'))).toBe('Mon–Fri');
    expect(formatWorkingDays(days('TUESDAY', 'WEDNESDAY', 'THURSDAY'))).toBe('Tue–Thu');
  });

  it('lists a run of one or two days instead of collapsing it', () => {
    expect(formatWorkingDays(days('MONDAY'))).toBe('Mon');
    expect(formatWorkingDays(days('SATURDAY', 'SUNDAY'))).toBe('Sat, Sun');
  });

  it('mixes runs and singles in calendar order', () => {
    expect(formatWorkingDays(days('MONDAY', 'WEDNESDAY', 'SATURDAY'))).toBe('Mon, Wed, Sat');
    expect(formatWorkingDays(days('MONDAY', 'TUESDAY', 'WEDNESDAY', 'FRIDAY'))).toBe('Mon–Wed, Fri');
    expect(formatWorkingDays(days('MONDAY', 'TUESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'))).toBe('Mon, Tue, Thu–Sat');
  });

  it('does not wrap the week: a Sat-Mon spread is a list, not a run', () => {
    expect(formatWorkingDays(days('SATURDAY', 'SUNDAY', 'MONDAY'))).toBe('Mon, Sat, Sun');
  });

  it('is independent of the order and duplicates the input arrives in', () => {
    expect(formatWorkingDays(days('FRIDAY', 'MONDAY', 'THURSDAY', 'TUESDAY', 'WEDNESDAY', 'MONDAY'))).toBe('Mon–Fri');
  });

  it('says "Every day" for all seven', () => {
    expect(
      formatWorkingDays(days('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY')),
    ).toBe('Every day');
  });

  it('shows a dash for an empty set rather than a blank cell', () => {
    expect(formatWorkingDays([])).toBe('—');
  });
});
