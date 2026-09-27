import { PayrollRunDto, PayslipDto } from './payroll.dto';
import { PayrollRun, Payslip, PayslipDetail } from './payroll.models';

/** Spec-only builders: the exact wire shapes the probe recorded, overridable per test. */
export const runDto = (overrides: Partial<PayrollRunDto> = {}): PayrollRunDto => ({
  id: 'run-1',
  periodMonth: 8,
  periodYear: 2026,
  status: 'DRAFT',
  createdAt: '2026-09-27T04:29:52.810Z',
  updatedAt: '2026-09-27T04:29:52.810Z',
  ...overrides,
});

export const payslipDto = (overrides: Partial<PayslipDto> = {}): PayslipDto => ({
  id: 'slip-1',
  payrollRunId: 'run-1',
  employeeId: 'e-1',
  periodMonth: 8,
  periodYear: 2026,
  employeeName: 'Asha Rao',
  departmentName: 'Finance',
  designationName: 'Analyst',
  branchName: 'Pune',
  employmentType: 'FULL_TIME',
  baseSalary: '1000',
  workingDaysInPeriod: '20',
  paidDays: '17.5',
  unpaidDays: '2.5',
  grossPay: '1000',
  totalDeductions: '125',
  netPay: '875',
  generatedAt: '2026-09-27T04:29:54.167Z',
  createdAt: '2026-09-27T04:29:54.167Z',
  updatedAt: '2026-09-27T04:29:54.167Z',
  ...overrides,
});

export const run = (overrides: Partial<PayrollRun> = {}): PayrollRun => ({
  id: 'run-1',
  periodMonth: 8,
  periodYear: 2026,
  status: 'DRAFT',
  createdAt: '2026-09-27T04:29:52.810Z',
  updatedAt: '2026-09-27T04:29:52.810Z',
  payslipCount: null,
  ...overrides,
});

export const payslip = (overrides: Partial<Payslip> = {}): Payslip => ({
  id: 'slip-1',
  payrollRunId: 'run-1',
  employeeId: 'e-1',
  periodMonth: 8,
  periodYear: 2026,
  employeeName: 'Asha Rao',
  departmentName: 'Finance',
  designationName: 'Analyst',
  branchName: 'Pune',
  employmentType: 'FULL_TIME',
  baseSalary: 1000,
  workingDaysInPeriod: 20,
  paidDays: 17.5,
  unpaidDays: 2.5,
  grossPay: 1000,
  totalDeductions: 125,
  netPay: 875,
  generatedAt: '2026-09-27T04:29:54.167Z',
  ...overrides,
});

export const payslipDetail = (overrides: Partial<PayslipDetail> = {}): PayslipDetail => ({
  ...payslip(),
  earnings: [{ id: 'li-1', label: 'Base Salary', amount: 1000 }],
  deductions: [{ id: 'li-2', label: 'Unpaid Absence (2.5 days)', amount: 125 }],
  ...overrides,
});

export const pageOf = <T>(items: T[], page = 1, limit = 10, total = items.length) => ({
  items,
  pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
});
