import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import { EmployeeSchema, PaginationMetaSchema } from '../../docs/components/schemas.js';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  listEmployeesQuerySchema,
} from './employee.validation.js';

const TAG = ['Employees'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
});

registry.registerPath({
  method: 'post',
  path: '/employees',
  tags: TAG,
  summary: 'Create an Employee (HR) record',
  description: "Requires the 'employee:create' permission.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createEmployeeSchema } } } },
  responses: {
    201: jsonResponse('Employee created', z.object({ employee: EmployeeSchema })),
    400: errorResponse(
      'Validation failed, or userId/managerId does not reference an existing record',
      {
        status: 'error',
        message: 'userId: references a record that does not exist',
      },
    ),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'employee:create' permission"),
    409: errorResponse('That userId already has a live (non-deleted) Employee record', {
      status: 'error',
      message: 'This user already has an employee record',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/employees',
  tags: TAG,
  summary: 'List non-deleted Employee records',
  description:
    "Requires the 'employee:read:any' permission. Paginated, searchable (search matches Employee.department/jobTitle AND the linked User's name/email), filterable, sortable. An unconditional secondary `id ASC` sort keeps ordering deterministic across pages.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listEmployeesQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ employees: z.array(EmployeeSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse(
      'A query parameter failed validation (e.g. limit over 100, or an unknown sortBy value)',
      {
        status: 'error',
        message: 'limit: Too big: expected number to be <=100',
      },
    ),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'employee:read:any' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/employees/{id}',
  tags: TAG,
  summary: 'Get one Employee record',
  description:
    "Requires 'employee:read:any' OR 'employee:read:own'. With only the :own grant, the service layer compares Employee.userId to the caller's id - a caller can never read someone else's record this way (BOLA-safe by construction, verified live during Feature 9).",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ employee: EmployeeSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller has neither the :any nor a matching :own grant for this record'),
    404: errorResponse('No Employee with this id (including soft-deleted ones)', {
      status: 'error',
      message: 'Employee not found',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/employees/{id}',
  tags: TAG,
  summary: 'Partially update an Employee record',
  description:
    "Requires the 'employee:update:any' permission. Every mutation is wrapped in one transaction with its AuditLog write.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: updateEmployeeSchema } } },
  },
  responses: {
    200: jsonResponse('Employee updated', z.object({ employee: EmployeeSchema })),
    400: errorResponse(
      "Validation failed, an employee was set as its own manager, or managerId/userId doesn't reference an existing record",
      {
        status: 'error',
        message: 'An employee cannot be their own manager',
      },
    ),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'employee:update:any' permission"),
    404: errorResponse('No Employee with this id', {
      status: 'error',
      message: 'Employee not found',
    }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/employees/{id}',
  tags: TAG,
  summary: 'Soft-delete an Employee record',
  description:
    "Requires the 'employee:delete:any' permission. Sets deletedAt - the record disappears from every read path immediately but is not physically removed. Deleting an already-deleted record returns 404, not a distinct 409.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('Employee deleted', z.object({ message: z.string() }), {
      message: 'Employee deleted successfully',
    }),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'employee:delete:any' permission"),
    404: errorResponse('No Employee with this id, or it is already soft-deleted', {
      status: 'error',
      message: 'Employee not found',
    }),
  },
});
