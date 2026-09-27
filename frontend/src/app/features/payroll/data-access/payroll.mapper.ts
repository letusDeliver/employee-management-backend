import { PayrollRunDto, PayslipDto } from './payroll.dto';
import { PayrollRun, Payslip, PayslipDetail } from './payroll.models';

/**
 * The one place a Decimal string becomes a number (the same isolation as `leave.mapper.ts` and
 * `employee.mapper.ts`'s `salary`). The snapshot's missing values stay `null`: a payslip with no
 * name on record must never read as an empty name, and an unknown payslip count is not zero.
 */
export function toPayrollRun(dto: PayrollRunDto): PayrollRun {
  return {
    id: dto.id,
    periodMonth: dto.periodMonth,
    periodYear: dto.periodYear,
    status: dto.status,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    payslipCount: dto.payslipCount ?? null,
  };
}

export function toPayslip(dto: PayslipDto): Payslip {
  return {
    id: dto.id,
    payrollRunId: dto.payrollRunId,
    employeeId: dto.employeeId,
    periodMonth: dto.periodMonth,
    periodYear: dto.periodYear,
    employeeName: dto.employeeName ?? null,
    departmentName: dto.departmentName,
    designationName: dto.designationName,
    branchName: dto.branchName ?? null,
    employmentType: dto.employmentType,
    baseSalary: Number(dto.baseSalary),
    workingDaysInPeriod: Number(dto.workingDaysInPeriod),
    paidDays: Number(dto.paidDays),
    unpaidDays: Number(dto.unpaidDays),
    grossPay: Number(dto.grossPay),
    totalDeductions: Number(dto.totalDeductions),
    netPay: Number(dto.netPay),
    generatedAt: dto.generatedAt,
  };
}

/** Line items keep the server's order within each type (earnings first, as the backend writes them). */
export function toPayslipDetail(dto: PayslipDto): PayslipDetail {
  const lines = (dto.lineItems ?? []).map((item) => ({
    type: item.type,
    line: { id: item.id, label: item.label, amount: Number(item.amount) },
  }));

  return {
    ...toPayslip(dto),
    earnings: lines.filter((item) => item.type === 'EARNING').map((item) => item.line),
    deductions: lines.filter((item) => item.type === 'DEDUCTION').map((item) => item.line),
  };
}
