import { z } from 'zod';

const STATUSES = ['AVAILABLE', 'ASSIGNED', 'UNDER_REPAIR', 'RETIRED'];

export const createAssetSchema = z
  .object({
    assetTag: z
      .string()
      .trim()
      .min(1, 'Asset tag is required')
      .meta({ example: 'LAP-0042', description: 'Tag or serial number, unique case-insensitively' }),
    type: z.string().trim().min(1, 'Asset type is required').meta({ example: 'Laptop' }),
    description: z
      .string()
      .trim()
      .min(1)
      .optional()
      .meta({ example: 'MacBook Pro 14 inch M3, 16GB' }),
  })
  .meta({ id: 'CreateAssetRequest' });

// ASSIGNED is never a settable target: it is reached only through
// POST /assets/:id/assign (and left only through /return).
export const updateAssetSchema = z
  .object({
    assetTag: z.string().trim().min(1, 'Asset tag is required').optional().meta({
      example: 'LAP-0042',
    }),
    type: z.string().trim().min(1, 'Asset type is required').optional().meta({ example: 'Laptop' }),
    description: z.string().trim().min(1).nullable().optional().meta({ example: null }),
    status: z.enum(['AVAILABLE', 'UNDER_REPAIR', 'RETIRED']).optional().meta({
      example: 'UNDER_REPAIR',
    }),
  })
  .meta({ id: 'UpdateAssetRequest' });

const SORTABLE_FIELDS = ['assetTag', 'type', 'status', 'createdAt'];

export const listAssetsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    search: z
      .string()
      .optional()
      .transform((value) => (value === '' ? undefined : value))
      .meta({ example: 'macbook', description: 'Matches assetTag, type or description' }),
    type: z.string().trim().min(1).optional().meta({ example: 'Laptop' }),
    status: z.enum(STATUSES).optional().meta({ example: 'AVAILABLE' }),
    sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListAssetsQuery' });
