import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import { UserPublicSchema } from '../../docs/components/schemas.js';

const TAG = ['Users'];

registry.registerPath({
  method: 'get',
  path: '/users',
  tags: TAG,
  summary: 'List all registered users',
  description:
    "Requires the 'user:list' permission (ADMIN by default). password is stripped from every entry.",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: jsonResponse('OK', z.object({ users: z.array(UserPublicSchema) })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'user:list' permission", {
      status: 'error',
      message: 'You do not have permission to perform this action',
    }),
  },
});

registry.registerPath({
  method: 'post',
  path: '/users/me/profile-picture',
  tags: TAG,
  summary: "Upload or replace the caller's own avatar",
  description:
    'Self-service only - always operates on the authenticated caller, never another user. multipart/form-data with a single "file" field (JPEG/PNG/WebP, max 5MB). Uses a fixed Cloudinary public_id + overwrite so a replacement never leaves an orphaned old asset.',
  security: [{ [bearerAuth.name]: [] }],
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.string().meta({
              format: 'binary',
              description: 'JPEG, PNG, or WebP image, max 5MB',
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: jsonResponse('Profile picture updated', z.object({ user: UserPublicSchema })),
    400: errorResponse('Missing file, disallowed MIME type, or file too large', {
      status: 'error',
      message: 'file: must be one of image/jpeg, image/png, image/webp (received application/pdf)',
    }),
    401: errorResponse('Missing, invalid, or expired access token'),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/users/me/profile-picture',
  tags: TAG,
  summary: "Remove the caller's own avatar",
  description:
    'Self-service only. Deletes the Cloudinary asset best-effort after the database update commits.',
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: jsonResponse('Profile picture removed', z.object({ user: UserPublicSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
  },
});
