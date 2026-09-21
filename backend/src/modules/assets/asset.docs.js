import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import {
  AssetSchema,
  AssetAssignmentSchema,
  PaginationMetaSchema,
} from '../../docs/components/schemas.js';
import { createAssetSchema, updateAssetSchema, listAssetsQuerySchema } from './asset.validation.js';
import { assignAssetSchema, returnAssetSchema } from './assetAssignment.validation.js';

const TAG = ['Assets'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b' }),
});
const notFound = errorResponse('No asset with this id', {
  status: 'error',
  message: 'Asset not found',
});
const unauthorized = errorResponse('Missing, invalid, or expired access token');

registry.registerPath({
  method: 'post',
  path: '/assets',
  tags: TAG,
  summary: 'Register an Asset',
  description: "Requires the 'asset:create' permission (ADMIN only). Created AVAILABLE.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createAssetSchema } } } },
  responses: {
    201: jsonResponse('Asset created (AVAILABLE)', z.object({ asset: AssetSchema })),
    400: errorResponse('Validation failed'),
    401: unauthorized,
    403: errorResponse("Caller lacks the 'asset:create' permission"),
    409: errorResponse('An asset with this tag already exists', {
      status: 'error',
      message: 'An asset with this tag already exists',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/assets',
  tags: TAG,
  summary: 'List Assets',
  description:
    "Requires the 'asset:read' permission (ADMIN only). Paginated, searchable (tag/type/description), filterable (type/status), sortable.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listAssetsQuerySchema },
  responses: {
    200: jsonResponse('OK', z.object({ assets: z.array(AssetSchema), pagination: PaginationMetaSchema })),
    400: errorResponse('A query parameter failed validation'),
    401: unauthorized,
    403: errorResponse("Caller lacks the 'asset:read' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/assets/{id}',
  tags: TAG,
  summary: 'Get one Asset',
  description: "Requires the 'asset:read' permission (ADMIN only).",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ asset: AssetSchema })),
    401: unauthorized,
    403: errorResponse("Caller lacks the 'asset:read' permission"),
    404: notFound,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/assets/{id}',
  tags: TAG,
  summary: 'Update an Asset',
  description:
    "Requires the 'asset:update' permission (ADMIN only). Direct status changes are limited to AVAILABLE <-> UNDER_REPAIR and either -> RETIRED (terminal); ASSIGNED is entered only by assigning and left only by returning.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: updateAssetSchema } } },
  },
  responses: {
    200: jsonResponse('Asset updated', z.object({ asset: AssetSchema })),
    400: errorResponse('Validation failed'),
    401: unauthorized,
    403: errorResponse("Caller lacks the 'asset:update' permission"),
    404: notFound,
    409: errorResponse('Duplicate tag, or an invalid status change', {
      status: 'error',
      message: 'This asset is currently assigned - record its return before changing its status',
    }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/assets/{id}',
  tags: TAG,
  summary: 'Delete an Asset',
  description:
    "Requires the 'asset:delete' permission (ADMIN only). Hard-delete only an asset that was never assigned; one with any assignment history must be retired instead.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('Asset deleted', z.object({ message: z.string() })),
    401: unauthorized,
    403: errorResponse("Caller lacks the 'asset:delete' permission"),
    404: notFound,
    409: errorResponse('The asset has assignment history', {
      status: 'error',
      message: 'This asset has assignment history and cannot be deleted - retire it instead',
    }),
  },
});

registry.registerPath({
  method: 'post',
  path: '/assets/{id}/assign',
  tags: TAG,
  summary: 'Assign an Asset to an Employee',
  description:
    "Requires the 'assetAssignment:create' permission (ADMIN only). Only an AVAILABLE asset can be assigned; it becomes ASSIGNED. assignedAt defaults to now and may be back-dated, never future.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: assignAssetSchema } } },
  },
  responses: {
    201: jsonResponse('Assignment recorded', z.object({ assignment: AssetAssignmentSchema })),
    400: errorResponse('Validation failed, the asset is not AVAILABLE, or the employee does not exist'),
    401: unauthorized,
    403: errorResponse("Caller lacks the 'assetAssignment:create' permission"),
    404: notFound,
    409: errorResponse('The asset already has an active assignment', {
      status: 'error',
      message: 'This asset already has an active assignment',
    }),
  },
});

registry.registerPath({
  method: 'post',
  path: '/assets/{id}/return',
  tags: TAG,
  summary: 'Record the return of an Asset',
  description:
    "Requires the 'assetAssignment:return' permission (ADMIN only). Closes the active assignment. condition GOOD returns the asset to AVAILABLE; DAMAGED moves it to UNDER_REPAIR.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: returnAssetSchema } } },
  },
  responses: {
    200: jsonResponse('Return recorded', z.object({ assignment: AssetAssignmentSchema })),
    400: errorResponse('Validation failed'),
    401: unauthorized,
    403: errorResponse("Caller lacks the 'assetAssignment:return' permission"),
    404: notFound,
    409: errorResponse('The asset is not currently assigned', {
      status: 'error',
      message: 'This asset is not currently assigned',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/assets/{id}/current-holder',
  tags: TAG,
  summary: 'Get the current holder of an Asset',
  description:
    "Requires the 'assetAssignment:read:any' permission (ADMIN only). assignment is null when the asset is not currently assigned.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ assignment: AssetAssignmentSchema.nullable() })),
    401: unauthorized,
    403: errorResponse("Caller lacks the 'assetAssignment:read:any' permission"),
    404: notFound,
  },
});

registry.registerPath({
  method: 'get',
  path: '/assets/{id}/assignments',
  tags: TAG,
  summary: 'Get the full custody history of an Asset',
  description:
    "Requires the 'assetAssignment:read:any' permission (ADMIN only). Every assignment, newest first, including the current one.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ assignments: z.array(AssetAssignmentSchema) })),
    401: unauthorized,
    403: errorResponse("Caller lacks the 'assetAssignment:read:any' permission"),
    404: notFound,
  },
});
