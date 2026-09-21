import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import prisma from '../../config/database.js';
import exitCaseService from './exitCase.service.js';
import assetService from '../assets/asset.service.js';
import assetAssignmentService from '../assets/assetAssignment.service.js';
import employeeService from '../employees/employee.service.js';
import refreshTokenRepository from '../auth/refreshToken.repository.js';

// Integration coverage for Exit Management (docs/domain-exit-management.md) -
// the ExitCase lifecycle (INITIATED->SEPARATED->COMPLETED, WITHDRAWN only
// while INITIATED), the time-based separation trigger that invokes Identity's
// unmodified offboarding primitive exactly once (ADR-EM02), the clearance
// checklist (Asset Management read, DONE/WAIVED rules, auto-completion), and
// own/any permission scoping. Runs against the real dev database - fixtures
// namespaced per run and fully cleaned up in `after`.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };

const ADMIN_PERMISSIONS = [
  'exitCase:create:own',
  'exitCase:create:any',
  'exitCase:read:own',
  'exitCase:read:any',
  'exitCase:manage:any',
  'exitCase:withdraw:own',
];
const EMPLOYEE_PERMISSIONS = ['exitCase:create:own', 'exitCase:read:own', 'exitCase:withdraw:own'];

const createdCaseIds = [];
const createdEmployeeIds = [];
const createdUserIds = [];
const createdAssetIds = [];

let testDepartmentId;
let testDesignationId;

// A UTC calendar day offset from today, as the YYYY-MM-DD string the API takes.
const isoDay = (offsetDays = 0) => {
  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + offsetDays);
  return day.toISOString().slice(0, 10);
};

const admin = () => ({ ...actor, grantedPermissions: ADMIN_PERMISSIONS });
const asUser = (user, permissions = EMPLOYEE_PERMISSIONS) => ({
  id: user.id,
  ipAddress: '127.0.0.1',
  grantedPermissions: permissions,
});

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `exit-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Exit Test Actor',
    },
  });
  actor.id = user.id;

  const department = await prisma.department.create({
    data: { name: `Exit Test Department ${RUN_ID}` },
  });
  testDepartmentId = department.id;

  const designation = await prisma.designation.create({
    data: { name: `Exit Test Designation ${RUN_ID}` },
  });
  testDesignationId = designation.id;
});

after(async () => {
  const userIds = [actor.id, ...createdUserIds];
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  if (createdCaseIds.length) {
    await prisma.exitCase.deleteMany({ where: { id: { in: createdCaseIds } } });
  }
  if (createdAssetIds.length) {
    await prisma.assetAssignment.deleteMany({ where: { assetId: { in: createdAssetIds } } });
    await prisma.asset.deleteMany({ where: { id: { in: createdAssetIds } } });
  }
  if (createdEmployeeIds.length) {
    await prisma.exitCase.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
    await prisma.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
  }
  await prisma.department.delete({ where: { id: testDepartmentId } });
  await prisma.designation.delete({ where: { id: testDesignationId } });
  if (createdUserIds.length) {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.user.delete({ where: { id: actor.id } });
  await prisma.$disconnect();
});

const makeUser = async (label) => {
  const user = await prisma.user.create({
    data: {
      email: `exit-${label}-${RUN_ID}-${Math.random()}@example.com`,
      password: 'not-a-real-hash',
      name: `Exit ${label}`,
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

// An employee linked to a User, plus the User row itself.
const makeLinkedEmployee = async (label) => {
  const user = await makeUser(label);
  const employee = await makeEmployee(user.id);
  return { user, employee };
};

const makeCase = async (employeeId, overrides = {}) => {
  const exitCase = await exitCaseService.createExitCase(
    { employeeId, type: 'RESIGNATION', lastWorkingDay: isoDay(0), ...overrides },
    admin(),
  );
  createdCaseIds.push(exitCase.id);
  return exitCase;
};

const makeAsset = async () => {
  const asset = await assetService.createAsset(
    { assetTag: `EXIT-${RUN_ID}-${Date.now()}-${Math.random()}`, type: 'Laptop' },
    actor,
  );
  createdAssetIds.push(asset.id);
  return asset;
};

const itemOfType = (exitCase, type) => exitCase.clearanceItems.find((i) => i.type === type);

test('createExitCase: create:own initiates own RESIGNATION with the default checklist; TERMINATION and other-employee need create:any', async () => {
  const { user, employee } = await makeLinkedEmployee('self');
  const other = await makeEmployee();
  const asset = await makeAsset();
  await assetAssignmentService.assignAsset(asset.id, { employeeId: employee.id }, actor);

  // employeeId in the body is ignored for a self-initiating caller.
  const created = await exitCaseService.createExitCase(
    { employeeId: other.id, type: 'RESIGNATION', lastWorkingDay: isoDay(30), reason: 'Moving' },
    asUser(user),
  );
  createdCaseIds.push(created.id);

  assert.equal(created.employeeId, employee.id);
  assert.equal(created.status, 'INITIATED');
  assert.equal(created.initiatedBy, user.id);
  assert.equal(created.reason, 'Moving');
  assert.deepEqual(
    created.clearanceItems.map((i) => i.type).sort(),
    ['ACCESS_REVOCATION', 'ASSET_RETURN', 'FINAL_SETTLEMENT', 'KNOWLEDGE_TRANSFER'],
  );
  const assetItem = itemOfType(created, 'ASSET_RETURN');
  assert.equal(assetItem.assetId, asset.id);
  assert.ok(created.clearanceItems.every((i) => i.status === 'PENDING'));

  const audit = await prisma.auditLog.findFirst({
    where: { entityType: 'ExitCase', entityId: created.id, action: 'CREATE' },
  });
  assert.ok(audit);

  // A self-initiating caller can never start a TERMINATION.
  const { user: user2 } = await makeLinkedEmployee('self-term');
  await assert.rejects(
    () =>
      exitCaseService.createExitCase(
        { type: 'TERMINATION', lastWorkingDay: isoDay(10) },
        asUser(user2),
      ),
    { message: 'You do not have permission to initiate a termination' },
  );

  // create:any must name the employee.
  await assert.rejects(
    () => exitCaseService.createExitCase({ type: 'TERMINATION', lastWorkingDay: isoDay(10) }, admin()),
    { message: 'employeeId: required when initiating an exit case on behalf of an employee' },
  );

  // A caller with neither permission is refused.
  await assert.rejects(
    () =>
      exitCaseService.createExitCase(
        { type: 'RESIGNATION', lastWorkingDay: isoDay(10) },
        asUser(user2, []),
      ),
    { message: 'You do not have permission to initiate an exit case' },
  );
});

test('createExitCase: rejects a missing employee, a past lastWorkingDay and a second open case (service and DB)', async () => {
  const employee = await makeEmployee();

  await assert.rejects(
    () =>
      exitCaseService.createExitCase(
        {
          employeeId: '00000000-0000-4000-8000-000000000000',
          type: 'RESIGNATION',
          lastWorkingDay: isoDay(5),
        },
        admin(),
      ),
    { message: 'employeeId: references a record that does not exist' },
  );

  await assert.rejects(
    () =>
      exitCaseService.createExitCase(
        { employeeId: employee.id, type: 'RESIGNATION', lastWorkingDay: isoDay(-1) },
        admin(),
      ),
    { message: 'lastWorkingDay: cannot be before the date the exit case is initiated' },
  );

  await makeCase(employee.id, { lastWorkingDay: isoDay(5) });

  await assert.rejects(
    () =>
      exitCaseService.createExitCase(
        { employeeId: employee.id, type: 'TERMINATION', lastWorkingDay: isoDay(5) },
        admin(),
      ),
    { message: 'This employee already has an open exit case' },
  );

  // The DB partial unique index rejects it even if the service check were bypassed.
  await assert.rejects(
    () =>
      prisma.exitCase.create({
        data: {
          employeeId: employee.id,
          type: 'TERMINATION',
          lastWorkingDay: new Date(`${isoDay(5)}T00:00:00.000Z`),
        },
      }),
    (error) => error.code === 'P2002',
  );
});

test('separateExitCase: refuses before lastWorkingDay; on/after it, invokes offboarding once, revokes access and resolves the access item', async () => {
  const { user, employee } = await makeLinkedEmployee('separate');
  await refreshTokenRepository.create({
    tokenHash: crypto.createHash('sha256').update(`rt-${RUN_ID}-${Math.random()}`).digest('hex'),
    userId: user.id,
    expiresAt: new Date(Date.now() + 3600 * 1000),
  });

  const future = await makeCase(employee.id, { lastWorkingDay: isoDay(3) });
  await assert.rejects(() => exitCaseService.separateExitCase(future.id, {}, admin()), {
    message: `The last working day (${isoDay(3)}) has not arrived yet`,
  });
  // The refusal left the employee untouched.
  assert.equal((await prisma.employee.findUnique({ where: { id: employee.id } })).deletedAt, null);

  // Move the date to today (lastWorkingDay may be edited while INITIATED).
  await exitCaseService.updateExitCase(future.id, { lastWorkingDay: isoDay(0) }, admin());

  const separated = await exitCaseService.separateExitCase(
    future.id,
    { eligibleForRehire: true, rehireNote: 'Good standing' },
    admin(),
  );

  assert.equal(separated.status, 'SEPARATED');
  assert.ok(separated.separatedAt);
  assert.equal(separated.eligibleForRehire, true);
  assert.equal(separated.rehireNote, 'Good standing');
  assert.equal(itemOfType(separated, 'ACCESS_REVOCATION').status, 'DONE');
  assert.equal(itemOfType(separated, 'FINAL_SETTLEMENT').status, 'PENDING');

  // Identity's primitive ran: Employee soft-deleted, sessions revoked (ADR-006).
  const row = await prisma.employee.findUnique({ where: { id: employee.id } });
  assert.ok(row.deletedAt);
  const revokedUser = await prisma.user.findUnique({ where: { id: user.id } });
  assert.ok(revokedUser.tokensValidAfter);
  assert.equal(
    await prisma.refreshToken.count({ where: { userId: user.id, revoked: false } }),
    0,
  );

  // Exactly once: a second separate is refused.
  await assert.rejects(() => exitCaseService.separateExitCase(future.id, {}, admin()), {
    message: 'Only an INITIATED exit case can be separated',
  });

  const employeeDeleteAudits = await prisma.auditLog.count({
    where: { entityType: 'Employee', entityId: employee.id, action: 'DELETE' },
  });
  assert.equal(employeeDeleteAudits, 1);
  const caseUpdateAudits = await prisma.auditLog.count({
    where: { entityType: 'ExitCase', entityId: future.id, action: 'UPDATE' },
  });
  assert.equal(caseUpdateAudits, 2); // the lastWorkingDay edit + the separation
});

test('separateExitCase: concurrent separations yield exactly one success and one offboarding', async () => {
  const employee = await makeEmployee();
  const exitCase = await makeCase(employee.id);

  const results = await Promise.allSettled([
    exitCaseService.separateExitCase(exitCase.id, {}, admin()),
    exitCaseService.separateExitCase(exitCase.id, {}, admin()),
  ]);

  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  assert.equal(
    await prisma.auditLog.count({
      where: { entityType: 'Employee', entityId: employee.id, action: 'DELETE' },
    }),
    1,
  );
});

test('separateExitCase: an employee already offboarded via the direct primitive is not offboarded twice', async () => {
  const employee = await makeEmployee();
  const exitCase = await makeCase(employee.id);

  await employeeService.softDeleteEmployee(employee.id, actor);

  const separated = await exitCaseService.separateExitCase(exitCase.id, {}, admin());
  assert.equal(separated.status, 'SEPARATED');
  assert.equal(
    await prisma.auditLog.count({
      where: { entityType: 'Employee', entityId: employee.id, action: 'DELETE' },
    }),
    1,
  );
});

test('clearance items: asset return is verified against Asset Management, WAIVED needs a reason, and resolving the last item completes a SEPARATED case', async () => {
  const employee = await makeEmployee();
  const asset = await makeAsset();
  await assetAssignmentService.assignAsset(asset.id, { employeeId: employee.id }, actor);
  const exitCase = await makeCase(employee.id, { lastWorkingDay: isoDay(0) });
  const assetItem = itemOfType(exitCase, 'ASSET_RETURN');
  const knowledge = itemOfType(exitCase, 'KNOWLEDGE_TRANSFER');
  const settlement = itemOfType(exitCase, 'FINAL_SETTLEMENT');
  const access = itemOfType(exitCase, 'ACCESS_REVOCATION');

  // The access item is resolved by separation only.
  await assert.rejects(
    () => exitCaseService.updateClearanceItem(exitCase.id, access.id, { status: 'DONE' }, admin()),
    { message: 'The system access revocation item is resolved automatically at separation' },
  );

  // Still held -> cannot be marked DONE.
  await assert.rejects(
    () => exitCaseService.updateClearanceItem(exitCase.id, assetItem.id, { status: 'DONE' }, admin()),
    {
      message:
        'This asset is still assigned to the employee - record its return in Asset Management, or waive this item',
    },
  );

  // WAIVED requires a reason.
  await assert.rejects(
    () => exitCaseService.updateClearanceItem(exitCase.id, assetItem.id, { status: 'WAIVED' }, admin()),
    { message: 'waivedReason: required when waiving a clearance item' },
  );

  // A custom item can be added while open.
  const custom = await exitCaseService.addClearanceItem(exitCase.id, { title: 'Return ID card' }, admin());
  assert.equal(custom.type, 'OTHER');
  assert.equal(custom.status, 'PENDING');

  await exitCaseService.separateExitCase(exitCase.id, {}, admin());

  // Record the return in Asset Management, then the item may be DONE.
  await assetAssignmentService.returnAsset(asset.id, { condition: 'GOOD' }, actor);
  const done = await exitCaseService.updateClearanceItem(
    exitCase.id,
    assetItem.id,
    { status: 'DONE' },
    admin(),
  );
  assert.equal(done.clearanceItem.status, 'DONE');
  assert.ok(done.clearanceItem.resolvedAt);
  assert.equal(done.exitCaseStatus, 'SEPARATED');

  const waived = await exitCaseService.updateClearanceItem(
    exitCase.id,
    knowledge.id,
    { status: 'WAIVED', waivedReason: 'No handover needed' },
    admin(),
  );
  assert.equal(waived.clearanceItem.waivedReason, 'No handover needed');

  await exitCaseService.updateClearanceItem(exitCase.id, custom.id, { status: 'DONE' }, admin());

  // Reopening then resolving again is allowed while the case is open.
  const reopened = await exitCaseService.updateClearanceItem(
    exitCase.id,
    knowledge.id,
    { status: 'PENDING' },
    admin(),
  );
  assert.equal(reopened.clearanceItem.waivedReason, null);
  assert.equal(reopened.clearanceItem.resolvedAt, null);

  await exitCaseService.updateClearanceItem(
    exitCase.id,
    knowledge.id,
    { status: 'DONE' },
    admin(),
  );

  // The last PENDING item (final settlement) completes the case.
  const last = await exitCaseService.updateClearanceItem(
    exitCase.id,
    settlement.id,
    { status: 'DONE' },
    admin(),
  );
  assert.equal(last.exitCaseStatus, 'COMPLETED');

  const completed = await exitCaseService.getExitCaseById(exitCase.id, admin());
  assert.equal(completed.status, 'COMPLETED');
  assert.ok(completed.completedAt);

  // A completed case is closed to edits and new items.
  await assert.rejects(
    () => exitCaseService.updateClearanceItem(exitCase.id, settlement.id, { status: 'PENDING' }, admin()),
    { message: 'A COMPLETED exit case can no longer be edited' },
  );
  await assert.rejects(
    () => exitCaseService.addClearanceItem(exitCase.id, { title: 'Too late' }, admin()),
    { message: 'Clearance items cannot be added to a COMPLETED exit case' },
  );
  await assert.rejects(() => exitCaseService.updateExitCase(exitCase.id, { reason: 'x' }, admin()), {
    message: 'A COMPLETED exit case can no longer be edited, except its rehire fields',
  });
  // ...except the rehire fields, which must stay recordable (ADR-EM04).
  const rehire = await exitCaseService.updateExitCase(
    exitCase.id,
    { eligibleForRehire: true, rehireNote: 'Recorded after completion' },
    admin(),
  );
  assert.equal(rehire.eligibleForRehire, true);
  assert.equal(rehire.status, 'COMPLETED');

  // An item id from another case is not found under this one.
  const otherEmployee = await makeEmployee();
  const otherCase = await makeCase(otherEmployee.id, { lastWorkingDay: isoDay(5) });
  await assert.rejects(
    () =>
      exitCaseService.updateClearanceItem(
        otherCase.id,
        assetItem.id,
        { status: 'DONE' },
        admin(),
      ),
    { message: 'Clearance item not found' },
  );
});

test('separateExitCase: an asset handed out after initiation gets an ASSET_RETURN item at separation, and a WAIVED asset item lets the case close', async () => {
  const employee = await makeEmployee();
  const exitCase = await makeCase(employee.id, { lastWorkingDay: isoDay(0) });
  assert.equal(exitCase.clearanceItems.filter((i) => i.type === 'ASSET_RETURN').length, 0);

  const lateAsset = await makeAsset();
  await assetAssignmentService.assignAsset(lateAsset.id, { employeeId: employee.id }, actor);

  const separated = await exitCaseService.separateExitCase(exitCase.id, {}, admin());
  const assetItem = itemOfType(separated, 'ASSET_RETURN');
  assert.equal(assetItem.assetId, lateAsset.id);

  // Lost laptop: waived with a reason so it does not block closure forever.
  await exitCaseService.updateClearanceItem(
    exitCase.id,
    assetItem.id,
    { status: 'WAIVED', waivedReason: 'Reported lost' },
    admin(),
  );
  await exitCaseService.updateClearanceItem(
    exitCase.id,
    itemOfType(separated, 'KNOWLEDGE_TRANSFER').id,
    { status: 'DONE' },
    admin(),
  );
  const final = await exitCaseService.updateClearanceItem(
    exitCase.id,
    itemOfType(separated, 'FINAL_SETTLEMENT').id,
    { status: 'DONE' },
    admin(),
  );
  assert.equal(final.exitCaseStatus, 'COMPLETED');
});

test('withdrawExitCase: own resignation only before the last working day; ADMIN may withdraw either type; nothing after separation', async () => {
  const { user, employee } = await makeLinkedEmployee('withdraw');
  const { user: strangerUser } = await makeLinkedEmployee('stranger');

  const resignation = await makeCase(employee.id, { lastWorkingDay: isoDay(10) });

  // Someone else's case: refused.
  await assert.rejects(() => exitCaseService.withdrawExitCase(resignation.id, asUser(strangerUser)), {
    message: 'You do not have permission to withdraw this exit case',
  });

  const withdrawn = await exitCaseService.withdrawExitCase(resignation.id, asUser(user));
  assert.equal(withdrawn.status, 'WITHDRAWN');
  await assert.rejects(() => exitCaseService.withdrawExitCase(resignation.id, admin()), {
    message:
      'Only an INITIATED exit case can be withdrawn - once separated, reversal is a rehire, not a withdrawal',
  });

  // After the last working day has arrived, the employee can no longer rescind.
  const due = await makeCase(employee.id, { lastWorkingDay: isoDay(0) });
  await assert.rejects(() => exitCaseService.withdrawExitCase(due.id, asUser(user)), {
    message: 'The last working day has arrived - this resignation can no longer be withdrawn',
  });
  // ...but an ADMIN still can, while it is INITIATED.
  assert.equal((await exitCaseService.withdrawExitCase(due.id, admin())).status, 'WITHDRAWN');

  // An involuntary TERMINATION is not the employee's to withdraw; ADMIN's to.
  const termination = await makeCase(employee.id, { type: 'TERMINATION', lastWorkingDay: isoDay(10) });
  await assert.rejects(() => exitCaseService.withdrawExitCase(termination.id, asUser(user)), {
    message: 'You do not have permission to withdraw this exit case',
  });
  assert.equal((await exitCaseService.withdrawExitCase(termination.id, admin())).status, 'WITHDRAWN');

  // Once separated, withdrawal is closed - reversal is a rehire.
  const separatedEmployee = await makeEmployee();
  const separatedCase = await makeCase(separatedEmployee.id);
  await exitCaseService.separateExitCase(separatedCase.id, {}, admin());
  await assert.rejects(() => exitCaseService.withdrawExitCase(separatedCase.id, admin()), {
    message:
      'Only an INITIATED exit case can be withdrawn - once separated, reversal is a rehire, not a withdrawal',
  });
});

test('updateExitCase: lastWorkingDay only while INITIATED and not before initiation; rehire fields editable after separation', async () => {
  const employee = await makeEmployee();
  const exitCase = await makeCase(employee.id, { lastWorkingDay: isoDay(10) });

  await assert.rejects(
    () => exitCaseService.updateExitCase(exitCase.id, { lastWorkingDay: isoDay(-2) }, admin()),
    { message: 'lastWorkingDay: cannot be before the date the exit case was initiated' },
  );

  const updated = await exitCaseService.updateExitCase(
    exitCase.id,
    { lastWorkingDay: isoDay(0), reason: 'Brought forward' },
    admin(),
  );
  assert.equal(updated.reason, 'Brought forward');
  assert.equal(updated.lastWorkingDay.toISOString().slice(0, 10), isoDay(0));

  await exitCaseService.separateExitCase(exitCase.id, {}, admin());

  await assert.rejects(
    () => exitCaseService.updateExitCase(exitCase.id, { lastWorkingDay: isoDay(5) }, admin()),
    { message: 'lastWorkingDay can only be changed while the exit case is INITIATED' },
  );

  const rehire = await exitCaseService.updateExitCase(
    exitCase.id,
    { eligibleForRehire: false, rehireNote: 'Policy breach' },
    admin(),
  );
  assert.equal(rehire.eligibleForRehire, false);
  assert.equal(rehire.rehireNote, 'Policy breach');
});

test('reads: read:any lists everything, read:own is auto-scoped and cannot open another employee\'s case', async () => {
  const { user: ownerUser, employee: owner } = await makeLinkedEmployee('reader');
  const other = await makeEmployee();
  const mine = await makeCase(owner.id, { lastWorkingDay: isoDay(20) });
  const theirs = await makeCase(other.id, { lastWorkingDay: isoDay(20), type: 'TERMINATION' });

  const query = { page: 1, limit: 10, sortBy: 'createdAt', order: 'desc' };

  const ownList = await exitCaseService.listExitCases(query, asUser(ownerUser));
  assert.deepEqual(
    ownList.exitCases.map((c) => c.id),
    [mine.id],
  );

  // Passing someone else's employeeId does not widen an own-scoped caller.
  const spoofed = await exitCaseService.listExitCases(
    { ...query, employeeId: other.id },
    asUser(ownerUser),
  );
  assert.deepEqual(
    spoofed.exitCases.map((c) => c.id),
    [mine.id],
  );

  const anyList = await exitCaseService.listExitCases(
    { ...query, employeeId: other.id, type: 'TERMINATION', status: 'INITIATED' },
    admin(),
  );
  assert.deepEqual(
    anyList.exitCases.map((c) => c.id),
    [theirs.id],
  );

  assert.equal((await exitCaseService.getExitCaseById(mine.id, asUser(ownerUser))).id, mine.id);
  assert.equal((await exitCaseService.getExitCaseById(mine.id, asUser(ownerUser))).clearanceItems.length, 3);
  await assert.rejects(() => exitCaseService.getExitCaseById(theirs.id, asUser(ownerUser)), {
    message: 'You do not have permission to view this exit case',
  });
  assert.equal((await exitCaseService.getExitCaseById(theirs.id, admin())).id, theirs.id);
});

test('processDueSeparations: separates due cases and leaves future ones (skipped if unrelated due cases exist)', async (t) => {
  const foreignDue = await prisma.exitCase.count({
    where: {
      status: 'INITIATED',
      lastWorkingDay: { lte: new Date(`${isoDay(0)}T00:00:00.000Z`) },
      id: { notIn: createdCaseIds },
      employeeId: { notIn: createdEmployeeIds },
    },
  });

  if (foreignDue > 0) {
    // The sweep is system-wide; never let a test offboard real data.
    t.skip('unrelated due exit cases exist in this database');
    return;
  }

  const dueEmployee = await makeEmployee();
  const futureEmployee = await makeEmployee();
  const dueCase = await makeCase(dueEmployee.id, { lastWorkingDay: isoDay(0) });
  const futureCase = await makeCase(futureEmployee.id, { lastWorkingDay: isoDay(7) });

  const result = await exitCaseService.processDueSeparations(admin());

  assert.ok(result.separated.includes(dueCase.id));
  assert.ok(!result.separated.includes(futureCase.id));
  assert.equal(result.failed.length, 0);
  assert.equal(
    (await prisma.exitCase.findUnique({ where: { id: futureCase.id } })).status,
    'INITIATED',
  );
  assert.equal(
    (await prisma.exitCase.findUnique({ where: { id: dueCase.id } })).status,
    'SEPARATED',
  );
});

test('updateClearanceItem: concurrent resolution of the last two items still completes the case (no lost completion)', async () => {
  const employee = await makeEmployee();
  const exitCase = await makeCase(employee.id);
  const separated = await exitCaseService.separateExitCase(exitCase.id, {}, admin());

  const knowledge = itemOfType(separated, 'KNOWLEDGE_TRANSFER');
  const settlement = itemOfType(separated, 'FINAL_SETTLEMENT');

  const results = await Promise.all([
    exitCaseService.updateClearanceItem(exitCase.id, knowledge.id, { status: 'DONE' }, admin()),
    exitCaseService.updateClearanceItem(exitCase.id, settlement.id, { status: 'DONE' }, admin()),
  ]);

  assert.ok(results.some((r) => r.exitCaseStatus === 'COMPLETED'));
  assert.equal(
    (await prisma.exitCase.findUnique({ where: { id: exitCase.id } })).status,
    'COMPLETED',
  );
});

test('updateClearanceItem / addClearanceItem: a case that closed after the read is refused, not written to', async () => {
  const employee = await makeEmployee();
  const exitCase = await makeCase(employee.id);
  const separated = await exitCaseService.separateExitCase(exitCase.id, {}, admin());
  const items = ['KNOWLEDGE_TRANSFER', 'FINAL_SETTLEMENT'].map((type) => itemOfType(separated, type));

  for (const item of items) {
    await exitCaseService.updateClearanceItem(exitCase.id, item.id, { status: 'DONE' }, admin());
  }

  await assert.rejects(() => exitCaseService.addClearanceItem(exitCase.id, { title: 'Late' }, admin()), {
    message: 'Clearance items cannot be added to a COMPLETED exit case',
  });
  assert.equal(await prisma.clearanceItem.count({ where: { exitCaseId: exitCase.id, title: 'Late' } }), 0);
});

test('separateExitCase: an asset returned and then re-issued gets a fresh item, but a waived (lost) asset is not resurrected', async () => {
  const employee = await makeEmployee();
  const returnedAsset = await makeAsset();
  const lostAsset = await makeAsset();
  await assetAssignmentService.assignAsset(returnedAsset.id, { employeeId: employee.id }, actor);
  await assetAssignmentService.assignAsset(lostAsset.id, { employeeId: employee.id }, actor);

  const exitCase = await makeCase(employee.id, { lastWorkingDay: isoDay(0) });
  const returnedItem = exitCase.clearanceItems.find((i) => i.assetId === returnedAsset.id);
  const lostItem = exitCase.clearanceItems.find((i) => i.assetId === lostAsset.id);

  // Asset A: returned, item DONE, then re-issued to the same employee.
  await assetAssignmentService.returnAsset(returnedAsset.id, { condition: 'GOOD' }, actor);
  await exitCaseService.updateClearanceItem(exitCase.id, returnedItem.id, { status: 'DONE' }, admin());
  await assetAssignmentService.assignAsset(returnedAsset.id, { employeeId: employee.id }, actor);

  // Asset B: reported lost, item WAIVED, still on the ledger.
  await exitCaseService.updateClearanceItem(
    exitCase.id,
    lostItem.id,
    { status: 'WAIVED', waivedReason: 'Lost' },
    admin(),
  );

  const separated = await exitCaseService.separateExitCase(exitCase.id, {}, admin());

  const forReturned = separated.clearanceItems.filter((i) => i.assetId === returnedAsset.id);
  const forLost = separated.clearanceItems.filter((i) => i.assetId === lostAsset.id);
  assert.deepEqual(forReturned.map((i) => i.status).sort(), ['DONE', 'PENDING']);
  assert.deepEqual(forLost.map((i) => i.status), ['WAIVED']);
});

test('the checklist is returned in a stable order: asset returns first, access revocation last', async () => {
  const employee = await makeEmployee();
  const asset = await makeAsset();
  await assetAssignmentService.assignAsset(asset.id, { employeeId: employee.id }, actor);
  const exitCase = await makeCase(employee.id, { lastWorkingDay: isoDay(9) });

  const expected = ['ASSET_RETURN', 'KNOWLEDGE_TRANSFER', 'FINAL_SETTLEMENT', 'ACCESS_REVOCATION'];
  assert.deepEqual(
    exitCase.clearanceItems.map((i) => i.type),
    expected,
  );

  const reread = await exitCaseService.getExitCaseById(exitCase.id, admin());
  assert.deepEqual(
    reread.clearanceItems.map((i) => i.type),
    expected,
  );
});
