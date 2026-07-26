import { z } from 'zod';

const SORTABLE_FIELDS = ['name', 'email', 'createdAt'];

export const listUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    search: z
      .string()
      .optional()
      .transform((value) => (value === '' ? undefined : value))
      .meta({ example: 'jane', description: 'Matches name and email' }),
    // Free-string equality, not validated against the real Role table - an
    // unmatched value returns zero rows, same as Employees' department/
    // jobTitle filters (employee.validation.js).
    role: z.string().optional().meta({ example: 'ADMIN' }),
    sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListUsersQuery' });
