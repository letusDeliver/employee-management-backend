import { Paginated } from '../../../shared/models/paginated.model';
import { EmploymentType } from '../../../shared/models/employment-type';

export type PayrollRunStatus = 'DRAFT' | 'PROCESSING' | 'FINALIZED' | 'PAID';
export type PayslipLineItemType = 'EARNING' | 'DEDUCTION';

/**
 * Exact wire shape of a payroll run, verified against `backend/src/modules/payroll` and the Prisma
 * `PayrollRun` model. A period is ONE calendar month (`periodMonth` 1-12, ADR-PR05). `payslipCount`
 * is present only on `GET /payroll-runs/:id`, never on the list or on a transition's response.
 */
export interface PayrollRunDto {
  id: string;
  periodMonth: number;
  periodYear: number;
  status: PayrollRunStatus;
  createdAt: string;
  updatedAt: string;
  payslipCount?: number;
}

/**
 * A payslip is a SNAPSHOT taken when its run was processed (ADR-PR02): the names, the employment type
 * and every amount are copied, never looked up again. Amounts and day counts are Decimals, so JSON
 * strings (`"1000"`, `"0.5"`). `employeeName` is `null` for an employee with no linked user account,
 * `branchName` for one with no branch. The list omits `lineItems`; only `GET /payslips/:id` has them.
 */
export interface PayslipDto {
  id: string;
  payrollRunId: string;
  employeeId: string;
  periodMonth: number;
  periodYear: number;
  employeeName: string | null;
  departmentName: string;
  designationName: string;
  branchName: string | null;
  employmentType: EmploymentType;
  baseSalary: string;
  workingDaysInPeriod: string;
  paidDays: string;
  unpaidDays: string;
  grossPay: string;
  totalDeductions: string;
  netPay: string;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
  lineItems?: PayslipLineItemDto[];
}

export interface PayslipLineItemDto {
  id: string;
  payslipId: string;
  type: PayslipLineItemType;
  label: string;
  amount: string;
  createdAt: string;
}

// Each endpoint returns its own key, never a generic envelope (blueprint §0).
export interface PayrollRunsListResponse {
  runs: PayrollRunDto[];
  pagination: Paginated;
}

export interface PayrollRunResponse {
  run: PayrollRunDto;
}

export interface PayslipsListResponse {
  payslips: PayslipDto[];
  pagination: Paginated;
}

export interface PayslipResponse {
  payslip: PayslipDto;
}
