import {
  RUN_STATUSES,
  byPeriodDesc,
  canDelete,
  defaultNewRunPeriod,
  formatDays,
  isPeriodOver,
  nextAction,
  payslipEmployeeName,
  payslipRoleLine,
  periodLabel,
} from './payroll-rules';

describe('payroll rules', () => {
  describe('nextAction - the ONE transition the server accepts from each status', () => {
    it.each([
      ['DRAFT', 'process'],
      ['PROCESSING', 'finalize'],
      ['FINALIZED', 'markPaid'],
      ['PAID', null],
    ] as const)('%s -> %s', (status, expected) => {
      expect(nextAction({ status })).toBe(expected);
    });
  });

  describe('canDelete - only a DRAFT run (processing is the irreversible step)', () => {
    it.each([
      ['DRAFT', true],
      ['PROCESSING', false],
      ['FINALIZED', false],
      ['PAID', false],
    ] as const)('%s -> %s', (status, expected) => {
      expect(canDelete({ status })).toBe(expected);
    });
  });

  it('lists the statuses in lifecycle order', () => {
    expect(RUN_STATUSES).toEqual(['DRAFT', 'PROCESSING', 'FINALIZED', 'PAID']);
  });

  describe('isPeriodOver - judged against the SERVER day', () => {
    it('is true for an earlier month of the same year and for any earlier year', () => {
      expect(isPeriodOver({ periodMonth: 8, periodYear: 2026 }, '2026-09-27')).toBe(true);
      expect(isPeriodOver({ periodMonth: 12, periodYear: 2025 }, '2026-01-01')).toBe(true);
    });

    it('is false for the current month - even on its last day - and for a later month', () => {
      expect(isPeriodOver({ periodMonth: 9, periodYear: 2026 }, '2026-09-30')).toBe(false);
      expect(isPeriodOver({ periodMonth: 9, periodYear: 2026 }, '2026-09-01')).toBe(false);
      expect(isPeriodOver({ periodMonth: 10, periodYear: 2026 }, '2026-09-27')).toBe(false);
      expect(isPeriodOver({ periodMonth: 1, periodYear: 2027 }, '2026-12-31')).toBe(false);
    });

    it('turns over exactly on the first day of the next month', () => {
      expect(isPeriodOver({ periodMonth: 9, periodYear: 2026 }, '2026-10-01')).toBe(true);
    });
  });

  describe('defaultNewRunPeriod - last month by the server day', () => {
    it('is the previous month within a year', () => {
      expect(defaultNewRunPeriod('2026-09-27')).toEqual({ periodMonth: 8, periodYear: 2026 });
      expect(defaultNewRunPeriod('2026-02-01')).toEqual({ periodMonth: 1, periodYear: 2026 });
    });

    it('rolls January back to December of the previous year', () => {
      expect(defaultNewRunPeriod('2027-01-15')).toEqual({ periodMonth: 12, periodYear: 2026 });
    });
  });

  it('labels a period with the English month name', () => {
    expect(periodLabel(8, 2026)).toBe('August 2026');
    expect(periodLabel(1, 2027)).toBe('January 2027');
    expect(periodLabel(12, 2025)).toBe('December 2025');
  });

  it('formats days with at most two decimals and no trailing zeros', () => {
    expect(formatDays(20)).toBe('20');
    expect(formatDays(17.5)).toBe('17.5');
    expect(formatDays(0)).toBe('0');
    expect(formatDays(1 / 3)).toBe('0.33');
  });

  it('names a payslip from its snapshot, or says there is no name on record - never an id', () => {
    expect(payslipEmployeeName({ employeeName: 'Asha Rao' })).toBe('Asha Rao');
    expect(payslipEmployeeName({ employeeName: null })).toBe('No name on record');
    expect(payslipRoleLine({ designationName: 'Analyst', departmentName: 'Finance' })).toBe('Analyst · Finance');
  });

  it('orders newest period first: year, then month', () => {
    const periods = [
      { periodYear: 2025, periodMonth: 12 },
      { periodYear: 2026, periodMonth: 3 },
      { periodYear: 2026, periodMonth: 11 },
      { periodYear: 2026, periodMonth: 8 },
    ];

    expect([...periods].sort(byPeriodDesc)).toEqual([
      { periodYear: 2026, periodMonth: 11 },
      { periodYear: 2026, periodMonth: 8 },
      { periodYear: 2026, periodMonth: 3 },
      { periodYear: 2025, periodMonth: 12 },
    ]);
  });
});
