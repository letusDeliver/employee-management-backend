import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import { BranchSchema, PaginationMetaSchema } from '../../docs/components/schemas.js';
import {
  createBranchSchema,
  updateBranchSchema,
  listBranchesQuerySchema,
} from './branch.validation.js';

const TAG = ['Branches'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
});

registry.registerPath({
  method: 'post',
  path: '/branches',
  tags: TAG,
  summary: 'Create a Branch',
  description: "Requires the 'branch:create' permission.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createBranchSchema } } } },
  responses: {
    201: jsonResponse('Branch created', z.object({ branch: BranchSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'branch:create' permission"),
    409: errorResponse('A branch with this name or code already exists', {
      status: 'error',
      message: 'A branch with this name or code already exists',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/branches',
  tags: TAG,
  summary: 'List Branch records',
  description:
    "Requires the 'branch:read' permission (granted to every role - Branch is non-sensitive reference data). Paginated, searchable (name/code), filterable by status, sortable. An unconditional secondary `id ASC` sort keeps ordering deterministic across pages.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listBranchesQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ branches: z.array(BranchSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'branch:read' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/branches/{id}',
  tags: TAG,
  summary: 'Get one Branch record',
  description: "Requires the 'branch:read' permission.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ branch: BranchSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'branch:read' permission"),
    404: errorResponse('No Branch with this id', {
      status: 'error',
      message: 'Branch not found',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/branches/{id}',
  tags: TAG,
  summary: 'Update a Branch, including activating/deactivating it',
  description:
    "Requires the 'branch:update' permission. Deactivating a branch (status: INACTIVE) never modifies existing Employee.branchId references - it only blocks future assignment (domain-branch.md's positive-allowlist rule).",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: updateBranchSchema } } },
  },
  responses: {
    200: jsonResponse('Branch updated', z.object({ branch: BranchSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'branch:update' permission"),
    404: errorResponse('No Branch with this id', {
      status: 'error',
      message: 'Branch not found',
    }),
    409: errorResponse('A branch with this name or code already exists', {
      status: 'error',
      message: 'A branch with this name or code already exists',
    }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/branches/{id}',
  tags: TAG,
  summary: 'Hard-delete a Branch',
  description:
    "Requires the 'branch:delete' permission. Only permitted when zero Employee records (including soft-deleted ones) reference this branch - deactivate it instead otherwise.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse(
      'Branch deleted',
      z.object({ message: z.string().meta({ example: 'Branch deleted successfully' }) }),
    ),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'branch:delete' permission"),
    404: errorResponse('No Branch with this id', {
      status: 'error',
      message: 'Branch not found',
    }),
    409: errorResponse('This branch has Employee records referencing it and cannot be deleted', {
      status: 'error',
      message:
        'This branch has Employee records referencing it and cannot be deleted - deactivate it instead',
    }),
  },
});
