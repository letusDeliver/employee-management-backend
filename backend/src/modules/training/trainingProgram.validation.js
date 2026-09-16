import { z } from 'zod';

export const createTrainingProgramSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Training program name is required')
      .meta({ example: 'Annual Security Awareness' }),
    description: z.string().trim().min(1).optional().meta({ example: null }),
    mandatory: z.boolean().default(false).meta({ example: true }),
    // Only meaningful for compliance courses (mandatory: true) - not
    // enforced as required even then, since a mandatory program could
    // still be a one-time, never-expiring requirement.
    renewalPeriodDays: z
      .number()
      .int()
      .positive('renewalPeriodDays must be a positive integer')
      .optional()
      .meta({ example: 365 }),
  })
  .meta({ id: 'CreateTrainingProgramRequest' });

export const updateTrainingProgramSchema = z
  .object({
    name: z.string().trim().min(1, 'Training program name is required').optional().meta({
      example: 'Annual Security Awareness',
    }),
    description: z.string().trim().min(1).nullable().optional().meta({ example: null }),
    mandatory: z.boolean().optional().meta({ example: true }),
    renewalPeriodDays: z.number().int().positive().nullable().optional().meta({ example: 365 }),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().meta({ example: 'INACTIVE' }),
  })
  .meta({ id: 'UpdateTrainingProgramRequest' });

const SORTABLE_FIELDS = ['name', 'mandatory', 'status', 'createdAt'];

export const listTrainingProgramsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    search: z
      .string()
      .optional()
      .transform((value) => (value === '' ? undefined : value))
      .meta({ example: 'security', description: 'Matches name' }),
    mandatory: z.coerce.boolean().optional().meta({ example: null }),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().meta({ example: 'ACTIVE' }),
    sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListTrainingProgramsQuery' });
