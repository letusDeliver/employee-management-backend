import { test } from 'node:test';
import assert from 'node:assert/strict';

import jwt from './jwt.js';

// Regression coverage for the refresh-token collision: a refresh token is a JWT
// of { sub, roles } plus a one-second `iat`, so before a unique `jti` was added,
// two tokens issued for one user within the same second were byte-identical and
// collided on RefreshToken.tokenHash's unique constraint (POST /auth/refresh -> 500).
const payload = { sub: '00000000-0000-4000-8000-000000000001', roles: ['EMPLOYEE'] };

test('two refresh tokens signed back-to-back for the same user are different tokens', () => {
  const first = jwt.signRefreshToken(payload);
  const second = jwt.signRefreshToken(payload);

  assert.notEqual(first, second);
});

test('many refresh tokens signed in the same instant are all distinct', () => {
  const tokens = new Set(Array.from({ length: 200 }, () => jwt.signRefreshToken(payload)));

  assert.equal(tokens.size, 200);
});

test('a refresh token carries a UUID jti and still verifies with its original claims', () => {
  const token = jwt.signRefreshToken(payload);
  const claims = jwt.verifyRefreshToken(token);

  assert.match(claims.jti, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(claims.sub, payload.sub);
  assert.deepEqual(claims.roles, payload.roles);
  assert.ok(claims.exp > claims.iat);
});

test('signing does not mutate the caller\'s payload', () => {
  const original = { sub: 'user-1', roles: ['ADMIN'] };
  jwt.signRefreshToken(original);

  assert.deepEqual(original, { sub: 'user-1', roles: ['ADMIN'] });
});

test('access tokens are unaffected: they still verify and carry no jti', () => {
  const token = jwt.signAccessToken(payload);
  const claims = jwt.verifyAccessToken(token);

  assert.equal(claims.sub, payload.sub);
  assert.equal(claims.jti, undefined);
});
