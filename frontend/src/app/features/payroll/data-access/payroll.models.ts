import { EmploymentType } from '../../../shared/models/employment-type';
import { PayrollRunStatus } from './payroll.dto';

export type { PayrollRunStatus, PayslipLineItemType } from './payroll.dto';

/**
 * What components and stores work with. There IS a DTO -> model split (see `payroll.mapper.ts`):
 * every amount and day count arrives as a Decimal string and is a number to everything that shows,
 * sums or compares it.
 */
export interface PayrollRun {
  id: string;
  periodMonth: number;
  periodYear: number;
  status: PayrollRunStatus;
  createdAt: string;
  updatedAt: string;
  /** Only known from `GET /payroll-runs/:id`; `null` elsewhere (never guessed as 0). */
  payslipCount: number | null;
}

export interface Payslip {
  id: string;
  payrollRunId: string;
  employeeId: string;
  periodMonth: number;
  periodYear: number;
  /** Snapshot; `null` when the employee had no linked user account. */
  employeeName: string | null;
  departmentName: string;
  designationName: string;
  /** Snapshot; `null` when the employee had no branch. */
  branchName: string | null;
  employmentType: EmploymentType;
  baseSalary: number;
  workingDaysInPeriod: number;
  paidDays: number;
  unpaidDays: number;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  generatedAt: string;
}

export interface PayslipLine {
  id: string;
  label: string;
  amount: number;
}

/** A payslip with its line items, split by type (only `GET /payslips/:id` returns them). */
export interface PayslipDetail extends Payslip {
  earnings: PayslipLine[];
  deductions: PayslipLine[];
}

export interface CreatePayrollRunRequest {
  periodMonth: number;
  periodYear: number;
}

/** The backend's own sort whitelists (`payroll.validation.js`) - one key each, `id` as the tie-break. */
export type PayrollRunSortField = 'periodYear' | 'periodMonth' | 'status' | 'createdAt';
export type PayslipSortField = 'periodYear' | 'periodMonth' | 'netPay' | 'createdAt';

export interface PayrollRunListQuery {
  page: number;
  limit: number;
  status?: PayrollRunStatus;
  periodYear?: number;
  sortBy: PayrollRunSortField;
  order: 'asc' | 'desc';
}

export interface PayslipListQuery {
  page: number;
  limit: number;
  /** Honoured only for a caller with `payslip:read:any`; otherwise the server scopes to their own. */
  employeeId?: string;
  payrollRunId?: string;
  sortBy: PayslipSortField;
  order: 'asc' | 'desc';
}
