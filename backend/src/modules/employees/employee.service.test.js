import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import prisma from '../../config/database.js';
import employeeService from './employee.service.js';
import authService from '../auth/auth.service.js';
import refreshTokenRepository from '../auth/refreshToken.repository.js';
import jwt from '../../utils/jwt.js';
import authMiddleware from '../../middlewares/auth.middleware.js';

// Integration coverage for ADR-006 (Offboarding Revokes Access by Default -
// see docs/domain-identity-employee-lifecycle.md). Runs against the real
// dev database configured via DATABASE_URL, the same way this project's
// existing manual verification does (handbook/TESTING_GUIDE.md) - there is
// no separate test-database provisioning in this project yet, so every
// fixture created here is cleaned up in `after`, not left behind.
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

let user;
let employee;
let department;
let designation;
let accessToken;
let refreshToken;

before(async () => {
  user = await prisma.user.create({
    data: {
      email: `adr006-test-${Date.now()}@example.com`,
      password: 'not-a-real-hash',
      name: 'ADR-006 Test User',
    },
  });

  // Department/designation/employmentType are mandatory on Employee now
  // (the free-text department/jobTitle columns this test was first written
  // against were replaced by governed master data).
  department = await prisma.department.create({
    data: { name: `ADR-006 Test Department ${Date.now()}` },
  });
  designation = await prisma.designation.create({
    data: { name: `ADR-006 Test Designation ${Date.now()}` },
  });

  employee = await prisma.employee.create({
    data: {
      userId: user.id,
      departmentId: department.id,
      designationId: designation.id,
      employmentType: 'FULL_TIME',
      salary: 1000,
      dateOfJoining: new Date(),
    },
  });

  // Mirrors auth.service.js's issueTokenPair without going through
  // register()/login() - only the token shape matters for this test.
  const payload = { sub: user.id, roles: [] };
  accessToken = jwt.signAccessToken(payload);
  refreshToken = jwt.signRefreshToken(payload);
  const { exp } = jwt.decode(refreshToken);

  await refreshTokenRepository.create({
    tokenHash: hashToken(refreshToken),
    userId: user.id,
    expiresAt: new Date(exp * 1000),
  });

  await employeeService.softDeleteEmployee(employee.id, { id: user.id, ipAddress: '127.0.0.1' });
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.employee.deleteMany({ where: { userId: user.id } });
  await prisma.department.delete({ where: { id: department.id } });
  await prisma.designation.delete({ where: { id: designation.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
});

test("offboarding rejects the employee's pre-existing access token on its next request", async () => {
  const req = { headers: { authorization: `Bearer ${accessToken}` } };
  let rejection;
  await authMiddleware(req, {}, (err) => {
    rejection = err;
  });

  assert.ok(rejection, 'expected authMiddleware to reject the pre-offboarding access token');
  assert.equal(rejection.message, 'Invalid or expired token');
  assert.equal(req.user, undefined);
});

test("offboarding revokes the employee's pre-existing refresh token", async () => {
  await assert.rejects(() => authService.refresh(refreshToken), {
    message: 'Invalid refresh token',
  });
});

test('soft-deleting an employee with no linked user does not throw', async () => {
  const unlinked = await prisma.employee.create({
    data: {
      departmentId: department.id,
      designationId: designation.id,
      employmentType: 'FULL_TIME',
      salary: 500,
      dateOfJoining: new Date(),
    },
  });

  await assert.doesNotReject(() =>
    employeeService.softDeleteEmployee(unlinked.id, { id: user.id, ipAddress: '127.0.0.1' }),
  );

  await prisma.auditLog.deleteMany({ where: { entityId: unlinked.id } });
  await prisma.employee.delete({ where: { id: unlinked.id } });
});
