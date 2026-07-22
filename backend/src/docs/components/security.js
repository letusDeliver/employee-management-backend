import registry from '../openapi.registry.js';

// Bearer access token (Authorization: Bearer <token>) - what authMiddleware
// actually checks for almost every protected route.
export const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

// The refresh token is delivered and read via an httpOnly cookie, not a
// Bearer header (see auth.controller.js) - POST /auth/refresh and
// POST /auth/logout are the only two routes that use this, and reusing
// bearerAuth for them would document a mechanism they don't actually use.
export const cookieAuth = registry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'refreshToken',
});
