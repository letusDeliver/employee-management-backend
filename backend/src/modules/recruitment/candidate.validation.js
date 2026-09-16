import { z } from 'zod';

export const createCandidateSchema = z
  .object({
    name: z.string().trim().min(1, 'Candidate name is required').meta({ example: 'Jane Doe' }),
    email: z.string().trim().email().meta({ example: 'jane.doe@example.com' }),
    phone: z.string().trim().min(1).optional().meta({ example: '+1-555-0100' }),
  })
  .meta({ id: 'CreateCandidateRequest' });

export const updateCandidateSchema = createCandidateSchema
  .partial()
  .extend({
    phone: z.string().trim().min(1).nullable().optional().meta({ example: null }),
  })
  .meta({ id: 'UpdateCandidateRequest' });

const SORTABLE_FIELDS = ['name', 'email', 'createdAt'];

export const listCandidatesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    search: z
      .string()
      .optional()
      .transform((value) => (value === '' ? undefined : value))
      .meta({ example: 'jane', description: 'Matches name, email, and phone' }),
    sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListCandidatesQuery' });
