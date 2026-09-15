import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import { ReviewCycleSchema, PaginationMetaSchema } from '../../docs/components/schemas.js';
import {
  createReviewCycleSchema,
  updateReviewCycleSchema,
  listReviewCyclesQuerySchema,
} from './reviewCycle.validation.js';

const TAG = ['Review Cycles'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6f7a8b9c' }),
});

registry.registerPath({
  method: 'post',
  path: '/review-cycles',
  tags: TAG,
  summary: 'Create a Review Cycle',
  description:
    "Requires the 'reviewCycle:create' permission (ADMIN only). A named, dated window (e.g. \"H1 2026 Review\") that PerformanceReviews are created against.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createReviewCycleSchema } } } },
  responses: {
    201: jsonResponse('Review cycle created (OPEN)', z.object({ cycle: ReviewCycleSchema })),
    400: errorResponse('Validation failed, or startDate is after endDate'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'reviewCycle:create' permission"),
    409: errorResponse('A review cycle with this name already exists', {
      status: 'error',
      message: 'A review cycle with this name already exists',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/review-cycles',
  tags: TAG,
  summary: 'List Review Cycles',
  description: "Requires the 'reviewCycle:read' permission (every role). Paginated, searchable (name), filterable (status), sortable.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listReviewCyclesQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ cycles: z.array(ReviewCycleSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'reviewCycle:read' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/review-cycles/{id}',
  tags: TAG,
  summary: 'Get one Review Cycle',
  description: "Requires the 'reviewCycle:read' permission (every role).",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ cycle: ReviewCycleSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'reviewCycle:read' permission"),
    404: errorResponse('No Review Cycle with this id', {
      status: 'error',
      message: 'Review cycle not found',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/review-cycles/{id}',
  tags: TAG,
  summary: 'Update a Review Cycle',
  description:
    "Requires the 'reviewCycle:update' permission (ADMIN only). Includes opening/closing it - a CLOSED cycle blocks new PerformanceReview creation but does not affect reviews already created against it.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: updateReviewCycleSchema } } },
  },
  responses: {
    200: jsonResponse('Review cycle updated', z.object({ cycle: ReviewCycleSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'reviewCycle:update' permission"),
    404: errorResponse('No Review Cycle with this id', {
      status: 'error',
      message: 'Review cycle not found',
    }),
    409: errorResponse('A review cycle with this name already exists', {
      status: 'error',
      message: 'A review cycle with this name already exists',
    }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/review-cycles/{id}',
  tags: TAG,
  summary: 'Delete a Review Cycle',
  description:
    "Requires the 'reviewCycle:delete' permission (ADMIN only). Hard-delete only when zero PerformanceReview records reference it (§4's mandatory invariant) - close it instead if reviews exist.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('Review cycle deleted', z.object({ message: z.string() })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'reviewCycle:delete' permission"),
    404: errorResponse('No Review Cycle with this id', {
      status: 'error',
      message: 'Review cycle not found',
    }),
    409: errorResponse('This review cycle has PerformanceReview records referencing it', {
      status: 'error',
      message:
        'This review cycle has PerformanceReview records referencing it and cannot be deleted - close it instead',
    }),
  },
});
