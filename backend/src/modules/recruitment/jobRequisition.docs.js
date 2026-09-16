import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import { JobRequisitionSchema, PaginationMetaSchema } from '../../docs/components/schemas.js';
import {
  createJobRequisitionSchema,
  updateJobRequisitionStatusSchema,
  listJobRequisitionsQuerySchema,
} from './jobRequisition.validation.js';

const TAG = ['Recruitment - Job Requisitions'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e' }),
});

registry.registerPath({
  method: 'post',
  path: '/job-requisitions',
  tags: TAG,
  summary: 'Create a Job Requisition',
  description:
    "Requires the 'jobRequisition:create' permission (ADMIN only). Mirrors the same four axes an Employee ultimately carries - departmentId/designationId mandatory, branchId optional. remainingOpenings starts equal to numberOfOpenings.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createJobRequisitionSchema } } } },
  responses: {
    201: jsonResponse('Requisition created (OPEN)', z.object({ jobRequisition: JobRequisitionSchema })),
    400: errorResponse('Validation failed, or departmentId/designationId/branchId references an inactive or nonexistent record'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'jobRequisition:create' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/job-requisitions',
  tags: TAG,
  summary: 'List Job Requisitions',
  description: "Requires the 'jobRequisition:read' permission (ADMIN only). Paginated, filterable, sortable.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listJobRequisitionsQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ jobRequisitions: z.array(JobRequisitionSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'jobRequisition:read' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/job-requisitions/{id}',
  tags: TAG,
  summary: 'Get one Job Requisition',
  description: "Requires the 'jobRequisition:read' permission (ADMIN only).",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ jobRequisition: JobRequisitionSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'jobRequisition:read' permission"),
    404: errorResponse('No job requisition with this id', {
      status: 'error',
      message: 'Job requisition not found',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/job-requisitions/{id}/status',
  tags: TAG,
  summary: 'Transition a Job Requisition’s status',
  description:
    "Requires the 'jobRequisition:update' permission (ADMIN only). OPEN <-> ON_HOLD, and either can be manually CANCELLED. CLOSED is rejected here (400) - it is set automatically only when openings are exhausted at hire time.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: updateJobRequisitionStatusSchema } } },
  },
  responses: {
    200: jsonResponse('Status updated', z.object({ jobRequisition: JobRequisitionSchema })),
    400: errorResponse('Validation failed, or status: CLOSED was requested directly'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'jobRequisition:update' permission"),
    404: errorResponse('No job requisition with this id', {
      status: 'error',
      message: 'Job requisition not found',
    }),
    409: errorResponse('The requested transition is not allowed from the current status'),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/job-requisitions/{id}',
  tags: TAG,
  summary: 'Delete a Job Requisition',
  description:
    "Requires the 'jobRequisition:delete' permission (ADMIN only). Hard-delete only when zero Application records reference it - cancel it instead if applications exist.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('Job requisition deleted', z.object({ message: z.string() })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'jobRequisition:delete' permission"),
    404: errorResponse('No job requisition with this id', {
      status: 'error',
      message: 'Job requisition not found',
    }),
    409: errorResponse('This job requisition has Application records referencing it', {
      status: 'error',
      message:
        'This job requisition has Application records referencing it and cannot be deleted - cancel it instead',
    }),
  },
});
