import { z } from 'zod';

export const createDesignationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Designation name is required')
      .meta({ example: 'Backend Engineer' }),
    code: z
      .string()
      .trim()
      .min(1)
      .optional()
      .meta({ example: 'SWE', description: 'Optional, but unique when provided' }),
  })
  .meta({ id: 'CreateDesignationRequest' });

export const updateDesignationSchema = z
  .object({
    name: z.string().trim().min(1, 'Designation name is required').optional().meta({
      example: 'Backend Engineer',
    }),
    code: z.string().trim().min(1).nullable().optional().meta({ example: 'SWE' }),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().meta({ example: 'INACTIVE' }),
  })
  .meta({ id: 'UpdateDesignationRequest' });

const SORTABLE_FIELDS = ['name', 'code', 'status', 'createdAt'];

export const listDesignationsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    search: z
      .string()
      .optional()
      .transform((value) => (value === '' ? undefined : value))
      .meta({ example: 'engineer', description: 'Matches name and code' }),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().meta({ example: 'ACTIVE' }),
    sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListDesignationsQuery' });
