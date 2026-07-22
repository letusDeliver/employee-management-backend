import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth, cookieAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import { AuthenticatedUserSchema } from '../../docs/components/schemas.js';
import { registerSchema, loginSchema } from './auth.validation.js';

const TAG = ['Auth'];

registry.registerPath({
  method: 'post',
  path: '/auth/register',
  tags: TAG,
  summary: 'Register a new account',
  description:
    'Public. Creates a User with the default EMPLOYEE role, issues an access token, and sets an httpOnly refresh-token cookie scoped to /api/v1/auth. See handbook/API_ENDPOINTS.md § POST /auth/register for full negative/security testing.',
  request: {
    body: { content: { 'application/json': { schema: registerSchema } } },
  },
  responses: {
    201: jsonResponse(
      'Account created',
      z.object({ message: z.string(), user: AuthenticatedUserSchema, accessToken: z.string() }),
      { message: 'User registered successfully', accessToken: 'eyJhbGciOi...' },
    ),
    400: errorResponse('Validation failed', { status: 'error', message: 'email: Invalid email' }),
    409: errorResponse('Email already registered', {
      status: 'error',
      message: 'Email already in use',
    }),
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/login',
  tags: TAG,
  summary: 'Authenticate with email and password',
  description:
    'Public. Same generic 401 for both a nonexistent email and a wrong password (enumeration-safety, see handbook/API_ENDPOINTS.md § POST /auth/login).',
  request: {
    body: { content: { 'application/json': { schema: loginSchema } } },
  },
  responses: {
    200: jsonResponse(
      'Login successful',
      z.object({ message: z.string(), user: AuthenticatedUserSchema, accessToken: z.string() }),
      { message: 'Login successful', accessToken: 'eyJhbGciOi...' },
    ),
    400: errorResponse('Validation failed'),
    401: errorResponse('Invalid credentials', { status: 'error', message: 'Invalid credentials' }),
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/refresh',
  tags: TAG,
  summary: 'Rotate the refresh token and issue a new access token',
  description:
    'Requires the refreshToken httpOnly cookie (not a Bearer header). The old token is revoked on use; reusing it after rotation is rejected.',
  security: [{ [cookieAuth.name]: [] }],
  responses: {
    200: jsonResponse('New access token issued', z.object({ accessToken: z.string() })),
    401: errorResponse('Refresh token missing, invalid, expired, or already rotated out', {
      status: 'error',
      message: 'Refresh token missing',
    }),
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/logout',
  tags: TAG,
  summary: 'Revoke the refresh token and clear the cookie',
  description:
    'Idempotent: succeeds even if the refreshToken cookie is already missing (nothing to revoke, the cookie is cleared regardless) - the cookie is optional here, unlike /auth/refresh where it is required.',
  security: [{ [cookieAuth.name]: [] }, {}],
  responses: {
    200: jsonResponse('Logged out', z.object({ message: z.string() }), {
      message: 'Logged out successfully',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/auth/me',
  tags: TAG,
  summary: 'Get the current authenticated user',
  description:
    'Always reads the user fresh from the database - never trusts stale role/permission data from the token payload.',
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: jsonResponse('OK', z.object({ user: AuthenticatedUserSchema })),
    401: errorResponse('Missing, invalid, or expired access token', {
      status: 'error',
      message: 'Authentication required',
    }),
  },
});
