import { z } from 'zod';

// A generous sanity ceiling, not a real business constraint - mirrors
// employee.validation.js's MAX_SALARY treatment for the same reason
// (catches garbled input, not intended to ever constrain a genuine value).
const MAX_ENTITLEMENT = 365;

export const createLeaveTypeSchema = z
  .object({
    name: z.string().trim().min(1, 'Leave type name is required').meta({ example: 'Annual Leave' }),
    defaultAnnualEntitlement: z
      .number()
      .int()
      .positive('defaultAnnualEntitlement must be a positive whole number of days')
      .max(MAX_ENTITLEMENT, 'defaultAnnualEntitlement seems unreasonably high')
      .meta({ example: 18 }),
  })
  .meta({ id: 'CreateLeaveTypeRequest' });

export const updateLeaveTypeSchema = z
  .object({
    name: z.string().trim().min(1, 'Leave type name is required').optional().meta({
      example: 'Annual Leave',
    }),
    defaultAnnualEntitlement: z
      .number()
      .int()
      .positive('defaultAnnualEntitlement must be a positive whole number of days')
      .max(MAX_ENTITLEMENT, 'defaultAnnualEntitlement seems unreasonably high')
      .optional()
      .meta({ example: 18 }),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().meta({ example: 'INACTIVE' }),
  })
  .meta({ id: 'UpdateLeaveTypeRequest' });

const SORTABLE_FIELDS = ['name', 'defaultAnnualEntitlement', 'status', 'createdAt'];

export const listLeaveTypesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    search: z
      .string()
      .optional()
      .transform((value) => (value === '' ? undefined : value))
      .meta({ example: 'annual', description: 'Matches name' }),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().meta({ example: 'ACTIVE' }),
    sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListLeaveTypesQuery' });
