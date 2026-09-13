import { z } from 'zod';

export const createHolidayCalendarSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Holiday calendar name is required')
      .meta({ example: 'India Public Holidays' }),
  })
  .meta({ id: 'CreateHolidayCalendarRequest' });

export const updateHolidayCalendarSchema = z
  .object({
    name: z.string().trim().min(1, 'Holiday calendar name is required').optional().meta({
      example: 'India Public Holidays',
    }),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().meta({ example: 'INACTIVE' }),
  })
  .meta({ id: 'UpdateHolidayCalendarRequest' });

const SORTABLE_FIELDS = ['name', 'status', 'createdAt'];

export const listHolidayCalendarsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    search: z
      .string()
      .optional()
      .transform((value) => (value === '' ? undefined : value))
      .meta({ example: 'india', description: 'Matches name' }),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().meta({ example: 'ACTIVE' }),
    sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListHolidayCalendarsQuery' });

// Holiday entries are minimal by design (docs/domain-holiday-calendar.md §4):
// date, name, and an isOptional flag - resist adding region/state-level
// sub-scoping here; model that as a separate calendar instead.
export const createHolidaySchema = z
  .object({
    date: z.coerce.date().meta({ example: '2026-08-15' }),
    name: z.string().trim().min(1, 'Holiday name is required').meta({ example: 'Independence Day' }),
    isOptional: z.boolean().optional().default(false).meta({ example: false }),
  })
  .meta({ id: 'CreateHolidayRequest' });

export const updateHolidaySchema = z
  .object({
    date: z.coerce.date().optional().meta({ example: '2026-08-15' }),
    name: z.string().trim().min(1, 'Holiday name is required').optional().meta({
      example: 'Independence Day',
    }),
    isOptional: z.boolean().optional().meta({ example: false }),
  })
  .meta({ id: 'UpdateHolidayRequest' });
