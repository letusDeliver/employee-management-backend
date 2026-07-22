import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import { EmployeeDocumentSchema } from '../../docs/components/schemas.js';

const TAG = ['Employee Documents'];
const employeeIdParam = z.object({
  id: z.uuid().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
});
const documentIdParams = z.object({
  id: z.uuid().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
  documentId: z.uuid().meta({ example: 'f1e2d3c4-b5a6-4978-8f6e-5d4c3b2a1908' }),
});

registry.registerPath({
  method: 'post',
  path: '/employees/{id}/documents',
  tags: TAG,
  summary: "Upload a document to an Employee's record",
  description:
    'Requires the \'employee:update:any\' permission. multipart/form-data with a single "file" field (PDF/JPEG/PNG/WebP, max 10MB). Each upload gets a fresh, server-generated public_id (never derived from the original filename).',
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: employeeIdParam,
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z
              .string()
              .meta({ format: 'binary', description: 'PDF, JPEG, PNG, or WebP, max 10MB' }),
          }),
        },
      },
    },
  },
  responses: {
    201: jsonResponse('Document uploaded', z.object({ document: EmployeeDocumentSchema })),
    400: errorResponse('Missing file, disallowed MIME type, or file too large'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'employee:update:any' permission"),
    404: errorResponse('No Employee with this id', {
      status: 'error',
      message: 'Employee not found',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/employees/{id}/documents',
  tags: TAG,
  summary: "List an Employee's documents",
  description:
    "Requires 'employee:read:any' OR 'employee:read:own', same two-layer ownership check as GET /employees/{id}.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: employeeIdParam },
  responses: {
    200: jsonResponse('OK', z.object({ documents: z.array(EmployeeDocumentSchema) })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller has neither the :any nor a matching :own grant for this record'),
    404: errorResponse('No Employee with this id', {
      status: 'error',
      message: 'Employee not found',
    }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/employees/{id}/documents/{documentId}',
  tags: TAG,
  summary: 'Permanently remove a document',
  description:
    "Requires the 'employee:update:any' permission. Hard delete (no soft-delete column - the AuditLog trail already preserves history). The database row is removed first; the Cloudinary asset is cleaned up best-effort afterward using the resource_type recorded at upload time.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: documentIdParams },
  responses: {
    200: jsonResponse('Document deleted', z.object({ message: z.string() }), {
      message: 'Document deleted successfully',
    }),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'employee:update:any' permission"),
    404: errorResponse(
      "No Employee with this id ('Employee not found'), or the Employee exists but has no document with this documentId ('Document not found')",
      { status: 'error', message: 'Document not found' },
    ),
  },
});
