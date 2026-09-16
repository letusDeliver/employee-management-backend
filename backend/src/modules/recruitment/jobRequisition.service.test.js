import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import jobRequisitionService from './jobRequisition.service.js';

// Integration coverage for JobRequisition (docs/domain-recruitment.md §2) -
// mirrors the same status-lifecycle shape as Branch/Department/Designation/
// Shift/LeaveType/ReviewCycle, plus the OPEN<->ON_HOLD/CANCELLED transition
// guard and the openings decrement/auto-close primitives application.
// service.test.js exercises end-to-end via hireApplication. Runs against
// the real dev database - fixtures namespaced per run and fully cleaned up
// in `after`.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };
const createdRequisitionIds = [];

let testDepartmentId;
let testDesignationId;

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `job-requisition-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Job Requisition Test Actor',
    },
  });
  actor.id = user.id;

  const department = await prisma.department.create({
    data: { name: `Job Requisition Test Department ${RUN_ID}` },
  });
  testDepartmentId = department.id;

  const designation = await prisma.designation.create({
    data: { name: `Job Requisition Test Designation ${RUN_ID}` },
  });
  testDesignationId = designation.id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
  if (createdRequisitionIds.length) {
    await prisma.jobRequisition.deleteMany({ where: { id: { in: createdRequisitionIds } } });
  }
  await prisma.department.delete({ where: { id: testDepartmentId } });
  await prisma.designation.delete({ where: { id: testDesignationId } });
  await prisma.user.delete({ where: { id: actor.id } });
  await prisma.$disconnect();
});

const makeRequisition = async (overrides = {}) => {
  const requisition = await jobRequisitionService.createJobRequisition(
    {
      departmentId: testDepartmentId,
      designationId: testDesignationId,
      employmentType: 'FULL_TIME',
      numberOfOpenings: 2,
      ...overrides,
    },
    actor,
  );
  createdRequisitionIds.push(requisition.id);
  return requisition;
};

test('creates a job requisition with remainingOpenings seeded from numberOfOpenings', async () => {
  const requisition = await makeRequisition({ numberOfOpenings: 3 });
  assert.equal(requisition.status, 'OPEN');
  assert.equal(requisition.numberOfOpenings, 3);
  assert.equal(requisition.remainingOpenings, 3);
});

test('rejects an inactive or nonexistent departmentId/designationId', async () => {
  await assert.rejects(
    () =>
      jobRequisitionService.createJobRequisition(
        {
          departmentId: '00000000-0000-0000-0000-000000000000',
          designationId: testDesignationId,
          employmentType: 'FULL_TIME',
          numberOfOpenings: 1,
        },
        actor,
      ),
    { message: 'departmentId: references a record that does not exist' },
  );
});

test('status transitions: OPEN<->ON_HOLD and either to CANCELLED; CLOSED is rejected directly', async () => {
  const requisition = await makeRequisition();

  const onHold = await jobRequisitionService.updateJobRequisitionStatus(
    requisition.id,
    'ON_HOLD',
    actor,
  );
  assert.equal(onHold.status, 'ON_HOLD');

  const reopened = await jobRequisitionService.updateJobRequisitionStatus(
    requisition.id,
    'OPEN',
    actor,
  );
  assert.equal(reopened.status, 'OPEN');

  await assert.rejects(
    () => jobRequisitionService.updateJobRequisitionStatus(requisition.id, 'CLOSED', actor),
    {
      message:
        'status: CLOSED is set automatically when a requisition’s openings are exhausted, not settable directly',
    },
  );

  const cancelled = await jobRequisitionService.updateJobRequisitionStatus(
    requisition.id,
    'CANCELLED',
    actor,
  );
  assert.equal(cancelled.status, 'CANCELLED');

  await assert.rejects(
    () => jobRequisitionService.updateJobRequisitionStatus(requisition.id, 'OPEN', actor),
    { message: 'Cannot transition a job requisition from CANCELLED to OPEN' },
  );
});

test('lists job requisitions with pagination and status filter', async () => {
  const requisition = await makeRequisition();

  const { jobRequisitions, pagination } = await jobRequisitionService.listJobRequisitions({
    page: 1,
    limit: 10,
    status: 'OPEN',
    departmentId: testDepartmentId,
    sortBy: 'createdAt',
    order: 'desc',
  });

  assert.ok(pagination.total >= 1);
  assert.ok(jobRequisitions.some((r) => r.id === requisition.id));
});

test('deleting a job requisition with zero Application references succeeds; a referenced one is rejected', async () => {
  const unreferenced = await makeRequisition();
  await jobRequisitionService.deleteJobRequisition(unreferenced.id, actor);

  const gone = await prisma.jobRequisition.findUnique({ where: { id: unreferenced.id } });
  assert.equal(gone, null);

  const referenced = await makeRequisition();
  const candidate = await prisma.candidate.create({
    data: { name: 'Delete Guard Candidate', email: `delete-guard-${RUN_ID}@example.com` },
  });

  await prisma.application.create({
    data: { candidateId: candidate.id, jobRequisitionId: referenced.id },
  });

  await assert.rejects(() => jobRequisitionService.deleteJobRequisition(referenced.id, actor), {
    message:
      'This job requisition has Application records referencing it and cannot be deleted - cancel it instead',
  });

  await prisma.application.deleteMany({ where: { jobRequisitionId: referenced.id } });
  await prisma.candidate.delete({ where: { id: candidate.id } });
});
