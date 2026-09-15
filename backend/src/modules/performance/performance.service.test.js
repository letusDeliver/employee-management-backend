import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import performanceService from './performance.service.js';
import reviewCycleService from '../reviewCycles/reviewCycle.service.js';

// Integration coverage for the Performance domain (docs/domain-performance.md)
// - ReviewCycle/PerformanceReview's Draft->Submitted->Acknowledged workflow,
// manager/admin authoring authority, the org-context snapshot taken at
// submission, self-assessment, addenda, and own/reports/any list scoping.
// Runs against the real dev database - fixtures namespaced per run and
// fully cleaned up in `after`.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };

const createdEmployeeIds = [];
const createdUserIds = [];
const createdCycleIds = [];
const createdBranchIds = [];

let testDepartmentId;
let testDesignationId;
let openCycleId;

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `performance-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Performance Test Actor',
    },
  });
  actor.id = user.id;

  const department = await prisma.department.create({
    data: { name: `Performance Test Department ${RUN_ID}` },
  });
  testDepartmentId = department.id;

  const designation = await prisma.designation.create({
    data: { name: `Performance Test Designation ${RUN_ID}` },
  });
  testDesignationId = designation.id;

  const cycle = await reviewCycleService.createReviewCycle(
    {
      name: `Test Review Cycle ${RUN_ID}`,
      startDate: new Date(Date.UTC(2027, 0, 1)),
      endDate: new Date(Date.UTC(2027, 5, 30)),
    },
    actor,
  );
  openCycleId = cycle.id;
  createdCycleIds.push(cycle.id);
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
  await prisma.reviewAddendum.deleteMany({
    where: { performanceReview: { employeeId: { in: createdEmployeeIds } } },
  });
  await prisma.performanceReview.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
  if (createdEmployeeIds.length) {
    await prisma.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
  }
  if (createdCycleIds.length) {
    await prisma.reviewCycle.deleteMany({ where: { id: { in: createdCycleIds } } });
  }
  if (createdBranchIds.length) {
    await prisma.branch.deleteMany({ where: { id: { in: createdBranchIds } } });
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
      email: `performance-${label}-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: `Performance ${label}`,
    },
  });
  createdUserIds.push(user.id);
  return user;
};

const makeEmployee = async ({ userId, managerId, branchId } = {}) => {
  const employee = await prisma.employee.create({
    data: {
      userId,
      departmentId: testDepartmentId,
      designationId: testDesignationId,
      employmentType: 'FULL_TIME',
      salary: 1000,
      dateOfJoining: new Date('2020-01-01'),
      managerId,
      branchId,
    },
  });
  createdEmployeeIds.push(employee.id);
  return employee;
};

test('a MANAGER (create:reports) can author a review for their own report but not another employee', async () => {
  const managerUser = await makeUser('create-manager');
  const manager = await makeEmployee({ userId: managerUser.id });
  const reportUser = await makeUser('create-report');
  const report = await makeEmployee({ userId: reportUser.id, managerId: manager.id });
  const otherUser = await makeUser('create-non-report');
  const other = await makeEmployee({ userId: otherUser.id });

  const review = await performanceService.createPerformanceReview(
    { employeeId: report.id, reviewCycleId: openCycleId },
    { id: managerUser.id, ipAddress: '127.0.0.1', grantedPermissions: ['performanceReview:create:reports'] },
  );
  assert.equal(review.status, 'DRAFT');
  assert.equal(review.reviewerId, manager.id);

  await assert.rejects(
    () =>
      performanceService.createPerformanceReview(
        { employeeId: other.id, reviewCycleId: openCycleId },
        {
          id: managerUser.id,
          ipAddress: '127.0.0.1',
          grantedPermissions: ['performanceReview:create:reports'],
        },
      ),
    { message: 'You do not have permission to author a review for this employee' },
  );
});

test('createPerformanceReview rejects duplicate (employeeId, reviewCycleId) and a non-OPEN cycle', async () => {
  const managerUser = await makeUser('duplicate-manager');
  const manager = await makeEmployee({ userId: managerUser.id });
  const user = await makeUser('duplicate-employee');
  const employee = await makeEmployee({ userId: user.id, managerId: manager.id });

  await performanceService.createPerformanceReview(
    { employeeId: employee.id, reviewCycleId: openCycleId },
    { id: actor.id, ipAddress: '127.0.0.1', grantedPermissions: ['performanceReview:create:any'] },
  );

  await assert.rejects(
    () =>
      performanceService.createPerformanceReview(
        { employeeId: employee.id, reviewCycleId: openCycleId },
        { id: actor.id, ipAddress: '127.0.0.1', grantedPermissions: ['performanceReview:create:any'] },
      ),
    { message: 'A performance review already exists for this employee and cycle' },
  );

  const closedCycle = await reviewCycleService.createReviewCycle(
    {
      name: `Closed Cycle ${RUN_ID}`,
      startDate: new Date(Date.UTC(2025, 0, 1)),
      endDate: new Date(Date.UTC(2025, 5, 30)),
    },
    actor,
  );
  createdCycleIds.push(closedCycle.id);
  await reviewCycleService.updateReviewCycle(closedCycle.id, { status: 'CLOSED' }, actor);

  await assert.rejects(
    () =>
      performanceService.createPerformanceReview(
        { employeeId: employee.id, reviewCycleId: closedCycle.id },
        { id: actor.id, ipAddress: '127.0.0.1', grantedPermissions: ['performanceReview:create:any'] },
      ),
    { message: 'reviewCycleId: this review cycle is not open and cannot be assigned' },
  );
});

test('createPerformanceReview with :create:any requires an explicit reviewerId when the employee has no manager', async () => {
  const user = await makeUser('no-manager-employee');
  const employee = await makeEmployee({ userId: user.id });

  await assert.rejects(
    () =>
      performanceService.createPerformanceReview(
        { employeeId: employee.id, reviewCycleId: openCycleId },
        { id: actor.id, ipAddress: '127.0.0.1', grantedPermissions: ['performanceReview:create:any'] },
      ),
    { message: 'reviewerId: this employee has no manager - reviewerId must be provided explicitly' },
  );

  const adminReviewerUser = await makeUser('admin-reviewer');
  const adminReviewer = await makeEmployee({ userId: adminReviewerUser.id });

  const review = await performanceService.createPerformanceReview(
    { employeeId: employee.id, reviewCycleId: openCycleId, reviewerId: adminReviewer.id },
    { id: actor.id, ipAddress: '127.0.0.1', grantedPermissions: ['performanceReview:create:any'] },
  );
  assert.equal(review.reviewerId, adminReviewer.id);
});

test('PATCH is Draft-only; submit requires rating and managerComments and snapshots org context', async () => {
  const managerUser = await makeUser('submit-manager');
  const manager = await makeEmployee({ userId: managerUser.id });
  const branch = await prisma.branch.create({ data: { name: `Performance Test Branch ${RUN_ID}` } });
  createdBranchIds.push(branch.id);
  const reportUser = await makeUser('submit-report');
  const report = await makeEmployee({ userId: reportUser.id, managerId: manager.id, branchId: branch.id });

  const managerRequester = {
    id: managerUser.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['performanceReview:create:reports', 'performanceReview:manage:reports'],
  };

  const review = await performanceService.createPerformanceReview(
    { employeeId: report.id, reviewCycleId: openCycleId },
    managerRequester,
  );

  await assert.rejects(() => performanceService.submitPerformanceReview(review.id, managerRequester), {
    message: 'Both rating and managerComments must be set before a review can be submitted',
  });

  const updated = await performanceService.updatePerformanceReview(
    review.id,
    { rating: 'MEETS_EXPECTATIONS', managerComments: 'Solid, consistent contributor.' },
    managerRequester,
  );
  assert.equal(updated.status, 'DRAFT');

  const submitted = await performanceService.submitPerformanceReview(review.id, managerRequester);
  assert.equal(submitted.status, 'SUBMITTED');
  assert.ok(submitted.submittedAt);
  assert.equal(submitted.departmentName, `Performance Test Department ${RUN_ID}`);
  assert.equal(submitted.designationName, `Performance Test Designation ${RUN_ID}`);
  assert.equal(submitted.branchName, `Performance Test Branch ${RUN_ID}`);

  await assert.rejects(
    () =>
      performanceService.updatePerformanceReview(
        review.id,
        { managerComments: 'Trying to edit after submit' },
        managerRequester,
      ),
    { message: 'Only a Draft performance review can be edited' },
  );
});

test('self-assessment is settable until acknowledgement, then blocked; acknowledge is the employee\'s own action', async () => {
  const user = await makeUser('acknowledge-employee');
  const employee = await makeEmployee({ userId: user.id });
  const otherUser = await makeUser('acknowledge-imposter');
  await makeEmployee({ userId: otherUser.id });

  const review = await performanceService.createPerformanceReview(
    { employeeId: employee.id, reviewCycleId: openCycleId, reviewerId: employee.id },
    { id: actor.id, ipAddress: '127.0.0.1', grantedPermissions: ['performanceReview:create:any'] },
  );

  const selfAssessed = await performanceService.setSelfAssessment(
    review.id,
    { selfComments: 'I hit every sprint commitment this half.' },
    { id: user.id, ipAddress: '127.0.0.1' },
  );
  assert.equal(selfAssessed.selfComments, 'I hit every sprint commitment this half.');

  await assert.rejects(
    () =>
      performanceService.acknowledgePerformanceReview(review.id, {
        id: otherUser.id,
        ipAddress: '127.0.0.1',
      }),
    { message: 'You do not have permission to acknowledge this performance review' },
  );

  await assert.rejects(
    () => performanceService.acknowledgePerformanceReview(review.id, { id: user.id, ipAddress: '127.0.0.1' }),
    { message: 'Only a Submitted performance review can be acknowledged' },
  );

  await performanceService.updatePerformanceReview(
    review.id,
    { rating: 'EXCEEDS_EXPECTATIONS', managerComments: 'Great half.' },
    { id: actor.id, ipAddress: '127.0.0.1', grantedPermissions: ['performanceReview:manage:any'] },
  );
  await performanceService.submitPerformanceReview(review.id, {
    id: actor.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['performanceReview:manage:any'],
  });

  const acknowledged = await performanceService.acknowledgePerformanceReview(review.id, {
    id: user.id,
    ipAddress: '127.0.0.1',
  });
  assert.equal(acknowledged.status, 'ACKNOWLEDGED');
  assert.ok(acknowledged.acknowledgedAt);

  await assert.rejects(
    () =>
      performanceService.setSelfAssessment(
        review.id,
        { selfComments: 'Too late now' },
        { id: user.id, ipAddress: '127.0.0.1' },
      ),
    { message: 'Cannot add a self-assessment to an already-acknowledged review' },
  );
});

test('addenda are appendable by the reviewer, the reviewed employee, or ADMIN, but not an unrelated employee', async () => {
  const managerUser = await makeUser('addendum-manager');
  const manager = await makeEmployee({ userId: managerUser.id });
  const reportUser = await makeUser('addendum-report');
  const report = await makeEmployee({ userId: reportUser.id, managerId: manager.id });
  const strangerUser = await makeUser('addendum-stranger');
  await makeEmployee({ userId: strangerUser.id });

  const review = await performanceService.createPerformanceReview(
    { employeeId: report.id, reviewCycleId: openCycleId },
    {
      id: managerUser.id,
      ipAddress: '127.0.0.1',
      grantedPermissions: ['performanceReview:create:reports'],
    },
  );

  const fromReviewer = await performanceService.addAddendum(
    review.id,
    { comment: 'Following up after our 1:1.' },
    { id: managerUser.id, ipAddress: '127.0.0.1', grantedPermissions: ['performanceReview:manage:reports'] },
  );
  assert.equal(fromReviewer.comment, 'Following up after our 1:1.');

  const fromEmployee = await performanceService.addAddendum(
    review.id,
    { comment: 'Acknowledging the follow-up.' },
    { id: reportUser.id, ipAddress: '127.0.0.1', grantedPermissions: ['performanceReview:read:own'] },
  );
  assert.equal(fromEmployee.comment, 'Acknowledging the follow-up.');

  await assert.rejects(
    () =>
      performanceService.addAddendum(
        review.id,
        { comment: 'Not my business' },
        { id: strangerUser.id, ipAddress: '127.0.0.1', grantedPermissions: ['performanceReview:read:own'] },
      ),
    { message: 'You do not have permission to comment on this performance review' },
  );

  const full = await performanceService.getPerformanceReviewById(review.id, {
    id: actor.id,
    grantedPermissions: ['performanceReview:read:any'],
  });
  assert.equal(full.addenda.length, 2);
});

test('listPerformanceReviews scopes to own reviews and/or reports\' reviews without :read:any', async () => {
  const managerUser = await makeUser('list-manager');
  const manager = await makeEmployee({ userId: managerUser.id });
  const reportUser = await makeUser('list-report');
  const report = await makeEmployee({ userId: reportUser.id, managerId: manager.id });

  await performanceService.createPerformanceReview(
    { employeeId: report.id, reviewCycleId: openCycleId },
    {
      id: managerUser.id,
      ipAddress: '127.0.0.1',
      grantedPermissions: ['performanceReview:create:reports'],
    },
  );

  const { reviews: managerView } = await performanceService.listPerformanceReviews(
    { page: 1, limit: 10, sortBy: 'createdAt', order: 'desc' },
    {
      id: managerUser.id,
      grantedPermissions: ['performanceReview:read:own', 'performanceReview:manage:reports'],
    },
  );
  assert.ok(managerView.some((r) => r.employeeId === report.id));

  const { reviews: strangerView } = await performanceService.listPerformanceReviews(
    { page: 1, limit: 10, sortBy: 'createdAt', order: 'desc' },
    { id: report.userId, grantedPermissions: [] },
  );
  assert.equal(strangerView.length, 0);
});

test('deletePerformanceReview is Draft-only', async () => {
  const user = await makeUser('delete-employee');
  const employee = await makeEmployee({ userId: user.id });

  const review = await performanceService.createPerformanceReview(
    { employeeId: employee.id, reviewCycleId: openCycleId, reviewerId: employee.id },
    { id: actor.id, ipAddress: '127.0.0.1', grantedPermissions: ['performanceReview:create:any'] },
  );

  await performanceService.deletePerformanceReview(review.id, {
    id: actor.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['performanceReview:manage:any'],
  });

  const gone = await prisma.performanceReview.findUnique({ where: { id: review.id } });
  assert.equal(gone, null);
});
