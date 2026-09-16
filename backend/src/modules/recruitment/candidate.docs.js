import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import {
  CandidateSchema,
  CandidateDocumentSchema,
  PaginationMetaSchema,
} from '../../docs/components/schemas.js';
import {
  createCandidateSchema,
  updateCandidateSchema,
  listCandidatesQuerySchema,
} from './candidate.validation.js';

const TAG = ['Recruitment - Candidates'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'd3e4f5a6-b7c8-4d9e-0f1a-2b3c4d5e6f7a' }),
});
const documentIdParams = idParam.extend({
  documentId: z.uuid().meta({ example: 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f' }),
});

registry.registerPath({
  method: 'post',
  path: '/candidates',
  tags: TAG,
  summary: 'Create a Candidate',
  description:
    "Requires the 'candidate:create' permission (ADMIN only). Not a User (ADR-RC02) - no system login prior to hire. No uniqueness constraint on email - the recruiter is responsible for not creating an accidental duplicate.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createCandidateSchema } } } },
  responses: {
    201: jsonResponse('Candidate created', z.object({ candidate: CandidateSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'candidate:create' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/candidates',
  tags: TAG,
  summary: 'List Candidates',
  description: "Requires the 'candidate:read' permission (ADMIN only). Paginated, searchable (name/email/phone), sortable.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listCandidatesQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ candidates: z.array(CandidateSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'candidate:read' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/candidates/{id}',
  tags: TAG,
  summary: 'Get one Candidate',
  description: "Requires the 'candidate:read' permission (ADMIN only).",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ candidate: CandidateSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'candidate:read' permission"),
    404: errorResponse('No candidate with this id', { status: 'error', message: 'Candidate not found' }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/candidates/{id}',
  tags: TAG,
  summary: 'Update a Candidate',
  description: "Requires the 'candidate:update' permission (ADMIN only).",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: updateCandidateSchema } } },
  },
  responses: {
    200: jsonResponse('Candidate updated', z.object({ candidate: CandidateSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'candidate:update' permission"),
    404: errorResponse('No candidate with this id', { status: 'error', message: 'Candidate not found' }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/candidates/{id}',
  tags: TAG,
  summary: 'Delete a Candidate',
  description:
    "Requires the 'candidate:delete' permission (ADMIN only). A real hard delete, unlike Employee's soft-delete - only allowed when zero Application records reference this candidate. Does not resolve ADR-RC04's PII-retention question for a candidate who did go through a pipeline; that remains genuinely deferred to legal/compliance input.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('Candidate deleted', z.object({ message: z.string() })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'candidate:delete' permission"),
    404: errorResponse('No candidate with this id', { status: 'error', message: 'Candidate not found' }),
    409: errorResponse('This candidate has Application records referencing it', {
      status: 'error',
      message: 'This candidate has Application records referencing it and cannot be deleted',
    }),
  },
});

registry.registerPath({
  method: 'post',
  path: '/candidates/{id}/documents',
  tags: TAG,
  summary: 'Upload a Candidate document (e.g. resume)',
  description:
    "Requires the 'candidate:update' permission (ADMIN only). multipart/form-data, field name 'file'. Mirrors EmployeeDocument's exact upload mechanism (Cloudinary), PDF/JPEG/PNG/WebP up to 10MB.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'multipart/form-data': { schema: z.object({ file: z.string().meta({ format: 'binary' }) }) } } },
  },
  responses: {
    201: jsonResponse('Document uploaded', z.object({ document: CandidateDocumentSchema })),
    400: errorResponse('No file provided, or the file failed type/size validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'candidate:update' permission"),
    404: errorResponse('No candidate with this id', { status: 'error', message: 'Candidate not found' }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/candidates/{id}/documents',
  tags: TAG,
  summary: 'List a Candidate’s documents',
  description: "Requires the 'candidate:read' permission (ADMIN only).",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ documents: z.array(CandidateDocumentSchema) })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'candidate:read' permission"),
    404: errorResponse('No candidate with this id', { status: 'error', message: 'Candidate not found' }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/candidates/{id}/documents/{documentId}',
  tags: TAG,
  summary: 'Delete a Candidate document',
  description: "Requires the 'candidate:update' permission (ADMIN only). Deletes the Cloudinary asset after the database row commits.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: documentIdParams },
  responses: {
    200: jsonResponse('Document deleted', z.object({ message: z.string() })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'candidate:update' permission"),
    404: errorResponse('No candidate or document with this id', {
      status: 'error',
      message: 'Document not found',
    }),
  },
});
