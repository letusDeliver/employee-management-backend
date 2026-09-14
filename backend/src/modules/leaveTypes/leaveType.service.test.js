import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import leaveTypeService from './leaveType.service.js';

// Integration coverage for the LeaveType aggregate (docs/domain-leave.md
// §2 - master data, same shape as Branch/Department/Designation). Runs
// against the real dev database - fixtures namespaced per run and fully
// cleaned up in `after`, same convention as every other domain suite.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };
const createdLeaveTypeIds = [];

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `leave-type-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Leave Type Test Actor',
    },
  });
  actor.id = user.id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
  if (createdLeaveTypeIds.length) {
    await prisma.leaveType.deleteMany({ where: { id: { in: createdLeaveTypeIds } } });
  }
  await prisma.user.delete({ where: { id: actor.id } });
  await prisma.$disconnect();
});

test('creates a leave type and rejects a duplicate name (case-insensitive)', async () => {
  const leaveType = await leaveTypeService.createLeaveType(
    { name: `Annual Leave ${RUN_ID}`, defaultAnnualEntitlement: 18 },
    actor,
  );
  createdLeaveTypeIds.push(leaveType.id);

  assert.equal(leaveType.status, 'ACTIVE');

  await assert.rejects(
    () =>
      leaveTypeService.createLeaveType(
        { name: `annual leave ${RUN_ID}`, defaultAnnualEntitlement: 10 },
        actor,
      ),
    { message: 'A leave type with this name already exists' },
  );
});

test('lists leave types with pagination and search', async () => {
  const leaveType = await leaveTypeService.createLeaveType(
    { name: `Sick Leave ${RUN_ID}`, defaultAnnualEntitlement: 10 },
    actor,
  );
  createdLeaveTypeIds.push(leaveType.id);

  const { leaveTypes, pagination } = await leaveTypeService.listLeaveTypes({
    page: 1,
    limit: 10,
    search: `Sick Leave ${RUN_ID}`,
    sortBy: 'createdAt',
    order: 'desc',
  });

  assert.equal(pagination.total, 1);
  assert.equal(leaveTypes[0].id, leaveType.id);
});

test('deactivating a leave type blocks future assignment', async () => {
  const leaveType = await leaveTypeService.createLeaveType(
    { name: `Casual Leave ${RUN_ID}`, defaultAnnualEntitlement: 12 },
    actor,
  );
  createdLeaveTypeIds.push(leaveType.id);

  const updated = await leaveTypeService.updateLeaveType(leaveType.id, { status: 'INACTIVE' }, actor);
  assert.equal(updated.status, 'INACTIVE');

  await assert.rejects(() => leaveTypeService.assertLeaveTypeAssignable(leaveType.id), {
    message: 'leaveTypeId: this leave type is not active and cannot be assigned',
  });
});

test('assertLeaveTypeAssignable rejects a nonexistent leaveTypeId', async () => {
  await assert.rejects(
    () => leaveTypeService.assertLeaveTypeAssignable('00000000-0000-0000-0000-000000000000'),
    { message: 'leaveTypeId: references a record that does not exist' },
  );
});

test('deleting a leave type with zero references succeeds', async () => {
  const unreferenced = await leaveTypeService.createLeaveType(
    { name: `Unreferenced Leave Type ${RUN_ID}`, defaultAnnualEntitlement: 5 },
    actor,
  );
  await leaveTypeService.deleteLeaveType(unreferenced.id, actor);

  const gone = await prisma.leaveType.findUnique({ where: { id: unreferenced.id } });
  assert.equal(gone, null);
});
