import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import {
  PerformanceReviewSchema,
  ReviewAddendumSchema,
  PaginationMetaSchema,
} from '../../docs/components/schemas.js';
import {
  createPerformanceReviewSchema,
  updatePerformanceReviewSchema,
  selfAssessmentSchema,
  addAddendumSchema,
  listPerformanceReviewsQuerySchema,
} from './performance.validation.js';

const TAG = ['Performance Reviews'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'a7b8c9d0-e1f2-4a3b-4c5d-6f7a8b9c0d1e' }),
});

registry.registerPath({
  method: 'post',
  path: '/performance-reviews',
  tags: TAG,
  summary: 'Author a Draft Performance Review',
  description:
    "Requires 'performanceReview:create:reports' (MANAGER, only for their own direct reports) or 'performanceReview:create:any' (ADMIN, any employee - required when the target employee has no manager, in which case reviewerId must be supplied explicitly). The target ReviewCycle must be OPEN.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createPerformanceReviewSchema } } } },
  responses: {
    201: jsonResponse('Performance review created (DRAFT)', z.object({ review: PerformanceReviewSchema })),
    400: errorResponse('Validation failed, employeeId/reviewCycleId invalid, cycle not OPEN, or no manager and no explicit reviewerId'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller cannot author a review for this employee'),
    409: errorResponse('A performance review already exists for this employee and cycle', {
      status: 'error',
      message: 'A performance review already exists for this employee and cycle',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/performance-reviews',
  tags: TAG,
  summary: 'List Performance Reviews',
  description:
    "Requires 'performanceReview:read:any', 'performanceReview:read:own', or 'performanceReview:manage:reports'. A caller without ':any' is auto-scoped to their own reviews (':read:own') and/or their reports' reviews (':manage:reports') - whichever they hold, combined. Paginated, filterable (employeeId/reviewCycleId/status - employeeId only meaningfully honored for ':any' callers), sortable.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listPerformanceReviewsQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ reviews: z.array(PerformanceReviewSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller lacks every performance-review read/manage permission'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/performance-reviews/{id}',
  tags: TAG,
  summary: 'Get one Performance Review',
  description:
    'Requires any performance-review read/manage permission, subject to an ownership check for non-":any" callers (the reviewed employee, or the review\'s own reviewer). Includes the full addenda breakdown.',
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ review: PerformanceReviewSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller lacks permission to view this review'),
    404: errorResponse('No Performance Review with this id', {
      status: 'error',
      message: 'Performance review not found',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/performance-reviews/{id}',
  tags: TAG,
  summary: 'Edit a Draft Performance Review',
  description:
    "Requires 'performanceReview:manage:reports' (the review's own reviewer) or 'performanceReview:manage:any' (ADMIN). Only permitted while the review is DRAFT - once Submitted, further correction goes through addenda instead.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: updatePerformanceReviewSchema } } },
  },
  responses: {
    200: jsonResponse('Performance review updated', z.object({ review: PerformanceReviewSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller cannot manage this review'),
    404: errorResponse('No Performance Review with this id', {
      status: 'error',
      message: 'Performance review not found',
    }),
    409: errorResponse('Review is not Draft', {
      status: 'error',
      message: 'Only a Draft performance review can be edited',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/performance-reviews/{id}/submit',
  tags: TAG,
  summary: 'Submit a Draft Performance Review',
  description:
    'Requires the same manage permission as PATCH. Moves DRAFT -> SUBMITTED, requires both rating and managerComments to already be set, and snapshots the org-context (department/designation/branch names) at this moment (ADR-PF03).',
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('Review moved to SUBMITTED', z.object({ review: PerformanceReviewSchema })),
    400: errorResponse('rating or managerComments not yet set', {
      status: 'error',
      message: 'Both rating and managerComments must be set before a review can be submitted',
    }),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller cannot manage this review'),
    404: errorResponse('No Performance Review with this id', {
      status: 'error',
      message: 'Performance review not found',
    }),
    409: errorResponse('Review is not Draft', {
      status: 'error',
      message: 'Only a Draft performance review can be submitted',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/performance-reviews/{id}/acknowledge',
  tags: TAG,
  summary: 'Acknowledge a Submitted Performance Review',
  description:
    "Requires 'performanceReview:acknowledge:own' - the reviewed employee's own action; no ADMIN/manager override exists. Moves SUBMITTED -> ACKNOWLEDGED, after which the review's rating/comments are frozen (addenda are the only way to add further commentary).",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('Review moved to ACKNOWLEDGED', z.object({ review: PerformanceReviewSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller is not the reviewed employee'),
    404: errorResponse('No Performance Review with this id', {
      status: 'error',
      message: 'Performance review not found',
    }),
    409: errorResponse('Review is not Submitted', {
      status: 'error',
      message: 'Only a Submitted performance review can be acknowledged',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/performance-reviews/{id}/self-assessment',
  tags: TAG,
  summary: "Set the reviewed employee's self-assessment",
  description:
    "Requires 'performanceReview:selfAssess:own' - the reviewed employee's own action. Settable any time before acknowledgement (DRAFT or SUBMITTED), not gated behind the manager's own submission.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: selfAssessmentSchema } } },
  },
  responses: {
    200: jsonResponse('Self-assessment set', z.object({ review: PerformanceReviewSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller is not the reviewed employee'),
    404: errorResponse('No Performance Review with this id', {
      status: 'error',
      message: 'Performance review not found',
    }),
    409: errorResponse('Review is already Acknowledged', {
      status: 'error',
      message: 'Cannot add a self-assessment to an already-acknowledged review',
    }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/performance-reviews/{id}',
  tags: TAG,
  summary: 'Delete a Draft Performance Review',
  description:
    "Requires 'performanceReview:manage:reports' or ':manage:any'. Only permitted while DRAFT - mirrors PayrollRun's DRAFT-only-delete convenience.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('Performance review deleted', z.object({ message: z.string() })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller cannot manage this review'),
    404: errorResponse('No Performance Review with this id', {
      status: 'error',
      message: 'Performance review not found',
    }),
    409: errorResponse('Review is not Draft', {
      status: 'error',
      message: 'Only a Draft performance review can be deleted',
    }),
  },
});

registry.registerPath({
  method: 'post',
  path: '/performance-reviews/{id}/addenda',
  tags: TAG,
  summary: 'Add an addendum comment to a Performance Review',
  description:
    'No dedicated permission - gated by whichever read/manage permission already grants access to this specific review (the reviewer, ADMIN, or the reviewed employee themselves). Append-only, at any review status; the mechanism for adding commentary without editing frozen (Acknowledged) content.',
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: addAddendumSchema } } },
  },
  responses: {
    201: jsonResponse('Addendum added', z.object({ addendum: ReviewAddendumSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller has no access to this review'),
    404: errorResponse('No Performance Review with this id', {
      status: 'error',
      message: 'Performance review not found',
    }),
  },
});
