import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import assetService from './asset.service.js';
import assetAssignmentService from './assetAssignment.service.js';

// Integration coverage for Asset Management (docs/domain-asset-management.md)
// - the Asset registry and its status rules, the append-only custody
// ledger, the one-active-assignment invariant (ADR-AM02, at both the
// service and DB level), positive-allowlist assignability (ADR-AM03), the
// no-delete-with-history guard, and own/any read scoping. Runs against the
// real dev database - fixtures namespaced per run and fully cleaned up in
// `after`.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };

const createdAssetIds = [];
const createdEmployeeIds = [];
const createdUserIds = [];

let testDepartmentId;
let testDesignationId;

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `asset-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Asset Test Actor',
    },
  });
  actor.id = user.id;

  const department = await prisma.department.create({
    data: { name: `Asset Test Department ${RUN_ID}` },
  });
  testDepartmentId = department.id;

  const designation = await prisma.designation.create({
    data: { name: `Asset Test Designation ${RUN_ID}` },
  });
  testDesignationId = designation.id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [actor.id, ...createdUserIds] } } });
  if (createdAssetIds.length) {
    await prisma.assetAssignment.deleteMany({ where: { assetId: { in: createdAssetIds } } });
    await prisma.asset.deleteMany({ where: { id: { in: createdAssetIds } } });
  }
  if (createdEmployeeIds.length) {
    await prisma.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
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
      email: `asset-${label}-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: `Asset ${label}`,
    },
  });
  createdUserIds.push(user.id);
  return user;
};

const makeEmployee = async (userId = null) => {
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

const makeAsset = async (overrides = {}) => {
  const asset = await assetService.createAsset(
    { assetTag: `TAG-${RUN_ID}-${Date.now()}-${Math.random()}`, type: 'Laptop', ...overrides },
    actor,
  );
  createdAssetIds.push(asset.id);
  return asset;
};

test('createAsset: creates an AVAILABLE asset and rejects a duplicate tag case-insensitively', async () => {
  const asset = await makeAsset({ assetTag: `Dup-${RUN_ID}` });
  assert.equal(asset.status, 'AVAILABLE');

  await assert.rejects(
    () => assetService.createAsset({ assetTag: `dup-${RUN_ID}`, type: 'Phone' }, actor),
    { message: 'An asset with this tag already exists' },
  );

  const audit = await prisma.auditLog.findFirst({
    where: { entityType: 'Asset', entityId: asset.id, action: 'CREATE' },
  });
  assert.ok(audit);
});

test('listAssets: filters by status/type and searches by tag', async () => {
  const marker = `ListMark${RUN_ID}`;
  const laptop = await makeAsset({ assetTag: `${marker}-A`, type: 'Laptop' });
  await makeAsset({ assetTag: `${marker}-B`, type: 'Phone' });

  const all = await assetService.listAssets({
    page: 1,
    limit: 10,
    sortBy: 'assetTag',
    order: 'asc',
    search: marker,
  });
  assert.equal(all.pagination.total, 2);

  const phones = await assetService.listAssets({
    page: 1,
    limit: 10,
    sortBy: 'assetTag',
    order: 'asc',
    search: marker,
    type: 'phone',
  });
  assert.equal(phones.assets.length, 1);
  assert.equal(phones.assets[0].type, 'Phone');

  await assetService.updateAsset(laptop.id, { status: 'UNDER_REPAIR' }, actor);
  const repairs = await assetService.listAssets({
    page: 1,
    limit: 10,
    sortBy: 'assetTag',
    order: 'asc',
    search: marker,
    status: 'UNDER_REPAIR',
  });
  assert.deepEqual(
    repairs.assets.map((a) => a.id),
    [laptop.id],
  );
});

test('updateAsset: direct status transitions are guarded (RETIRED terminal, ASSIGNED not settable)', async () => {
  const asset = await makeAsset();

  const repair = await assetService.updateAsset(asset.id, { status: 'UNDER_REPAIR' }, actor);
  assert.equal(repair.status, 'UNDER_REPAIR');

  const back = await assetService.updateAsset(asset.id, { status: 'AVAILABLE' }, actor);
  assert.equal(back.status, 'AVAILABLE');

  const retired = await assetService.updateAsset(asset.id, { status: 'RETIRED' }, actor);
  assert.equal(retired.status, 'RETIRED');

  await assert.rejects(() => assetService.updateAsset(asset.id, { status: 'AVAILABLE' }, actor), {
    message: 'Cannot change asset status from RETIRED to AVAILABLE',
  });

  const employee = await makeEmployee();
  const assigned = await makeAsset();
  await assetAssignmentService.assignAsset(assigned.id, { employeeId: employee.id }, actor);
  await assert.rejects(
    () => assetService.updateAsset(assigned.id, { status: 'RETIRED' }, actor),
    { message: 'This asset is currently assigned - record its return before changing its status' },
  );
});

test('assignAsset: assigns an AVAILABLE asset, flips it to ASSIGNED, and rejects any non-AVAILABLE asset', async () => {
  const employee = await makeEmployee();
  const asset = await makeAsset();

  const assignment = await assetAssignmentService.assignAsset(
    asset.id,
    { employeeId: employee.id },
    actor,
  );
  assert.equal(assignment.employeeId, employee.id);
  assert.equal(assignment.returnedAt, null);
  assert.equal(assignment.assignedBy, actor.id);
  assert.equal((await assetService.getAssetById(asset.id)).status, 'ASSIGNED');

  // Already ASSIGNED - the positive-allowlist rule (ADR-AM03).
  await assert.rejects(
    () => assetAssignmentService.assignAsset(asset.id, { employeeId: employee.id }, actor),
    {
      message:
        'assetId: this asset is ASSIGNED and cannot be assigned - only AVAILABLE assets can be assigned',
    },
  );

  const repairing = await makeAsset();
  await assetService.updateAsset(repairing.id, { status: 'UNDER_REPAIR' }, actor);
  await assert.rejects(
    () => assetAssignmentService.assignAsset(repairing.id, { employeeId: employee.id }, actor),
    { message: /UNDER_REPAIR and cannot be assigned/ },
  );

  const freshAsset = await makeAsset();
  await assert.rejects(
    () =>
      assetAssignmentService.assignAsset(
        freshAsset.id,
        { employeeId: '00000000-0000-4000-8000-000000000000' },
        actor,
      ),
    { message: 'employeeId: references a record that does not exist' },
  );

  await assert.rejects(
    () =>
      assetAssignmentService.assignAsset(
        '00000000-0000-4000-8000-000000000000',
        { employeeId: employee.id },
        actor,
      ),
    { message: 'Asset not found' },
  );
});

test('assignAsset: the DB partial unique index rejects a second active assignment even if the status guard were bypassed', async () => {
  const employee = await makeEmployee();
  const asset = await makeAsset();
  await assetAssignmentService.assignAsset(asset.id, { employeeId: employee.id }, actor);

  await assert.rejects(
    () => prisma.assetAssignment.create({ data: { assetId: asset.id, employeeId: employee.id } }),
    (error) => error.code === 'P2002',
  );
});

test('assignAsset: concurrent assigns of the same asset yield exactly one active assignment', async () => {
  const first = await makeEmployee();
  const second = await makeEmployee();
  const asset = await makeAsset();

  const results = await Promise.allSettled([
    assetAssignmentService.assignAsset(asset.id, { employeeId: first.id }, actor),
    assetAssignmentService.assignAsset(asset.id, { employeeId: second.id }, actor),
  ]);

  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  assert.equal(await prisma.assetAssignment.count({ where: { assetId: asset.id, returnedAt: null } }), 1);
});

test('returnAsset: GOOD returns to AVAILABLE, DAMAGED to UNDER_REPAIR; history is kept and the asset can be reassigned', async () => {
  const first = await makeEmployee();
  const second = await makeEmployee();
  const asset = await makeAsset();

  await assetAssignmentService.assignAsset(asset.id, { employeeId: first.id }, actor);
  const returned = await assetAssignmentService.returnAsset(
    asset.id,
    { condition: 'GOOD', notes: 'All fine' },
    actor,
  );
  assert.ok(returned.returnedAt);
  assert.equal(returned.returnCondition, 'GOOD');
  assert.equal(returned.returnNotes, 'All fine');
  assert.equal(returned.returnedBy, actor.id);
  assert.equal((await assetService.getAssetById(asset.id)).status, 'AVAILABLE');

  await assetAssignmentService.assignAsset(asset.id, { employeeId: second.id }, actor);
  await assetAssignmentService.returnAsset(asset.id, { condition: 'DAMAGED' }, actor);
  assert.equal((await assetService.getAssetById(asset.id)).status, 'UNDER_REPAIR');

  const history = await assetAssignmentService.listAssignmentHistory(asset.id);
  assert.equal(history.length, 2);
  assert.ok(history.every((row) => row.returnedAt));

  await assert.rejects(
    () => assetAssignmentService.returnAsset(asset.id, { condition: 'GOOD' }, actor),
    { message: 'This asset is not currently assigned' },
  );
});

test('getCurrentHolder / getActiveAssignmentsForEmployee: the two reusable queries for Exit Management', async () => {
  const employee = await makeEmployee();
  const laptop = await makeAsset();
  const phone = await makeAsset({ type: 'Phone' });
  const spare = await makeAsset();

  assert.equal(await assetAssignmentService.getCurrentHolder(laptop.id), null);

  await assetAssignmentService.assignAsset(laptop.id, { employeeId: employee.id }, actor);
  await assetAssignmentService.assignAsset(phone.id, { employeeId: employee.id }, actor);

  const holder = await assetAssignmentService.getCurrentHolder(laptop.id);
  assert.equal(holder.employeeId, employee.id);

  await assetAssignmentService.returnAsset(phone.id, { condition: 'GOOD' }, actor);

  const active = await assetAssignmentService.getActiveAssignmentsForEmployee(employee.id);
  assert.deepEqual(
    active.map((row) => row.assetId),
    [laptop.id],
  );
  assert.ok(!active.some((row) => row.assetId === spare.id));
});

test('deleteAsset: only a never-assigned asset can be hard-deleted', async () => {
  const employee = await makeEmployee();
  const fresh = await makeAsset();
  await assetService.deleteAsset(fresh.id, actor);
  await assert.rejects(() => assetService.getAssetById(fresh.id), { message: 'Asset not found' });

  const used = await makeAsset();
  await assetAssignmentService.assignAsset(used.id, { employeeId: employee.id }, actor);
  await assetAssignmentService.returnAsset(used.id, { condition: 'GOOD' }, actor);

  await assert.rejects(() => assetService.deleteAsset(used.id, actor), {
    message: 'This asset has assignment history and cannot be deleted - retire it instead',
  });
});

test('assignment reads: read:any sees all, read:own is scoped to the caller and cannot open others', async () => {
  const ownerUser = await makeUser('owner');
  const otherUser = await makeUser('other');
  const owner = await makeEmployee(ownerUser.id);
  const other = await makeEmployee(otherUser.id);
  const mine = await makeAsset();
  const theirs = await makeAsset();

  const mineAssignment = await assetAssignmentService.assignAsset(
    mine.id,
    { employeeId: owner.id },
    actor,
  );
  const theirAssignment = await assetAssignmentService.assignAsset(
    theirs.id,
    { employeeId: other.id },
    actor,
  );

  const ownRequester = {
    id: ownerUser.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['assetAssignment:read:own'],
  };
  const anyRequester = {
    id: actor.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['assetAssignment:read:any'],
  };
  const query = { page: 1, limit: 10, sortBy: 'assignedAt', order: 'desc' };

  const ownList = await assetAssignmentService.listAssignments(query, ownRequester);
  assert.deepEqual(
    ownList.assignments.map((row) => row.id),
    [mineAssignment.id],
  );
  assert.equal(ownList.assignments[0].asset.id, mine.id);

  const anyList = await assetAssignmentService.listAssignments(
    { ...query, employeeId: other.id, active: true },
    anyRequester,
  );
  assert.deepEqual(
    anyList.assignments.map((row) => row.id),
    [theirAssignment.id],
  );

  assert.equal(
    (await assetAssignmentService.getAssignmentById(mineAssignment.id, ownRequester)).id,
    mineAssignment.id,
  );
  await assert.rejects(
    () => assetAssignmentService.getAssignmentById(theirAssignment.id, ownRequester),
    { message: 'You do not have permission to view this asset assignment' },
  );
  assert.equal(
    (await assetAssignmentService.getAssignmentById(theirAssignment.id, anyRequester)).id,
    theirAssignment.id,
  );
});

test('assign and return each write AuditLog rows for the assignment and the asset', async () => {
  const employee = await makeEmployee();
  const asset = await makeAsset();

  const assignment = await assetAssignmentService.assignAsset(
    asset.id,
    { employeeId: employee.id },
    actor,
  );
  await assetAssignmentService.returnAsset(asset.id, { condition: 'GOOD' }, actor);

  const assignmentLogs = await prisma.auditLog.findMany({
    where: { entityType: 'AssetAssignment', entityId: assignment.id },
    orderBy: { createdAt: 'asc' },
  });
  assert.deepEqual(
    assignmentLogs.map((log) => log.action),
    ['CREATE', 'UPDATE'],
  );

  const assetLogs = await prisma.auditLog.findMany({
    where: { entityType: 'Asset', entityId: asset.id, action: 'UPDATE' },
  });
  assert.equal(assetLogs.length, 2);
});
