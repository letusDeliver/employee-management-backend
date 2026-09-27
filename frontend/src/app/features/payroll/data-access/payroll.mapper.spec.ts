import { toPayrollRun, toPayslip, toPayslipDetail } from './payroll.mapper';
import { payslipDto, runDto } from './payroll.testing';

describe('payroll mapper', () => {
  it('maps a run, keeping an absent payslip count as null (not 0 - it is only known from GET /:id)', () => {
    expect(toPayrollRun(runDto()).payslipCount).toBeNull();
    expect(toPayrollRun(runDto({ payslipCount: 0 })).payslipCount).toBe(0);
    expect(toPayrollRun(runDto({ payslipCount: 23 }))).toEqual(
      expect.objectContaining({ id: 'run-1', periodMonth: 8, periodYear: 2026, status: 'DRAFT', payslipCount: 23 }),
    );
  });

  it('turns every Decimal string into a number, including fractional days', () => {
    const slip = toPayslip(payslipDto());

    expect(slip.baseSalary).toBe(1000);
    expect(slip.workingDaysInPeriod).toBe(20);
    expect(slip.paidDays).toBe(17.5);
    expect(slip.unpaidDays).toBe(2.5);
    expect(slip.grossPay).toBe(1000);
    expect(slip.totalDeductions).toBe(125);
    expect(slip.netPay).toBe(875);
    expect(typeof slip.netPay).toBe('number');
  });

  it('keeps a missing snapshot name or branch as null - never an empty string', () => {
    const slip = toPayslip(payslipDto({ employeeName: null, branchName: null }));

    expect(slip.employeeName).toBeNull();
    expect(slip.branchName).toBeNull();
  });

  it('splits line items into earnings and deductions, as numbers, in the server order', () => {
    const detail = toPayslipDetail(
      payslipDto({
        lineItems: [
          { id: 'a', payslipId: 'slip-1', type: 'EARNING', label: 'Base Salary', amount: '1000', createdAt: '' },
          { id: 'b', payslipId: 'slip-1', type: 'DEDUCTION', label: 'Unpaid Absence (2.5 days)', amount: '125', createdAt: '' },
        ],
      }),
    );

    expect(detail.earnings).toEqual([{ id: 'a', label: 'Base Salary', amount: 1000 }]);
    expect(detail.deductions).toEqual([{ id: 'b', label: 'Unpaid Absence (2.5 days)', amount: 125 }]);
  });

  it('gives empty lists when the response has no line items', () => {
    const detail = toPayslipDetail(payslipDto());

    expect(detail.earnings).toEqual([]);
    expect(detail.deductions).toEqual([]);
  });
});
