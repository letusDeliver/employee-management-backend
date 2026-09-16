import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import enrollmentService from './enrollment.service.js';
import trainingProgramService from './trainingProgram.service.js';

// Integration coverage for Enrollment (docs/domain-training.md) - the
// repeatable per-attempt workflow (ENROLLED->IN_PROGRESS->COMPLETED|FAILED,
// WITHDRAWN from either non-terminal stage), the mandatory-program
// self-enroll rejection, own/any/withdraw:own permission scoping, and the
// compliance calculation computed on read (ADR-TR02). Runs against the
// real dev database - fixtures namespaced per run and fully cleaned up in
// `after`.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };

const createdEmployeeIds = [];
const createdUserIds = [];
const createdProgramIds = [];

let testDepartmentId;
let testDesignationId;

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `enrollment-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Enrollment Test Actor',
    },
  });
  actor.id = user.id;

  const department = await prisma.department.create({
    data: { name: `Enrollment Test Department ${RUN_ID}` },
  });
  testDepartmentId = department.id;

  const designation = await prisma.designation.create({
    data: { name: `Enrollment Test Designation ${RUN_ID}` },
  });
  testDesignationId = designation.id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [actor.id, ...createdUserIds] } } });
  if (createdEmployeeIds.length) {
    await prisma.enrollment.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
    await prisma.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
  }
  if (createdProgramIds.length) {
    await prisma.trainingProgram.deleteMany({ where: { id: { in: createdProgramIds } } });
  }
  await prisma.department.delete({ where: { id: testDepartmentId } });
  await prisma.designation.delete({ where: { id: testDesignationId } });
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.user.delete({ where: { id: actor.id } });
  await prisma.$disconnect();
});

const makeUser = async (label) => {
  const user = await prisma.user.create({
    data: {
      email: `enrollment-${label}-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: `Enrollment ${label}`,
    },
  });
  createdUserIds.push(user.id);
  return user;
};

const makeEmployee = async (userId) => {
  const employee = await prisma.employee.create({
    data: {
      userId,
      departmentId: testDepartmentId,
      designationId: testDesignationId,
      employmentType: 'FULL_TIME',
      salary: 1000,
      dateOfJoining: new Date('2020-01-01'),
    },
  });
  createdEmployeeIds.push(employee.id);
  return employee;
};

const makeProgram = async (overrides = {}) => {
  const program = await trainingProgramService.createTrainingProgram(
    { name: `Program ${RUN_ID}-${Date.now()}-${Math.random()}`, ...overrides },
    actor,
  );
  createdProgramIds.push(program.id);
  return program;
};

test('createEnrollment: create:own self-enrolls (non-mandatory only, rejected on mandatory); create:any requires employeeId', async () => {
  const user = await makeUser('self-enroll');
  const employee = await makeEmployee(user.id);
  const optionalProgram = await makeProgram({ mandatory: false });
  const mandatoryProgram = await makeProgram({ mandatory: true });

  const selfRequester = {
    id: user.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['enrollment:create:own'],
  };

  const enrollment = await enrollmentService.createEnrollment(
    { trainingProgramId: optionalProgram.id },
    selfRequester,
  );
  assert.equal(enrollment.employeeId, employee.id);
  assert.equal(enrollment.status, 'ENROLLED');

  await assert.rejects(
    () => enrollmentService.createEnrollment({ trainingProgramId: mandatoryProgram.id }, selfRequester),
    {
      message:
        'trainingProgramId: self-enrollment is not allowed for a mandatory program - contact an administrator',
    },
  );

  const adminRequester = {
    id: actor.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['enrollment:create:any'],
  };

  await assert.rejects(
    () => enrollmentService.createEnrollment({ trainingProgramId: mandatoryProgram.id }, adminRequester),
    { message: 'employeeId: required when enrolling on behalf of another employee' },
  );

  const adminEnrolled = await enrollmentService.createEnrollment(
    { employeeId: employee.id, trainingProgramId: mandatoryProgram.id },
    adminRequester,
  );
  assert.equal(adminEnrolled.employeeId, employee.id);
});

test('status transitions: sequential forward, WITHDRAWN from either non-terminal stage, IN_PROGRESS/COMPLETED/FAILED require manage:any, own-employee can only withdraw their own', async () => {
  const user = await makeUser('transition-employee');
  await makeEmployee(user.id);
  const otherUser = await makeUser('transition-stranger');
  await makeEmployee(otherUser.id);
  const program = await makeProgram({ mandatory: false });

  const selfRequester = {
    id: user.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['enrollment:create:own', 'enrollment:withdraw:own'],
  };
  const adminRequester = {
    id: actor.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['enrollment:manage:any'],
  };

  const enrollment = await enrollmentService.createEnrollment(
    { trainingProgramId: program.id },
    selfRequester,
  );

  await assert.rejects(
    () =>
      enrollmentService.updateEnrollmentStatus(enrollment.id, 'COMPLETED', undefined, adminRequester),
    { message: 'Cannot transition an enrollment from ENROLLED to COMPLETED' },
  );

  await assert.rejects(
    () =>
      enrollmentService.updateEnrollmentStatus(enrollment.id, 'IN_PROGRESS', undefined, selfRequester),
    { message: 'You do not have permission to perform this action' },
  );

  const inProgress = await enrollmentService.updateEnrollmentStatus(
    enrollment.id,
    'IN_PROGRESS',
    undefined,
    adminRequester,
  );
  assert.equal(inProgress.status, 'IN_PROGRESS');

  const otherRequester = {
    id: otherUser.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['enrollment:withdraw:own'],
  };

  await assert.rejects(
    () =>
      enrollmentService.updateEnrollmentStatus(enrollment.id, 'WITHDRAWN', undefined, otherRequester),
    { message: 'You do not have permission to withdraw this enrollment' },
  );

  const completed = await enrollmentService.updateEnrollmentStatus(
    enrollment.id,
    'COMPLETED',
    95,
    adminRequester,
  );
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.score, 95);
  assert.ok(completed.completedAt);

  await assert.rejects(
    () => enrollmentService.updateEnrollmentStatus(enrollment.id, 'WITHDRAWN', undefined, selfRequester),
    { message: 'Cannot transition an enrollment from COMPLETED to WITHDRAWN' },
  );

  const secondEnrollment = await enrollmentService.createEnrollment(
    { trainingProgramId: program.id },
    selfRequester,
  );
  const withdrawn = await enrollmentService.updateEnrollmentStatus(
    secondEnrollment.id,
    'WITHDRAWN',
    undefined,
    selfRequester,
  );
  assert.equal(withdrawn.status, 'WITHDRAWN');
});

test('listEnrollments/getEnrollmentById scope to own without :read:any; deleteEnrollment (manage:any) is unrestricted by status', async () => {
  const user = await makeUser('scope-employee');
  await makeEmployee(user.id);
  const otherUser = await makeUser('scope-stranger');
  await makeEmployee(otherUser.id);
  const program = await makeProgram({ mandatory: false });

  const selfRequester = {
    id: user.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['enrollment:create:own', 'enrollment:read:own'],
  };

  const enrollment = await enrollmentService.createEnrollment(
    { trainingProgramId: program.id },
    selfRequester,
  );

  const { enrollments: ownView } = await enrollmentService.listEnrollments(
    { page: 1, limit: 10, sortBy: 'createdAt', order: 'desc' },
    selfRequester,
  );
  assert.ok(ownView.some((e) => e.id === enrollment.id));

  const strangerRequester = {
    id: otherUser.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['enrollment:read:own'],
  };

  await assert.rejects(
    () => enrollmentService.getEnrollmentById(enrollment.id, strangerRequester),
    { message: 'You do not have permission to view this enrollment' },
  );

  const { enrollments: strangerView } = await enrollmentService.listEnrollments(
    { page: 1, limit: 10, sortBy: 'createdAt', order: 'desc' },
    strangerRequester,
  );
  assert.equal(strangerView.length, 0);

  const adminRequester = {
    id: actor.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['enrollment:manage:any'],
  };

  await enrollmentService.deleteEnrollment(enrollment.id, adminRequester);
  const gone = await prisma.enrollment.findUnique({ where: { id: enrollment.id } });
  assert.equal(gone, null);
});

test('training compliance: computed on read - never-completed, completed-and-current, completed-but-expired, and no-expiry cases', async () => {
  const user = await makeUser('compliance-employee');
  const employee = await makeEmployee(user.id);
  const expiringProgram = await makeProgram({ mandatory: true, renewalPeriodDays: 30 });
  const neverExpiresProgram = await makeProgram({ mandatory: true });

  const adminRequester = {
    id: actor.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['enrollment:create:any', 'enrollment:manage:any', 'enrollment:read:any'],
  };

  const neverCompleted = await enrollmentService.getTrainingCompliance(
    employee.id,
    expiringProgram.id,
    adminRequester,
  );
  assert.equal(neverCompleted.compliant, false);
  assert.equal(neverCompleted.lastCompletedAt, null);

  const staleEnrollment = await enrollmentService.createEnrollment(
    { employeeId: employee.id, trainingProgramId: expiringProgram.id },
    adminRequester,
  );
  await enrollmentService.updateEnrollmentStatus(staleEnrollment.id, 'IN_PROGRESS', undefined, adminRequester);
  await enrollmentService.updateEnrollmentStatus(staleEnrollment.id, 'COMPLETED', undefined, adminRequester);
  // Backdate completedAt well past the 30-day renewal period.
  await prisma.enrollment.update({
    where: { id: staleEnrollment.id },
    data: { completedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
  });

  const expired = await enrollmentService.getTrainingCompliance(
    employee.id,
    expiringProgram.id,
    adminRequester,
  );
  assert.equal(expired.compliant, false);
  assert.ok(expired.lastCompletedAt);

  const freshEnrollment = await enrollmentService.createEnrollment(
    { employeeId: employee.id, trainingProgramId: expiringProgram.id },
    adminRequester,
  );
  await enrollmentService.updateEnrollmentStatus(freshEnrollment.id, 'IN_PROGRESS', undefined, adminRequester);
  await enrollmentService.updateEnrollmentStatus(freshEnrollment.id, 'COMPLETED', undefined, adminRequester);

  const current = await enrollmentService.getTrainingCompliance(
    employee.id,
    expiringProgram.id,
    adminRequester,
  );
  assert.equal(current.compliant, true);

  const noExpiryEnrollment = await enrollmentService.createEnrollment(
    { employeeId: employee.id, trainingProgramId: neverExpiresProgram.id },
    adminRequester,
  );
  await enrollmentService.updateEnrollmentStatus(noExpiryEnrollment.id, 'IN_PROGRESS', undefined, adminRequester);
  await enrollmentService.updateEnrollmentStatus(noExpiryEnrollment.id, 'COMPLETED', undefined, adminRequester);

  const neverExpires = await enrollmentService.getTrainingCompliance(
    employee.id,
    neverExpiresProgram.id,
    adminRequester,
  );
  assert.equal(neverExpires.compliant, true);
  assert.equal(neverExpires.expiresAt, null);

  const report = await enrollmentService.getTrainingCompliance(employee.id, undefined, adminRequester);
  assert.ok(Array.isArray(report));
  assert.ok(report.some((r) => r.trainingProgramId === expiringProgram.id && r.compliant === true));
  assert.ok(report.some((r) => r.trainingProgramId === neverExpiresProgram.id && r.compliant === true));
});
