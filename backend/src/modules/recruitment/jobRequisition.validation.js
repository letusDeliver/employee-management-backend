import { z } from 'zod';

// Mirrors employee.validation.js's own EMPLOYMENT_TYPES list exactly - the
// existing EmploymentType enum is reused, not redefined, for this domain
// (docs/domain-recruitment.md §3: "the same four axes an Employee
// ultimately carries").
const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];
const STATUSES = ['OPEN', 'ON_HOLD', 'CLOSED', 'CANCELLED'];

export const createJobRequisitionSchema = z
  .object({
    departmentId: z.string().uuid().meta({ example: '5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7c' }),
    designationId: z.string().uuid().meta({ example: '5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7d' }),
    branchId: z.string().uuid().optional().meta({ example: null }),
    employmentType: z.enum(EMPLOYMENT_TYPES).meta({ example: 'FULL_TIME' }),
    numberOfOpenings: z
      .number()
      .int()
      .positive('numberOfOpenings must be a positive integer')
      .meta({ example: 2 }),
  })
  .meta({ id: 'CreateJobRequisitionRequest' });

export const updateJobRequisitionStatusSchema = z
  .object({
    status: z.enum(STATUSES).meta({ example: 'ON_HOLD' }),
  })
  .meta({ id: 'UpdateJobRequisitionStatusRequest' });

const SORTABLE_FIELDS = ['status', 'employmentType', 'createdAt'];

export const listJobRequisitionsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    departmentId: z.string().uuid().optional().meta({ example: null }),
    designationId: z.string().uuid().optional().meta({ example: null }),
    branchId: z.string().uuid().optional().meta({ example: null }),
    status: z.enum(STATUSES).optional().meta({ example: 'OPEN' }),
    sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListJobRequisitionsQuery' });
