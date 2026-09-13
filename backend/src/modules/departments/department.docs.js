import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import { DepartmentSchema, PaginationMetaSchema } from '../../docs/components/schemas.js';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  listDepartmentsQuerySchema,
} from './department.validation.js';

const TAG = ['Departments'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'd1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
});

registry.registerPath({
  method: 'post',
  path: '/departments',
  tags: TAG,
  summary: 'Create a Department',
  description: "Requires the 'department:create' permission.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createDepartmentSchema } } } },
  responses: {
    201: jsonResponse('Department created', z.object({ department: DepartmentSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'department:create' permission"),
    409: errorResponse('A department with this name or code already exists', {
      status: 'error',
      message: 'A department with this name or code already exists',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/departments',
  tags: TAG,
  summary: 'List Department records',
  description:
    "Requires the 'department:read' permission (granted to every role - Department is non-sensitive reference data). Paginated, searchable (name/code, case-insensitive), filterable by status, sortable.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listDepartmentsQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ departments: z.array(DepartmentSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'department:read' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/departments/{id}',
  tags: TAG,
  summary: 'Get one Department record',
  description: "Requires the 'department:read' permission.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ department: DepartmentSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'department:read' permission"),
    404: errorResponse('No Department with this id', {
      status: 'error',
      message: 'Department not found',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/departments/{id}',
  tags: TAG,
  summary: 'Update a Department, including activating/deactivating it',
  description:
    "Requires the 'department:update' permission. Deactivating a department never modifies existing Employee.departmentId references - it only blocks future assignment.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: updateDepartmentSchema } } },
  },
  responses: {
    200: jsonResponse('Department updated', z.object({ department: DepartmentSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'department:update' permission"),
    404: errorResponse('No Department with this id', {
      status: 'error',
      message: 'Department not found',
    }),
    409: errorResponse('A department with this name or code already exists', {
      status: 'error',
      message: 'A department with this name or code already exists',
    }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/departments/{id}',
  tags: TAG,
  summary: 'Hard-delete a Department',
  description:
    "Requires the 'department:delete' permission. Only permitted when zero Employee records (including soft-deleted ones) reference this department - deactivate it instead otherwise. Note: departmentId is mandatory on Employee, so any live Employee always references some department.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse(
      'Department deleted',
      z.object({ message: z.string().meta({ example: 'Department deleted successfully' }) }),
    ),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'department:delete' permission"),
    404: errorResponse('No Department with this id', {
      status: 'error',
      message: 'Department not found',
    }),
    409: errorResponse(
      'This department has Employee records referencing it and cannot be deleted',
      {
        status: 'error',
        message:
          'This department has Employee records referencing it and cannot be deleted - deactivate it instead',
      },
    ),
  },
});
