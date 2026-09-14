import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import { LeaveTypeSchema, PaginationMetaSchema } from '../../docs/components/schemas.js';
import {
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
  listLeaveTypesQuerySchema,
} from './leaveType.validation.js';

const TAG = ['Leave Types'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6f' }),
});

registry.registerPath({
  method: 'post',
  path: '/leave-types',
  tags: TAG,
  summary: 'Create a Leave Type',
  description: "Requires the 'leaveType:create' permission.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createLeaveTypeSchema } } } },
  responses: {
    201: jsonResponse('Leave type created', z.object({ leaveType: LeaveTypeSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'leaveType:create' permission"),
    409: errorResponse('A leave type with this name already exists', {
      status: 'error',
      message: 'A leave type with this name already exists',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/leave-types',
  tags: TAG,
  summary: 'List Leave Type records',
  description:
    "Requires the 'leaveType:read' permission (granted to every role). Paginated, searchable (name, case-insensitive), filterable by status, sortable.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listLeaveTypesQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ leaveTypes: z.array(LeaveTypeSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'leaveType:read' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/leave-types/{id}',
  tags: TAG,
  summary: 'Get one Leave Type record',
  description: "Requires the 'leaveType:read' permission.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ leaveType: LeaveTypeSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'leaveType:read' permission"),
    404: errorResponse('No Leave Type with this id', {
      status: 'error',
      message: 'Leave type not found',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/leave-types/{id}',
  tags: TAG,
  summary: 'Update a Leave Type, including activating/deactivating it',
  description:
    "Requires the 'leaveType:update' permission. Deactivating a leave type blocks future LeaveRequest creation against it (leaveTypeService.assertLeaveTypeAssignable) but never touches existing requests/balances.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: updateLeaveTypeSchema } } },
  },
  responses: {
    200: jsonResponse('Leave type updated', z.object({ leaveType: LeaveTypeSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'leaveType:update' permission"),
    404: errorResponse('No Leave Type with this id', {
      status: 'error',
      message: 'Leave type not found',
    }),
    409: errorResponse('A leave type with this name already exists', {
      status: 'error',
      message: 'A leave type with this name already exists',
    }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/leave-types/{id}',
  tags: TAG,
  summary: 'Hard-delete a Leave Type',
  description:
    "Requires the 'leaveType:delete' permission. Only permitted when zero LeaveRequest and zero LeaveBalance records reference this type - deactivate it instead otherwise.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse(
      'Leave type deleted',
      z.object({ message: z.string().meta({ example: 'Leave type deleted successfully' }) }),
    ),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'leaveType:delete' permission"),
    404: errorResponse('No Leave Type with this id', {
      status: 'error',
      message: 'Leave type not found',
    }),
    409: errorResponse(
      'This leave type has LeaveRequest or LeaveBalance records referencing it and cannot be deleted',
      {
        status: 'error',
        message:
          'This leave type has LeaveRequest or LeaveBalance records referencing it and cannot be deleted - deactivate it instead',
      },
    ),
  },
});
