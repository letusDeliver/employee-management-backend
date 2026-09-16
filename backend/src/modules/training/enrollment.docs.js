import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import {
  EnrollmentSchema,
  EnrollmentDocumentSchema,
  TrainingComplianceStatusSchema,
  PaginationMetaSchema,
} from '../../docs/components/schemas.js';
import {
  createEnrollmentSchema,
  updateEnrollmentStatusSchema,
  listEnrollmentsQuerySchema,
  trainingComplianceQuerySchema,
} from './enrollment.validation.js';

const TAG = ['Training - Enrollments'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'd9e0f1a2-b3c4-4d5e-6f7a-8b9c0d1e2f3a' }),
});
const documentIdParams = idParam.extend({
  documentId: z.uuid().meta({ example: 'c8d9e0f1-a2b3-4c4d-5e6f-7a8b9c0d1e2f' }),
});

registry.registerPath({
  method: 'post',
  path: '/enrollments',
  tags: TAG,
  summary: 'Create an Enrollment',
  description:
    "Requires 'enrollment:create:own' (self-enroll, non-mandatory programs only) or 'enrollment:create:any' (ADMIN/HR, any program, employeeId required in the body). Repeatable per §2 - no uniqueness constraint on (employeeId, trainingProgramId).",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createEnrollmentSchema } } } },
  responses: {
    201: jsonResponse('Enrollment created (ENROLLED)', z.object({ enrollment: EnrollmentSchema })),
    400: errorResponse('Validation failed, employeeId missing for an :any caller, trainingProgramId inactive/nonexistent, or self-enrollment attempted against a mandatory program'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks both 'enrollment:create:own' and 'enrollment:create:any'"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/enrollments',
  tags: TAG,
  summary: 'List Enrollments',
  description: "Requires 'enrollment:read:own' or 'enrollment:read:any'. Auto-scoped to the caller's own employeeId without :any, the same pattern GET /leave-requests established.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listEnrollmentsQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ enrollments: z.array(EnrollmentSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks both 'enrollment:read:own' and 'enrollment:read:any'"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/enrollments/{id}',
  tags: TAG,
  summary: 'Get one Enrollment',
  description: "Requires 'enrollment:read:own' (own record only) or 'enrollment:read:any'.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ enrollment: EnrollmentSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller lacks visibility into this enrollment'),
    404: errorResponse('No enrollment with this id', { status: 'error', message: 'Enrollment not found' }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/enrollments/{id}/status',
  tags: TAG,
  summary: 'Transition an Enrollment’s status',
  description:
    "ENROLLED->IN_PROGRESS->COMPLETED|FAILED is strictly sequential; WITHDRAWN is reachable from either non-terminal stage. IN_PROGRESS/COMPLETED/FAILED require 'enrollment:manage:any' (self-attested completion would undermine compliance tracking). WITHDRAWN also accepts 'enrollment:withdraw:own' for the enrollment's own employee. score is optional and settable alongside any target status.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: updateEnrollmentStatusSchema } } },
  },
  responses: {
    200: jsonResponse('Status updated', z.object({ enrollment: EnrollmentSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller lacks permission for this transition (e.g. an employee attempting IN_PROGRESS/COMPLETED/FAILED on their own enrollment)'),
    404: errorResponse('No enrollment with this id', { status: 'error', message: 'Enrollment not found' }),
    409: errorResponse('The requested transition is not allowed from the current status'),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/enrollments/{id}',
  tags: TAG,
  summary: 'Delete an Enrollment',
  description:
    "Requires 'enrollment:manage:any'. Unrestricted by status, mirroring Attendance's own delete - Enrollment is compliance data that sometimes needs outright correction, not just a workflow-transition-only model.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('Enrollment deleted', z.object({ message: z.string() })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'enrollment:manage:any' permission"),
    404: errorResponse('No enrollment with this id', { status: 'error', message: 'Enrollment not found' }),
  },
});

registry.registerPath({
  method: 'post',
  path: '/enrollments/{id}/documents',
  tags: TAG,
  summary: 'Upload an Enrollment document (e.g. certificate)',
  description:
    "Requires enrollment:read:own/:any/manage:any (visibility implies attachment rights on your own enrollment). multipart/form-data, field name 'file'. Mirrors Employee/Candidate document uploads exactly (Cloudinary), PDF/JPEG/PNG/WebP up to 10MB.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'multipart/form-data': { schema: z.object({ file: z.string().meta({ format: 'binary' }) }) } } },
  },
  responses: {
    201: jsonResponse('Document uploaded', z.object({ document: EnrollmentDocumentSchema })),
    400: errorResponse('No file provided, or the file failed type/size validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller lacks visibility into this enrollment'),
    404: errorResponse('No enrollment with this id', { status: 'error', message: 'Enrollment not found' }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/enrollments/{id}/documents',
  tags: TAG,
  summary: 'List an Enrollment’s documents',
  description: 'Requires enrollment:read:own/:any/manage:any.',
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ documents: z.array(EnrollmentDocumentSchema) })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller lacks visibility into this enrollment'),
    404: errorResponse('No enrollment with this id', { status: 'error', message: 'Enrollment not found' }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/enrollments/{id}/documents/{documentId}',
  tags: TAG,
  summary: 'Delete an Enrollment document',
  description: 'Requires enrollment:read:own/:any/manage:any. Deletes the Cloudinary asset after the database row commits.',
  security: [{ [bearerAuth.name]: [] }],
  request: { params: documentIdParams },
  responses: {
    200: jsonResponse('Document deleted', z.object({ message: z.string() })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller lacks visibility into this enrollment'),
    404: errorResponse('No enrollment or document with this id', {
      status: 'error',
      message: 'Document not found',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/training-compliance',
  tags: TAG,
  summary: 'Get computed Training Compliance status',
  description:
    "Requires 'enrollment:read:own' (own employeeId only) or 'enrollment:read:any'. Computed on read (ADR-TR02), never stored - finds the most recent COMPLETED enrollment for the pair and checks it against renewalPeriodDays. Pass trainingProgramId for a single-program result; omit it for a bulk report across every mandatory, ACTIVE program.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: trainingComplianceQuerySchema },
  responses: {
    200: jsonResponse(
      'OK - shape depends on whether trainingProgramId was passed',
      z.object({
        compliance: z.union([TrainingComplianceStatusSchema, z.array(TrainingComplianceStatusSchema)]),
      }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller lacks visibility into this employeeId'),
  },
});
