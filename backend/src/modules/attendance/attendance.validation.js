import { z } from 'zod';

// Admin/manager manual creation (docs/domain-attendance.md §2: "administrative
// creation ... must also be supported"). date/checkIn/checkOut are coerced
// from ISO strings; date is truncated to a calendar day by the service layer
// before it ever reaches the repository - this schema only guards shape.
export const createAttendanceRecordSchema = z
  .object({
    employeeId: z.string().uuid().meta({ example: '5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7b' }),
    date: z.coerce
      .date()
      .refine((date) => date <= new Date(), { message: 'date cannot be in the future' })
      .meta({ example: '2026-09-15' }),
    checkIn: z.coerce.date().optional().meta({ example: '2026-09-15T09:05:00.000Z' }),
    checkOut: z.coerce.date().optional().meta({ example: '2026-09-15T18:02:00.000Z' }),
    // Stored fact, not derived (see schema.prisma's AttendanceRecord comment)
    // - defaults false, same convention as Holiday.isOptional.
    isHalfDay: z.boolean().optional().meta({ example: false }),
  })
  .refine((data) => !data.checkIn || !data.checkOut || data.checkOut >= data.checkIn, {
    message: 'checkOut cannot be before checkIn',
    path: ['checkOut'],
  })
  .meta({ id: 'CreateAttendanceRecordRequest' });

// Correction only (docs/domain-attendance.md §2: "correction of a check-in/
// check-out time ... by ADMIN/HR") - employeeId/date are deliberately absent:
// changing which employee or date a record belongs to isn't a correction,
// it's a different record.
export const updateAttendanceRecordSchema = z
  .object({
    checkIn: z.coerce.date().nullable().optional().meta({ example: '2026-09-15T09:05:00.000Z' }),
    checkOut: z.coerce.date().nullable().optional().meta({ example: '2026-09-15T18:02:00.000Z' }),
    isHalfDay: z.boolean().optional().meta({ example: false }),
  })
  .refine((data) => !data.checkIn || !data.checkOut || data.checkOut >= data.checkIn, {
    message: 'checkOut cannot be before checkIn',
    path: ['checkOut'],
  })
  .meta({ id: 'UpdateAttendanceRecordRequest' });

const SORTABLE_FIELDS = ['date', 'checkIn', 'checkOut', 'createdAt'];

export const listAttendanceQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    employeeId: z.string().uuid().optional().meta({ example: null }),
    dateFrom: z.coerce.date().optional().meta({ example: null }),
    dateTo: z.coerce.date().optional().meta({ example: null }),
    sortBy: z.enum(SORTABLE_FIELDS).default('date'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListAttendanceQuery' });

// employeeId optional - omitted means "resolve to the caller's own Employee
// record" (attendance.service.js's getEffectiveStatus), date is mandatory
// since the coordinating-service read always needs exactly one day.
export const effectiveStatusQuerySchema = z
  .object({
    employeeId: z.string().uuid().optional().meta({ example: null }),
    date: z.coerce.date().meta({ example: '2026-09-15' }),
  })
  .meta({ id: 'EffectiveStatusQuery' });
