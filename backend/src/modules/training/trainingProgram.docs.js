import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import { TrainingProgramSchema, PaginationMetaSchema } from '../../docs/components/schemas.js';
import {
  createTrainingProgramSchema,
  updateTrainingProgramSchema,
  listTrainingProgramsQuerySchema,
} from './trainingProgram.validation.js';

const TAG = ['Training Programs'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'b7c8d9e0-f1a2-4b3c-4d5e-6f7a8b9c0d1e' }),
});

registry.registerPath({
  method: 'post',
  path: '/training-programs',
  tags: TAG,
  summary: 'Create a Training Program',
  description:
    "Requires the 'trainingProgram:create' permission (ADMIN only). mandatory (default false) governs whether self-enrollment is allowed; renewalPeriodDays is only meaningful for compliance courses.",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createTrainingProgramSchema } } } },
  responses: {
    201: jsonResponse('Training program created (ACTIVE)', z.object({ trainingProgram: TrainingProgramSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'trainingProgram:create' permission"),
    409: errorResponse('A training program with this name already exists', {
      status: 'error',
      message: 'A training program with this name already exists',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/training-programs',
  tags: TAG,
  summary: 'List Training Programs',
  description: "Requires the 'trainingProgram:read' permission (every role). Paginated, searchable (name), filterable (mandatory/status), sortable.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listTrainingProgramsQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ trainingPrograms: z.array(TrainingProgramSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'trainingProgram:read' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/training-programs/{id}',
  tags: TAG,
  summary: 'Get one Training Program',
  description: "Requires the 'trainingProgram:read' permission (every role).",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ trainingProgram: TrainingProgramSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'trainingProgram:read' permission"),
    404: errorResponse('No training program with this id', {
      status: 'error',
      message: 'Training program not found',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/training-programs/{id}',
  tags: TAG,
  summary: 'Update a Training Program',
  description: "Requires the 'trainingProgram:update' permission (ADMIN only). Includes deactivating it (status: INACTIVE), which blocks future enrollment but never touches existing Enrollment records.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: updateTrainingProgramSchema } } },
  },
  responses: {
    200: jsonResponse('Training program updated', z.object({ trainingProgram: TrainingProgramSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'trainingProgram:update' permission"),
    404: errorResponse('No training program with this id', {
      status: 'error',
      message: 'Training program not found',
    }),
    409: errorResponse('A training program with this name already exists', {
      status: 'error',
      message: 'A training program with this name already exists',
    }),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/training-programs/{id}',
  tags: TAG,
  summary: 'Delete a Training Program',
  description:
    "Requires the 'trainingProgram:delete' permission (ADMIN only). Hard-delete only when zero Enrollment records reference it - deactivate it instead if enrollments exist.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('Training program deleted', z.object({ message: z.string() })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'trainingProgram:delete' permission"),
    404: errorResponse('No training program with this id', {
      status: 'error',
      message: 'Training program not found',
    }),
    409: errorResponse('This training program has Enrollment records referencing it', {
      status: 'error',
      message:
        'This training program has Enrollment records referencing it and cannot be deleted - deactivate it instead',
    }),
  },
});
