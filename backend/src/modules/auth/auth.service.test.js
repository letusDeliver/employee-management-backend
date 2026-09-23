import { test, after, mock } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import authService from './auth.service.js';
import refreshTokenRepository from './refreshToken.repository.js';
import UnauthorizedError from '../../errors/UnauthorizedError.js';

// Integration coverage for refresh-token rotation. Runs against the real dev
// database - fixtures are namespaced per run and fully cleaned up in `after`,
// same convention as department.service.test.js.
//
// Background: refresh() used to revoke the old token BEFORE issuing the new pair,
// with no transaction, and refresh tokens carried no unique claim. A refresh within
// the same second as the token it replaced produced an identical token -> unique
// constraint violation on tokenHash -> 500 - and by then the old token was already
// revoked, so the caller's session was destroyed (the same cookie then returned 401).
const RUN_ID = Date.now();
const PASSWORD = 'Password123!';
const createdEmails = [];
let counter = 0;

const registerUser = async () => {
  counter += 1;
  const email = `auth-test-${RUN_ID}-${counter}@example.com`;
  createdEmails.push(email);
  return authService.register({ email, password: PASSWORD, name: `Auth Test ${counter}` });
};

after(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } }, select: { id: true } });
  const userIds = users.map((user) => user.id);

  // RefreshToken has no cascade; UserRole cascades from User.
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

test('refresh immediately after registering (same second) succeeds and rotates the token', async () => {
  const { refreshToken } = await registerUser();

  const rotated = await authService.refresh(refreshToken);

  assert.ok(rotated.accessToken);
  assert.ok(rotated.refreshToken);
  assert.notEqual(rotated.refreshToken, refreshToken);
});

test('refresh immediately after login (same second) succeeds - the reported 500', async () => {
  const { user } = await registerUser();
  const { refreshToken } = await authService.login({ email: user.email, password: PASSWORD });

  await assert.doesNotReject(() => authService.refresh(refreshToken));
});

test('a rotated token keeps working: several refreshes in a row, back to back', async () => {
  let { refreshToken } = await registerUser();

  for (let i = 0; i < 5; i += 1) {
    ({ refreshToken } = await authService.refresh(refreshToken));
  }

  assert.ok(refreshToken);
});

test('a refresh token is single-use: reusing a rotated token is rejected as Unauthorized', async () => {
  const { refreshToken } = await registerUser();
  await authService.refresh(refreshToken);

  await assert.rejects(() => authService.refresh(refreshToken), UnauthorizedError);
});

test('two parallel refreshes of the same token: exactly one wins, the other is Unauthorized', async () => {
  const { refreshToken } = await registerUser();

  const results = await Promise.allSettled([authService.refresh(refreshToken), authService.refresh(refreshToken)]);

  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof UnauthorizedError);
});

test('a failure while issuing the new token does not burn the old one (rotation is atomic)', async () => {
  const { refreshToken } = await registerUser();

  const failingCreate = mock.method(refreshTokenRepository, 'create', async () => {
    throw new Error('simulated failure while storing the new refresh token');
  });

  await assert.rejects(() => authService.refresh(refreshToken), /simulated failure/);
  failingCreate.mock.restore();

  // The claim was rolled back with the transaction - the original token still works.
  await assert.doesNotReject(() => authService.refresh(refreshToken));
});

test('garbage and unknown tokens are rejected as Unauthorized', async () => {
  await assert.rejects(() => authService.refresh('not-a-jwt'), UnauthorizedError);

  // A well-formed, correctly-signed token that was never stored.
  const { refreshToken } = await registerUser();
  await prisma.refreshToken.deleteMany({ where: { user: { email: createdEmails.at(-1) } } });

  await assert.rejects(() => authService.refresh(refreshToken), UnauthorizedError);
});

test('logout revokes the refresh token so it can no longer be rotated', async () => {
  const { refreshToken } = await registerUser();

  await authService.logout(refreshToken);

  await assert.rejects(() => authService.refresh(refreshToken), UnauthorizedError);
});
