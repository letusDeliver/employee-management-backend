import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import {
  AttendanceRecordSchema,
  EffectiveStatusSchema,
  PaginationMetaSchema,
} from '../../docs/components/schemas.js';
import {
  createAttendanceRecordSchema,
  updateAttendanceRecordSchema,
  listAttendanceQuerySchema,
  effectiveStatusQuerySchema,
} from './attendance.validation.js';

const TAG = ['Attendance'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'c9b8a7d6-e5f4-4a3b-8c1d-0e9f8a7b6c5f' }),
});

registry.registerPath({
  method: 'post',
  path: '/attendance/check-in',
  tags: TAG,
  summary: "Self-service check-in for the caller's own Employee record",
  description:
    "Requires the 'attendance:checkin' permission (every role). Resolves the caller's own Employee record from their User id. Creates today's AttendanceRecord (or fills in checkIn on an admin-precreated blank record) - never accepts a body, the timestamp is always the server's current time.",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    201: jsonResponse('Checked in', z.object({ record: AttendanceRecordSchema })),
    400: errorResponse('No employee record linked to this account', {
      status: 'error',
      message: 'No employee record linked to this account',
    }),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'attendance:checkin' permission"),
    409: errorResponse('Already checked in for today', {
      status: 'error',
      message: 'Already checked in for today',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/attendance/check-out',
  tags: TAG,
  summary: "Self-service check-out for the caller's own Employee record",
  description:
    "Requires the 'attendance:checkin' permission (every role). Sets checkOut on today's AttendanceRecord - never accepts a body.",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: jsonResponse('Checked out', z.object({ record: AttendanceRecordSchema })),
    400: errorResponse('Cannot check out before checking in today', {
      status: 'error',
      message: 'Cannot check out before checking in today',
    }),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'attendance:checkin' permission"),
    409: errorResponse('Already checked out for today', {
      status: 'error',
      message: 'Already checked out for today',
    }),
  },
});

registry.registerPath({
  method: 'post',
  path: '/attendance',
  tags: TAG,
  summary: 'Administratively create an AttendanceRecord for any Employee',
  description:
    "Requires the 'attendance:create:any' permission (ADMIN/MANAGER). Supports HR marking attendance manually for an exception - date must not be in the future.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createAttendanceRecordSchema } } } },
  responses: {
    201: jsonResponse('Attendance record created', z.object({ record: AttendanceRecordSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'attendance:create:any' permission"),
    409: errorResponse('An attendance record already exists for this employee and date', {
      status: 'error',
      message: 'An attendance record already exists for this employee and date',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/attendance',
  tags: TAG,
  summary: 'List AttendanceRecords across any Employee',
  description:
    "Requires the 'attendance:read:any' permission (ADMIN/MANAGER) - no auto-scoped ':own' listing, the same shape as GET /employees. Paginated, filterable (employeeId, dateFrom/dateTo), sortable.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listAttendanceQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ records: z.array(AttendanceRecordSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'attendance:read:any' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/attendance/effective-status',
  tags: TAG,
  summary: "Compute an Employee's effective daily attendance status for one date",
  description:
    "Requires 'attendance:read:any' or 'attendance:read:own'. The coordinating-service read (docs/domain-attendance.md §3/§5): cross-references Shift and Holiday Calendar with the raw AttendanceRecord to produce one of PRESENT/LATE/HALF_DAY/ABSENT/HOLIDAY/WEEK_OFF - never persisted (ADR-AT03). `employeeId` is optional and defaults to the caller's own Employee record; a caller without ':any' may only query their own. Does not resolve an 'On Leave' status - the Leave domain that would require doesn't exist yet.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: effectiveStatusQuerySchema },
  responses: {
    200: jsonResponse('OK', EffectiveStatusSchema),
    400: errorResponse('A query parameter failed validation, or no employee record is linked'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller queried a different employeeId without the \'any\' permission'),
    404: errorResponse('No Employee with this id', {
      status: 'error',
      message: 'Employee not found',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/attendance/{id}',
  tags: TAG,
  summary: 'Get one AttendanceRecord',
  description:
    "Requires 'attendance:read:any' or 'attendance:read:own' (own record only, mirrors GET /employees/:id's ownership check).",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ record: AttendanceRecordSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller lacks permission to view this record'),
    404: errorResponse('No AttendanceRecord with this id', {
      status: 'error',
      message: 'Attendance record not found',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/attendance/{id}',
  tags: TAG,
  summary: 'Correct an AttendanceRecord (checkIn/checkOut/isHalfDay)',
  description:
    "Requires the 'attendance:update:any' permission (ADMIN/MANAGER). employeeId/date cannot be changed - correcting a record's employee or date isn't a correction, it's a different record. Every correction is captured in AuditLog (ADR-AT04).",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: updateAttendanceRecordSchema } } },
  },
  responses: {
    200: jsonResponse('Attendance record updated', z.object({ record: AttendanceRecordSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'attendance:update:any' permission"),
    404: errorResponse('No AttendanceRecord with this id', {
      status: 'error',
      message: 'Attendance record not found',
    }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/attendance/{id}',
  tags: TAG,
  summary: 'Delete an AttendanceRecord',
  description:
    "Requires the 'attendance:delete:any' permission (ADMIN/MANAGER). No reference-count restriction - nothing holds a foreign key onto AttendanceRecord. Rare and audit-logged, not a routine lifecycle step.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse(
      'Attendance record deleted',
      z.object({ message: z.string().meta({ example: 'Attendance record deleted successfully' }) }),
    ),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'attendance:delete:any' permission"),
    404: errorResponse('No AttendanceRecord with this id', {
      status: 'error',
      message: 'Attendance record not found',
    }),
  },
});
