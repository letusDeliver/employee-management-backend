import { z } from 'zod';

export const assignAssetSchema = z
  .object({
    employeeId: z.string().uuid().meta({ example: '5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7d' }),
    // Optional back-dating for equipment handed over before it was
    // recorded; defaults to now. Never in the future.
    assignedAt: z.coerce
      .date()
      .refine((value) => value.getTime() <= Date.now(), 'assignedAt cannot be in the future')
      .optional()
      .meta({ example: '2026-09-15T09:05:00.000Z' }),
  })
  .meta({ id: 'AssignAssetRequest' });

// condition is required on purpose (domain-asset-management.md §2): where
// a returned asset goes next is a judgment call made at return time, not
// automatic. GOOD -> AVAILABLE, DAMAGED -> UNDER_REPAIR.
export const returnAssetSchema = z
  .object({
    condition: z.enum(['GOOD', 'DAMAGED']).meta({ example: 'GOOD' }),
    notes: z.string().trim().min(1).optional().meta({ example: 'Minor scratches on the lid' }),
  })
  .meta({ id: 'ReturnAssetRequest' });

const SORTABLE_FIELDS = ['assignedAt', 'returnedAt', 'createdAt'];

export const listAssetAssignmentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    employeeId: z.string().uuid().optional().meta({ example: null }),
    assetId: z.string().uuid().optional().meta({ example: null }),
    // 'true' = still held (returnedAt null), 'false' = returned. An enum
    // rather than z.coerce.boolean(), which would treat the string
    // 'false' as true.
    active: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === 'true'))
      .meta({ example: 'true', description: 'Only currently-held (true) or only returned (false)' }),
    sortBy: z.enum(SORTABLE_FIELDS).default('assignedAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListAssetAssignmentsQuery' });
