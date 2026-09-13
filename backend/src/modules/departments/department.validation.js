import { z } from 'zod';

export const createDepartmentSchema = z
  .object({
    name: z.string().trim().min(1, 'Department name is required').meta({ example: 'Engineering' }),
    code: z
      .string()
      .trim()
      .min(1)
      .optional()
      .meta({ example: 'ENG', description: 'Optional, but unique when provided' }),
  })
  .meta({ id: 'CreateDepartmentRequest' });

export const updateDepartmentSchema = z
  .object({
    name: z.string().trim().min(1, 'Department name is required').optional().meta({
      example: 'Engineering',
    }),
    code: z.string().trim().min(1).nullable().optional().meta({ example: 'ENG' }),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().meta({ example: 'INACTIVE' }),
  })
  .meta({ id: 'UpdateDepartmentRequest' });

const SORTABLE_FIELDS = ['name', 'code', 'status', 'createdAt'];

export const listDepartmentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    search: z
      .string()
      .optional()
      .transform((value) => (value === '' ? undefined : value))
      .meta({ example: 'engineering', description: 'Matches name and code' }),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().meta({ example: 'ACTIVE' }),
    sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListDepartmentsQuery' });
