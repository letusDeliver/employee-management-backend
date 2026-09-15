import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import { PayrollRunSchema, PayslipSchema, PaginationMetaSchema } from '../../docs/components/schemas.js';
import {
  createPayrollRunSchema,
  listPayrollRunsQuerySchema,
  listPayslipsQuerySchema,
} from './payroll.validation.js';

const RUN_TAG = ['Payroll Runs'];
const PAYSLIP_TAG = ['Payslips'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6f7a8b9c' }),
});

registry.registerPath({
  method: 'post',
  path: '/payroll-runs',
  tags: RUN_TAG,
  summary: 'Create a DRAFT Payroll Run for a period',
  description:
    "Requires the 'payrollRun:create' permission (ADMIN only). Employee.salary is confirmed to represent a MONTHLY figure (docs/domain-payroll.md ADR-PR05), so a period is one calendar month - periodMonth/periodYear together must be unique (ADR-PR01's 'periods must not overlap').",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createPayrollRunSchema } } } },
  responses: {
    201: jsonResponse('Payroll run created (DRAFT)', z.object({ run: PayrollRunSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'payrollRun:create' permission"),
    409: errorResponse('A payroll run already exists for this period', {
      status: 'error',
      message: 'A payroll run already exists for this period',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/payroll-runs',
  tags: RUN_TAG,
  summary: 'List Payroll Runs',
  description: "Requires the 'payrollRun:read' permission (ADMIN only). Paginated, filterable (status, periodYear), sortable.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listPayrollRunsQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ runs: z.array(PayrollRunSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'payrollRun:read' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/payroll-runs/{id}',
  tags: RUN_TAG,
  summary: 'Get one Payroll Run',
  description:
    "Requires the 'payrollRun:read' permission (ADMIN only). Includes payslipCount - the number of Payslips generated so far for this run.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ run: PayrollRunSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'payrollRun:read' permission"),
    404: errorResponse('No Payroll Run with this id', {
      status: 'error',
      message: 'Payroll run not found',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/payroll-runs/{id}/process',
  tags: RUN_TAG,
  summary: 'Generate Payslips and move a run from DRAFT to PROCESSING',
  description:
    "Requires the 'payrollRun:process' permission (ADMIN only). Generates exactly one Payslip per active (non-soft-deleted) Employee, computing gross pay, unpaid-day deductions, and net pay from that employee's salary, attendance, and approved-leave data for the run's period (docs/domain-payroll.md §5). Only a DRAFT run can be processed.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('Run moved to PROCESSING, Payslips generated', z.object({ run: PayrollRunSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'payrollRun:process' permission"),
    404: errorResponse('No Payroll Run with this id', {
      status: 'error',
      message: 'Payroll run not found',
    }),
    409: errorResponse('Run is not DRAFT', {
      status: 'error',
      message: 'Only a DRAFT payroll run can be processed',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/payroll-runs/{id}/finalize',
  tags: RUN_TAG,
  summary: 'Finalize a PROCESSING run',
  description:
    "Requires the 'payrollRun:finalize' permission (ADMIN only). The central lifecycle rule of this domain (docs/domain-payroll.md §2, ADR-PR01): once FINALIZED, this run's Payslips become immutable - there is no edit path for a Payslip at any status, so this transition has no separate 'unfinalize'.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('Run moved to FINALIZED', z.object({ run: PayrollRunSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'payrollRun:finalize' permission"),
    404: errorResponse('No Payroll Run with this id', {
      status: 'error',
      message: 'Payroll run not found',
    }),
    409: errorResponse('Run is not PROCESSING', {
      status: 'error',
      message: 'Only a PROCESSING payroll run can be finalized',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/payroll-runs/{id}/mark-paid',
  tags: RUN_TAG,
  summary: 'Record that a FINALIZED run has been paid out',
  description:
    "Requires the 'payrollRun:markPaid' permission (ADMIN only). A pure status transition, not a recalculation (docs/domain-payroll.md §2).",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('Run moved to PAID', z.object({ run: PayrollRunSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'payrollRun:markPaid' permission"),
    404: errorResponse('No Payroll Run with this id', {
      status: 'error',
      message: 'Payroll run not found',
    }),
    409: errorResponse('Run is not FINALIZED', {
      status: 'error',
      message: 'Only a FINALIZED payroll run can be marked as paid',
    }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/payroll-runs/{id}',
  tags: RUN_TAG,
  summary: 'Delete a DRAFT Payroll Run',
  description:
    "Requires the 'payrollRun:delete' permission (ADMIN only). Only a DRAFT run may be deleted - by construction it has zero Payslips yet, since those only come into existence via /process.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('Payroll run deleted', z.object({ message: z.string() })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'payrollRun:delete' permission"),
    404: errorResponse('No Payroll Run with this id', {
      status: 'error',
      message: 'Payroll run not found',
    }),
    409: errorResponse('Run is not DRAFT', {
      status: 'error',
      message: 'Only a DRAFT payroll run can be deleted',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/payslips',
  tags: PAYSLIP_TAG,
  summary: 'List Payslips',
  description:
    "Requires 'payslip:read:any' or 'payslip:read:own'. Same own-vs-any auto-scoping shape as GET /leave-requests: a caller without ':any' is auto-scoped to their own Employee's Payslips. Paginated, filterable (employeeId [':any' only], payrollRunId), sortable. List items omit lineItems - fetch GET /payslips/:id for the full breakdown.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listPayslipsQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ payslips: z.array(PayslipSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks both 'payslip:read:any' and 'payslip:read:own'"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/payslips/{id}',
  tags: PAYSLIP_TAG,
  summary: 'Get one Payslip',
  description:
    "Requires 'payslip:read:any' or 'payslip:read:own' (own record only). Includes the full lineItems breakdown. There is no edit endpoint at any status - a finalized Payslip is immutable, and corrections are adjustment entries in a later run (docs/domain-payroll.md §2).",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ payslip: PayslipSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller lacks permission to view this payslip'),
    404: errorResponse('No Payslip with this id', {
      status: 'error',
      message: 'Payslip not found',
    }),
  },
});
