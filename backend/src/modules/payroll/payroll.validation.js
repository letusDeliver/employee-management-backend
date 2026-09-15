import { z } from 'zod';

// Confirmed with the user (2026-09-15, per docs/domain-payroll.md ADR-PR05)
// that Employee.salary is a MONTHLY figure - a PayrollRun period is
// therefore a single calendar month, not an arbitrary date range.
export const createPayrollRunSchema = z
  .object({
    periodMonth: z.number().int().min(1).max(12).meta({ example: 9 }),
    periodYear: z.number().int().min(2000).max(2100).meta({ example: 2026 }),
  })
  .meta({ id: 'CreatePayrollRunRequest' });

const PAYROLL_RUN_STATUSES = ['DRAFT', 'PROCESSING', 'FINALIZED', 'PAID'];
const PAYROLL_RUN_SORTABLE_FIELDS = ['periodYear', 'periodMonth', 'status', 'createdAt'];

export const listPayrollRunsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    status: z.enum(PAYROLL_RUN_STATUSES).optional().meta({ example: null }),
    periodYear: z.coerce.number().int().optional().meta({ example: null }),
    sortBy: z.enum(PAYROLL_RUN_SORTABLE_FIELDS).default('periodYear'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListPayrollRunsQuery' });

const PAYSLIP_SORTABLE_FIELDS = ['periodYear', 'periodMonth', 'netPay', 'createdAt'];

export const listPayslipsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    // Only honored when the caller holds payslip:read:any - a caller
    // scoped to :read:own has this silently overridden in the service
    // layer (see payroll.service.js's listPayslips), same shape as Leave's
    // list endpoints.
    employeeId: z.string().uuid().optional().meta({ example: null }),
    payrollRunId: z.string().uuid().optional().meta({ example: null }),
    sortBy: z.enum(PAYSLIP_SORTABLE_FIELDS).default('periodYear'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListPayslipsQuery' });
