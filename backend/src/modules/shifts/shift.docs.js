import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import { ShiftSchema, PaginationMetaSchema } from '../../docs/components/schemas.js';
import { createShiftSchema, updateShiftSchema, listShiftsQuerySchema } from './shift.validation.js';

const TAG = ['Shifts'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'a9b8c7d6-e5f4-4a3b-8c1d-0e9f8a7b6c5e' }),
});

registry.registerPath({
  method: 'post',
  path: '/shifts',
  tags: TAG,
  summary: 'Create a Shift',
  description: "Requires the 'shift:create' permission.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createShiftSchema } } } },
  responses: {
    201: jsonResponse('Shift created', z.object({ shift: ShiftSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'shift:create' permission"),
    409: errorResponse('A shift with this name already exists', {
      status: 'error',
      message: 'A shift with this name already exists',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/shifts',
  tags: TAG,
  summary: 'List Shift records',
  description:
    "Requires the 'shift:read' permission (granted to every role - Shift is non-sensitive reference data). Paginated, searchable (name, case-insensitive), filterable by status, sortable.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listShiftsQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ shifts: z.array(ShiftSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'shift:read' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/shifts/{id}',
  tags: TAG,
  summary: 'Get one Shift record',
  description: "Requires the 'shift:read' permission.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ shift: ShiftSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'shift:read' permission"),
    404: errorResponse('No Shift with this id', {
      status: 'error',
      message: 'Shift not found',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/shifts/{id}',
  tags: TAG,
  summary: 'Update a Shift, including activating/deactivating it',
  description:
    "Requires the 'shift:update' permission. Deactivating a shift never modifies existing Employee.shiftId references - it only blocks future assignment. Changing startTime/endTime/workingDays affects only future Attendance calculations (docs/domain-shift.md §4).",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: updateShiftSchema } } },
  },
  responses: {
    200: jsonResponse('Shift updated', z.object({ shift: ShiftSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'shift:update' permission"),
    404: errorResponse('No Shift with this id', {
      status: 'error',
      message: 'Shift not found',
    }),
    409: errorResponse('A shift with this name already exists', {
      status: 'error',
      message: 'A shift with this name already exists',
    }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/shifts/{id}',
  tags: TAG,
  summary: 'Hard-delete a Shift',
  description:
    "Requires the 'shift:delete' permission. Only permitted when zero Employee records (including soft-deleted ones) reference this shift - deactivate it instead otherwise.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse(
      'Shift deleted',
      z.object({ message: z.string().meta({ example: 'Shift deleted successfully' }) }),
    ),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'shift:delete' permission"),
    404: errorResponse('No Shift with this id', {
      status: 'error',
      message: 'Shift not found',
    }),
    409: errorResponse('This shift has Employee records referencing it and cannot be deleted', {
      status: 'error',
      message:
        'This shift has Employee records referencing it and cannot be deleted - deactivate it instead',
    }),
  },
});
