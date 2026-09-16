import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import {
  ApplicationSchema,
  InterviewSchema,
  OfferSchema,
  EmployeeSchema,
  PaginationMetaSchema,
} from '../../docs/components/schemas.js';
import {
  createApplicationSchema,
  updateApplicationStatusSchema,
  listApplicationsQuerySchema,
  createInterviewSchema,
  updateInterviewSchema,
  createOfferSchema,
  hireApplicationSchema,
} from './application.validation.js';

const TAG = ['Recruitment - Applications'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'f5a6b7c8-d9e0-4f1a-2b3c-4d5e6f7a8b9c' }),
});
const interviewIdParams = idParam.extend({
  interviewId: z.uuid().meta({ example: 'e4f5a6b7-c8d9-4e0f-1a2b-3c4d5e6f7a8b' }),
});
const offerIdParams = idParam.extend({
  offerId: z.uuid().meta({ example: 'a6b7c8d9-e0f1-4a2b-3c4d-5e6f7a8b9c0d' }),
});

registry.registerPath({
  method: 'post',
  path: '/applications',
  tags: TAG,
  summary: 'Create an Application',
  description:
    "Requires the 'application:create' permission (ADMIN only). Links a Candidate to a JobRequisition (§3) - starts at APPLIED. Rejected (400) if the requisition is not OPEN or ON_HOLD.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createApplicationSchema } } } },
  responses: {
    201: jsonResponse('Application created (APPLIED)', z.object({ application: ApplicationSchema })),
    400: errorResponse('Validation failed, candidateId/jobRequisitionId references a record that does not exist, or the requisition is not accepting applications'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'application:create' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/applications',
  tags: TAG,
  summary: 'List Applications',
  description: "Requires the 'application:read' permission (ADMIN only). Paginated, filterable (candidateId/jobRequisitionId/status), sortable.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listApplicationsQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ applications: z.array(ApplicationSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'application:read' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/applications/{id}',
  tags: TAG,
  summary: 'Get one Application',
  description: "Requires the 'application:read' permission (ADMIN only). Includes its Candidate, JobRequisition, Interviews, and Offers.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ application: ApplicationSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'application:read' permission"),
    404: errorResponse('No application with this id', { status: 'error', message: 'Application not found' }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/applications/{id}/status',
  tags: TAG,
  summary: 'Transition an Application’s status',
  description:
    "Requires the 'application:update' permission (ADMIN only). APPLIED->SCREENING->INTERVIEW->OFFER is strictly sequential, no skipping. REJECTED/WITHDRAWN are reachable from any non-terminal stage. HIRED is deliberately excluded - only reachable via POST /applications/:id/hire.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: updateApplicationStatusSchema } } },
  },
  responses: {
    200: jsonResponse('Status updated', z.object({ application: ApplicationSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'application:update' permission"),
    404: errorResponse('No application with this id', { status: 'error', message: 'Application not found' }),
    409: errorResponse('The requested transition is not allowed from the current status'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/applications/{id}/hire',
  tags: TAG,
  summary: 'Hire an Application (the Hire Orchestration Service boundary)',
  description:
    "Requires the 'application:hire' permission (ADMIN only) - a distinct, more sensitive permission than 'application:update', since this creates a real Employee (and optionally a User) record. Requires the application to be in the OFFER stage with an ACCEPTED offer, and the JobRequisition to still be OPEN with remaining openings (checked and decremented atomically). Invokes employeeOnboarding.service.js's onboardEmployee - Identity's own, unmodified onboarding process (docs/domain-identity-employee-lifecycle.md §2) - exactly as if an administrator had entered the same data directly (ADR-RC03). provisionAccess defaults to false (no System access, matching Identity's ADR-005); when true and no existing User matches the candidate's email, initialPassword is required (no invite-email mechanism exists project-wide). dateOfJoining is derived from the accepted Offer's own startDate, not re-supplied.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: hireApplicationSchema } } },
  },
  responses: {
    200: jsonResponse(
      'Hired - Application is now HIRED, Employee (and optionally User) created',
      z.object({ application: ApplicationSchema, employee: EmployeeSchema, userId: z.uuid().nullable() }),
    ),
    400: errorResponse('Validation failed, application not in the Offer stage, no Accepted offer exists, or initialPassword missing for a new hire'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'application:hire' permission"),
    404: errorResponse('No application with this id', { status: 'error', message: 'Application not found' }),
    409: errorResponse('The job requisition is no longer OPEN or has no remaining openings, or the candidate’s email already has a live Employee record (rehire without an available slot)'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/applications/{id}/interviews',
  tags: TAG,
  summary: 'Schedule an Interview',
  description:
    "Requires the 'application:update' permission (ADMIN only). Kept minimal (§4) - scheduled time and interviewer only; feedback/recommendation are added later via PATCH. An Application may have multiple Interview rows (one per round).",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: createInterviewSchema } } },
  },
  responses: {
    201: jsonResponse('Interview scheduled', z.object({ interview: InterviewSchema })),
    400: errorResponse('Validation failed, or interviewerId references a record that does not exist'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'application:update' permission"),
    404: errorResponse('No application with this id', { status: 'error', message: 'Application not found' }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/applications/{id}/interviews',
  tags: TAG,
  summary: 'List an Application’s Interviews',
  description: "Requires the 'application:read' permission (ADMIN only).",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ interviews: z.array(InterviewSchema) })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'application:read' permission"),
    404: errorResponse('No application with this id', { status: 'error', message: 'Application not found' }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/applications/{id}/interviews/{interviewId}',
  tags: TAG,
  summary: 'Update an Interview (feedback/recommendation, or reschedule)',
  description: "Requires the 'application:update' permission (ADMIN only).",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: interviewIdParams,
    body: { content: { 'application/json': { schema: updateInterviewSchema } } },
  },
  responses: {
    200: jsonResponse('Interview updated', z.object({ interview: InterviewSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'application:update' permission"),
    404: errorResponse('No interview with this id under this application', {
      status: 'error',
      message: 'Interview not found',
    }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/applications/{id}/interviews/{interviewId}',
  tags: TAG,
  summary: 'Delete an Interview',
  description: "Requires the 'application:update' permission (ADMIN only). No downstream references - a lightweight informational record.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: interviewIdParams },
  responses: {
    200: jsonResponse('Interview deleted', z.object({ message: z.string() })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'application:update' permission"),
    404: errorResponse('No interview with this id under this application', {
      status: 'error',
      message: 'Interview not found',
    }),
  },
});

registry.registerPath({
  method: 'post',
  path: '/applications/{id}/offers',
  tags: TAG,
  summary: 'Create an Offer',
  description:
    "Requires the 'application:update' permission (ADMIN only). Only allowed while the Application is in the OFFER stage (§4). Only one PENDING offer may exist per Application at a time - enforced by a partial unique index; a second attempt while one is still PENDING returns 409.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: createOfferSchema } } },
  },
  responses: {
    201: jsonResponse('Offer created (PENDING)', z.object({ offer: OfferSchema })),
    400: errorResponse('Validation failed, or the application is not in the Offer stage'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'application:update' permission"),
    404: errorResponse('No application with this id', { status: 'error', message: 'Application not found' }),
    409: errorResponse('This application already has a Pending offer', {
      status: 'error',
      message:
        'This application already has a Pending offer - decline, expire, or accept it before creating a new one',
    }),
  },
});

const offerTransition = (action, verb) =>
  registry.registerPath({
    method: 'patch',
    path: `/applications/{id}/offers/{offerId}/${action}`,
    tags: TAG,
    summary: `${verb} an Offer`,
    description: `Requires the 'application:update' permission (ADMIN only). Only a PENDING offer can be ${action}d.`,
    security: [{ [bearerAuth.name]: [] }],
    request: { params: offerIdParams },
    responses: {
      200: jsonResponse(`Offer ${action}d`, z.object({ offer: OfferSchema })),
      401: errorResponse('Missing, invalid, or expired access token'),
      403: errorResponse("Caller lacks the 'application:update' permission"),
      404: errorResponse('No offer with this id', { status: 'error', message: 'Offer not found' }),
      409: errorResponse(`Cannot ${action} an offer that is not currently Pending`),
    },
  });

offerTransition('accept', 'Accept');
offerTransition('decline', 'Decline');
offerTransition('expire', 'Expire');
