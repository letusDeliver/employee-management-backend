import { z } from 'zod';

import registry from './openapi.registry.js';
import { jsonResponse, errorResponse } from './components/responses.js';

// /health and /ready live directly in routes/index.js, not their own
// module - documented here rather than inventing a module for two routes.
registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['System'],
  summary: 'Liveness check',
  description: 'Public. Confirms the process is running - does not touch the database.',
  responses: {
    200: jsonResponse('OK', z.object({ status: z.literal('ok') }), { status: 'ok' }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/ready',
  tags: ['System'],
  summary: 'Readiness check',
  description: 'Public. Confirms the database is reachable via SELECT 1.',
  responses: {
    200: jsonResponse(
      'Database reachable',
      z.object({ status: z.literal('ok'), database: z.literal('connected') }),
      {
        status: 'ok',
        database: 'connected',
      },
    ),
    503: errorResponse('Database connection is not available', {
      status: 'error',
      message: 'Database connection is not available',
    }),
  },
});
