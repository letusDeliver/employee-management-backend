import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import { DesignationSchema, PaginationMetaSchema } from '../../docs/components/schemas.js';
import {
  createDesignationSchema,
  updateDesignationSchema,
  listDesignationsQuerySchema,
} from './designation.validation.js';

const TAG = ['Designations'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'e1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
});

registry.registerPath({
  method: 'post',
  path: '/designations',
  tags: TAG,
  summary: 'Create a Designation',
  description: "Requires the 'designation:create' permission.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createDesignationSchema } } } },
  responses: {
    201: jsonResponse('Designation created', z.object({ designation: DesignationSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'designation:create' permission"),
    409: errorResponse('A designation with this name or code already exists', {
      status: 'error',
      message: 'A designation with this name or code already exists',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/designations',
  tags: TAG,
  summary: 'List Designation records',
  description:
    "Requires the 'designation:read' permission (granted to every role - Designation is non-sensitive reference data). Paginated, searchable (name/code, case-insensitive), filterable by status, sortable.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listDesignationsQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ designations: z.array(DesignationSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'designation:read' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/designations/{id}',
  tags: TAG,
  summary: 'Get one Designation record',
  description: "Requires the 'designation:read' permission.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ designation: DesignationSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'designation:read' permission"),
    404: errorResponse('No Designation with this id', {
      status: 'error',
      message: 'Designation not found',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/designations/{id}',
  tags: TAG,
  summary: 'Update a Designation, including activating/deactivating it',
  description:
    "Requires the 'designation:update' permission. Deactivating a designation never modifies existing Employee.designationId references - it only blocks future assignment.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: updateDesignationSchema } } },
  },
  responses: {
    200: jsonResponse('Designation updated', z.object({ designation: DesignationSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'designation:update' permission"),
    404: errorResponse('No Designation with this id', {
      status: 'error',
      message: 'Designation not found',
    }),
    409: errorResponse('A designation with this name or code already exists', {
      status: 'error',
      message: 'A designation with this name or code already exists',
    }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/designations/{id}',
  tags: TAG,
  summary: 'Hard-delete a Designation',
  description:
    "Requires the 'designation:delete' permission. Only permitted when zero Employee records (including soft-deleted ones) reference this designation - deactivate it instead otherwise. Note: designationId is mandatory on Employee, so any live Employee always references some designation.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse(
      'Designation deleted',
      z.object({ message: z.string().meta({ example: 'Designation deleted successfully' }) }),
    ),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'designation:delete' permission"),
    404: errorResponse('No Designation with this id', {
      status: 'error',
      message: 'Designation not found',
    }),
    409: errorResponse(
      'This designation has Employee records referencing it and cannot be deleted',
      {
        status: 'error',
        message:
          'This designation has Employee records referencing it and cannot be deleted - deactivate it instead',
      },
    ),
  },
});
