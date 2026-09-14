import { z } from 'zod';

// Mirrored 1:1 against the Prisma Weekday enum (docs/domain-shift.md §4:
// "a non-empty subset of the seven weekdays").
const WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

// 24-hour "HH:mm" only - startTime/endTime are stored as strings, not
// DateTime (see schema.prisma's Shift model comment for why). This regex is
// the only format guard; the overnight (endTime < startTime) interpretation
// itself is a business rule applied in the service layer, not a validation
// rejection (ADR-SH03: crossing midnight is valid, not an error).
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeField = () =>
  z.string().regex(TIME_REGEX, 'Must be a 24-hour "HH:mm" time, e.g. "09:00"');

export const createShiftSchema = z
  .object({
    name: z.string().trim().min(1, 'Shift name is required').meta({ example: 'Day Shift 9-6' }),
    startTime: timeField().meta({ example: '09:00' }),
    endTime: timeField().meta({ example: '18:00' }),
    workingDays: z
      .array(z.enum(WEEKDAYS))
      .min(1, 'workingDays must be a non-empty subset of the seven weekdays')
      .meta({ example: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] }),
  })
  .meta({ id: 'CreateShiftRequest' });

export const updateShiftSchema = z
  .object({
    name: z.string().trim().min(1, 'Shift name is required').optional().meta({
      example: 'Day Shift 9-6',
    }),
    startTime: timeField().optional().meta({ example: '09:00' }),
    endTime: timeField().optional().meta({ example: '18:00' }),
    workingDays: z
      .array(z.enum(WEEKDAYS))
      .min(1, 'workingDays must be a non-empty subset of the seven weekdays')
      .optional()
      .meta({ example: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] }),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().meta({ example: 'INACTIVE' }),
  })
  .meta({ id: 'UpdateShiftRequest' });

const SORTABLE_FIELDS = ['name', 'startTime', 'endTime', 'status', 'createdAt'];

export const listShiftsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    search: z
      .string()
      .optional()
      .transform((value) => (value === '' ? undefined : value))
      .meta({ example: 'day shift', description: 'Matches name' }),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().meta({ example: 'ACTIVE' }),
    sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListShiftsQuery' });
