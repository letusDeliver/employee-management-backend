import { z } from 'zod';

export const createReviewCycleSchema = z
  .object({
    name: z.string().trim().min(1, 'Review cycle name is required').meta({ example: 'H1 2026 Review' }),
    startDate: z.coerce.date().meta({ example: '2026-01-01' }),
    endDate: z.coerce.date().meta({ example: '2026-06-30' }),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: 'startDate cannot be after endDate',
    path: ['endDate'],
  })
  .meta({ id: 'CreateReviewCycleRequest' });

export const updateReviewCycleSchema = z
  .object({
    name: z.string().trim().min(1, 'Review cycle name is required').optional().meta({
      example: 'H1 2026 Review',
    }),
    startDate: z.coerce.date().optional().meta({ example: '2026-01-01' }),
    endDate: z.coerce.date().optional().meta({ example: '2026-06-30' }),
    status: z.enum(['OPEN', 'CLOSED']).optional().meta({ example: 'CLOSED' }),
  })
  .refine((data) => !data.startDate || !data.endDate || data.startDate <= data.endDate, {
    message: 'startDate cannot be after endDate',
    path: ['endDate'],
  })
  .meta({ id: 'UpdateReviewCycleRequest' });

const SORTABLE_FIELDS = ['name', 'startDate', 'endDate', 'status', 'createdAt'];

export const listReviewCyclesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    search: z
      .string()
      .optional()
      .transform((value) => (value === '' ? undefined : value))
      .meta({ example: 'H1', description: 'Matches name' }),
    status: z.enum(['OPEN', 'CLOSED']).optional().meta({ example: 'OPEN' }),
    sortBy: z.enum(SORTABLE_FIELDS).default('startDate'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListReviewCyclesQuery' });
