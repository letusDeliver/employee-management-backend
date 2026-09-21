import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import { AssetAssignmentSchema, PaginationMetaSchema } from '../../docs/components/schemas.js';
import { listAssetAssignmentsQuerySchema } from './assetAssignment.validation.js';

const TAG = ['Asset Assignments'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'f2a3b4c5-d6e7-4f8a-9b0c-1d2e3f4a5b6c' }),
});

registry.registerPath({
  method: 'get',
  path: '/asset-assignments',
  tags: TAG,
  summary: 'List Asset Assignments',
  description:
    "Requires 'assetAssignment:read:any' (ADMIN, all employees) or 'assetAssignment:read:own'. A caller with only :read:own is automatically scoped to their own employee record. Filter by employeeId/assetId, and active=true for currently-held assets only - the way to list everything an employee holds.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listAssetAssignmentsQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ assignments: z.array(AssetAssignmentSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller lacks both asset assignment read permissions'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/asset-assignments/{id}',
  tags: TAG,
  summary: 'Get one Asset Assignment',
  description:
    "Requires 'assetAssignment:read:any', or 'assetAssignment:read:own' and the assignment must belong to the caller's own employee record.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ assignment: AssetAssignmentSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Not permitted to view this assignment'),
    404: errorResponse('No assignment with this id', {
      status: 'error',
      message: 'Asset assignment not found',
    }),
  },
});
