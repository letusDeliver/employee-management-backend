import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import leaveService from './leave.service.js';
import leaveTypeService from '../leaveTypes/leaveType.service.js';
import attendanceService from '../attendance/attendance.service.js';

// Integration coverage for the Leave domain (docs/domain-leave.md) - its
// three aggregates (LeaveType, LeaveRequest, LeaveBalance), the approval
// workflow, holiday/week-off-excluded duration, and the new Attendance
// ON_LEAVE integration. Runs against the real dev database - fixtures
// namespaced per run and fully cleaned up in `after`.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };

const createdEmployeeIds = [];
const createdUserIds = [];
const createdLeaveTypeIds = [];
const createdBranchIds = [];
const createdCalendarIds = [];
const createdShiftIds = [];

let testDepartmentId;
let testDesignationId;
let testLeaveTypeId;

const WEEKDAY_NAMES = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `leave-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Leave Test Actor',
    },
  });
  actor.id = user.id;

  const department = await prisma.department.create({
    data: { name: `Leave Test Department ${RUN_ID}` },
  });
  testDepartmentId = department.id;

  const designation = await prisma.designation.create({
    data: { name: `Leave Test Designation ${RUN_ID}` },
  });
  testDesignationId = designation.id;

  const leaveType = await leaveTypeService.createLeaveType(
    { name: `Test Annual Leave ${RUN_ID}`, defaultAnnualEntitlement: 24 },
    actor,
  );
  testLeaveTypeId = leaveType.id;
  createdLeaveTypeIds.push(leaveType.id);
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
  await prisma.leaveRequest.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
  await prisma.leaveBalance.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
  if (createdEmployeeIds.length) {
    await prisma.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
  }
  if (createdShiftIds.length) {
    await prisma.shift.deleteMany({ where: { id: { in: createdShiftIds } } });
  }
  if (createdBranchIds.length) {
    await prisma.branch.deleteMany({ where: { id: { in: createdBranchIds } } });
  }
  if (createdCalendarIds.length) {
    await prisma.holidayCalendar.deleteMany({ where: { id: { in: createdCalendarIds } } });
  }
  if (createdLeaveTypeIds.length) {
    await prisma.leaveType.deleteMany({ where: { id: { in: createdLeaveTypeIds } } });
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
      email: `leave-${label}-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: `Leave ${label}`,
    },
  });
  createdUserIds.push(user.id);
  return user;
};

const makeEmployee = async ({ userId, managerId, dateOfJoining, branchId, shiftId } = {}) => {
  const employee = await prisma.employee.create({
    data: {
      userId,
      departmentId: testDepartmentId,
      designationId: testDesignationId,
      employmentType: 'FULL_TIME',
      salary: 1000,
      dateOfJoining: dateOfJoining ?? new Date('2020-01-01'),
      managerId,
      branchId,
      shiftId,
    },
  });
  createdEmployeeIds.push(employee.id);
  return employee;
};

test('creates a leave request (PENDING) and rejects an overlapping one', async () => {
  const user = await makeUser('applicant');
  await makeEmployee({ userId: user.id });

  const request = await leaveService.createLeaveRequest(
    {
      leaveTypeId: testLeaveTypeId,
      startDate: new Date(Date.UTC(2027, 3, 5)),
      endDate: new Date(Date.UTC(2027, 3, 7)),
      reason: 'Trip',
    },
    { id: user.id, ipAddress: '127.0.0.1' },
  );
  assert.equal(request.status, 'PENDING');
  assert.equal(request.durationDays, null);

  await assert.rejects(
    () =>
      leaveService.createLeaveRequest(
        {
          leaveTypeId: testLeaveTypeId,
          startDate: new Date(Date.UTC(2027, 3, 6)),
          endDate: new Date(Date.UTC(2027, 3, 8)),
        },
        { id: user.id, ipAddress: '127.0.0.1' },
      ),
    {
      message:
        'This employee already has a pending or approved leave request overlapping these dates',
    },
  );
});

test('createLeaveRequest rejects an inactive or nonexistent leaveTypeId', async () => {
  const user = await makeUser('bad-leavetype-applicant');
  await makeEmployee({ userId: user.id });

  await assert.rejects(
    () =>
      leaveService.createLeaveRequest(
        {
          leaveTypeId: '00000000-0000-0000-0000-000000000000',
          startDate: new Date(Date.UTC(2027, 4, 1)),
          endDate: new Date(Date.UTC(2027, 4, 2)),
        },
        { id: user.id, ipAddress: '127.0.0.1' },
      ),
    { message: 'leaveTypeId: references a record that does not exist' },
  );
});

test('a MANAGER (decide:reports) can approve their own report but not another employee\'s request', async () => {
  const managerUser = await makeUser('manager');
  const manager = await makeEmployee({ userId: managerUser.id });

  const reportUser = await makeUser('report');
  await makeEmployee({ userId: reportUser.id, managerId: manager.id });

  const otherUser = await makeUser('non-report');
  await makeEmployee({ userId: otherUser.id });

  const reportRequest = await leaveService.createLeaveRequest(
    {
      leaveTypeId: testLeaveTypeId,
      startDate: new Date(Date.UTC(2027, 5, 1)),
      endDate: new Date(Date.UTC(2027, 5, 2)),
    },
    { id: reportUser.id, ipAddress: '127.0.0.1' },
  );

  const otherRequest = await leaveService.createLeaveRequest(
    {
      leaveTypeId: testLeaveTypeId,
      startDate: new Date(Date.UTC(2027, 5, 1)),
      endDate: new Date(Date.UTC(2027, 5, 2)),
    },
    { id: otherUser.id, ipAddress: '127.0.0.1' },
  );

  const approved = await leaveService.approveLeaveRequest(reportRequest.id, {
    id: managerUser.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['leaveRequest:decide:reports'],
  });
  assert.equal(approved.status, 'APPROVED');

  await assert.rejects(
    () =>
      leaveService.approveLeaveRequest(otherRequest.id, {
        id: managerUser.id,
        ipAddress: '127.0.0.1',
        grantedPermissions: ['leaveRequest:decide:reports'],
      }),
    { message: 'You do not have permission to decide this leave request' },
  );
});

test('approval computes holiday/week-off-excluded duration and deducts the balance', async () => {
  const calendar = await prisma.holidayCalendar.create({
    data: { name: `Leave Test Calendar ${RUN_ID}` },
  });
  createdCalendarIds.push(calendar.id);

  const branch = await prisma.branch.create({
    data: { name: `Leave Test Branch ${RUN_ID}`, holidayCalendarId: calendar.id },
  });
  createdBranchIds.push(branch.id);

  const shift = await prisma.shift.create({
    data: {
      name: `Leave Test Shift ${RUN_ID}`,
      startTime: '09:00',
      endTime: '18:00',
      workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    },
  });
  createdShiftIds.push(shift.id);

  // A full 7-day window always contains each weekday exactly once,
  // regardless of what weekday RANGE_START itself falls on - so exactly 2
  // of the 7 days are week-offs (SATURDAY/SUNDAY) deterministically.
  const RANGE_START = new Date(Date.UTC(2027, 6, 1));
  const RANGE_END = new Date(Date.UTC(2027, 6, 7));

  // Place a holiday on the first day within the range that would
  // otherwise count as a working day, so it exercises the holiday leg
  // without coincidentally overlapping the week-off leg.
  let holidayDate;
  for (let i = 0; i <= 6; i += 1) {
    const candidate = new Date(Date.UTC(2027, 6, 1 + i));
    if (['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].includes(
      WEEKDAY_NAMES[candidate.getUTCDay()],
    )) {
      holidayDate = candidate;
      break;
    }
  }
  await prisma.holiday.create({
    data: { holidayCalendarId: calendar.id, date: holidayDate, name: 'Test Holiday' },
  });

  const managerUser = await makeUser('duration-manager');
  const manager = await makeEmployee({ userId: managerUser.id });
  const reportUser = await makeUser('duration-report');
  await makeEmployee({ userId: reportUser.id, managerId: manager.id, branchId: branch.id, shiftId: shift.id });

  const request = await leaveService.createLeaveRequest(
    { leaveTypeId: testLeaveTypeId, startDate: RANGE_START, endDate: RANGE_END },
    { id: reportUser.id, ipAddress: '127.0.0.1' },
  );

  const approved = await leaveService.approveLeaveRequest(request.id, {
    id: managerUser.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['leaveRequest:decide:reports'],
  });

  // 7-day range - 2 week-off days - 1 holiday = 4 chargeable days.
  assert.equal(approved.durationDays.toString(), '4');

  const balance = await prisma.leaveBalance.findFirst({
    where: { employeeId: approved.employeeId, leaveTypeId: testLeaveTypeId, year: 2027 },
  });
  assert.equal(balance.consumed.toString(), '4');
});

test('approval rejects when it would drive the balance negative', async () => {
  const user = await makeUser('overdraft-applicant');
  const employee = await makeEmployee({ userId: user.id, dateOfJoining: new Date('2020-01-01') });

  // Force a tiny existing balance directly, bypassing the normal lazy
  // proration path, so the overdraft scenario is deterministic.
  await prisma.leaveBalance.create({
    data: { employeeId: employee.id, leaveTypeId: testLeaveTypeId, year: 2027, entitlement: 1, consumed: 0 },
  });

  const request = await leaveService.createLeaveRequest(
    {
      leaveTypeId: testLeaveTypeId,
      // This employee has no Branch/Shift assigned, so every day in the
      // range counts as chargeable (no holiday/week-off exclusion is
      // possible without them) - a 5-day span here is always exactly 5
      // chargeable days, regardless of which real weekdays it lands on.
      startDate: new Date(Date.UTC(2027, 7, 2)),
      endDate: new Date(Date.UTC(2027, 7, 6)),
    },
    { id: user.id, ipAddress: '127.0.0.1' },
  );

  await assert.rejects(
    () =>
      leaveService.approveLeaveRequest(request.id, {
        id: actor.id,
        ipAddress: '127.0.0.1',
        grantedPermissions: ['leaveRequest:decide:any'],
      }),
    (error) => error.message.startsWith('Insufficient leave balance'),
  );
});

test('rejectLeaveRequest only accepts a Pending request and applies no balance change', async () => {
  const managerUser = await makeUser('reject-manager');
  const manager = await makeEmployee({ userId: managerUser.id });
  const reportUser = await makeUser('reject-report');
  await makeEmployee({ userId: reportUser.id, managerId: manager.id });

  const request = await leaveService.createLeaveRequest(
    {
      leaveTypeId: testLeaveTypeId,
      startDate: new Date(Date.UTC(2027, 8, 1)),
      endDate: new Date(Date.UTC(2027, 8, 1)),
    },
    { id: reportUser.id, ipAddress: '127.0.0.1' },
  );

  const rejected = await leaveService.rejectLeaveRequest(
    request.id,
    { reason: 'Too many out that week' },
    { id: managerUser.id, ipAddress: '127.0.0.1', grantedPermissions: ['leaveRequest:decide:reports'] },
  );
  assert.equal(rejected.status, 'REJECTED');

  await assert.rejects(
    () =>
      leaveService.rejectLeaveRequest(request.id, {}, {
        id: managerUser.id,
        ipAddress: '127.0.0.1',
        grantedPermissions: ['leaveRequest:decide:reports'],
      }),
    { message: 'Only a pending leave request can be rejected' },
  );
});

test('cancelLeaveRequest: Pending cancels freely; future-dated Approved restores balance; already-started Approved is rejected', async () => {
  const user = await makeUser('cancel-applicant');
  await makeEmployee({ userId: user.id, dateOfJoining: new Date('2020-01-01') });

  const pending = await leaveService.createLeaveRequest(
    {
      leaveTypeId: testLeaveTypeId,
      startDate: new Date(Date.UTC(2027, 9, 1)),
      endDate: new Date(Date.UTC(2027, 9, 1)),
    },
    { id: user.id, ipAddress: '127.0.0.1' },
  );
  const cancelledPending = await leaveService.cancelLeaveRequest(pending.id, {
    id: user.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: [],
  });
  assert.equal(cancelledPending.status, 'CANCELLED');

  const future = await leaveService.createLeaveRequest(
    {
      leaveTypeId: testLeaveTypeId,
      startDate: new Date(Date.UTC(2027, 9, 10)),
      endDate: new Date(Date.UTC(2027, 9, 11)),
    },
    { id: user.id, ipAddress: '127.0.0.1' },
  );
  const approvedFuture = await leaveService.approveLeaveRequest(future.id, {
    id: actor.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['leaveRequest:decide:any'],
  });
  const balanceBefore = await prisma.leaveBalance.findFirst({
    where: { employeeId: approvedFuture.employeeId, leaveTypeId: testLeaveTypeId, year: 2027 },
  });

  const cancelledFuture = await leaveService.cancelLeaveRequest(future.id, {
    id: user.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: [],
  });
  assert.equal(cancelledFuture.status, 'CANCELLED');

  const balanceAfter = await prisma.leaveBalance.findFirst({
    where: { employeeId: approvedFuture.employeeId, leaveTypeId: testLeaveTypeId, year: 2027 },
  });
  assert.equal(
    balanceAfter.consumed.toNumber(),
    balanceBefore.consumed.toNumber() - approvedFuture.durationDays.toNumber(),
  );

  // An already-started Approved request, created directly to force the
  // scenario (the service's own creation path has no reason to ever
  // produce a past-dated Approved request in normal use).
  const employee = await prisma.employee.findFirst({ where: { userId: user.id } });
  const started = await prisma.leaveRequest.create({
    data: {
      employeeId: employee.id,
      leaveTypeId: testLeaveTypeId,
      startDate: new Date(Date.UTC(2020, 0, 1)),
      endDate: new Date(Date.UTC(2020, 0, 2)),
      status: 'APPROVED',
      durationDays: 2,
    },
  });

  await assert.rejects(() => leaveService.cancelLeaveRequest(started.id, {
    id: user.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: [],
  }), {
    message: 'An approved leave that has already started cannot be cancelled retroactively',
  });
});

test('listLeaveRequests auto-scopes to the caller\'s own employeeId without :read:any', async () => {
  const user = await makeUser('list-own-applicant');
  await makeEmployee({ userId: user.id });

  await leaveService.createLeaveRequest(
    {
      leaveTypeId: testLeaveTypeId,
      startDate: new Date(Date.UTC(2027, 10, 1)),
      endDate: new Date(Date.UTC(2027, 10, 1)),
    },
    { id: user.id, ipAddress: '127.0.0.1' },
  );

  const { requests, pagination } = await leaveService.listLeaveRequests(
    { page: 1, limit: 10, sortBy: 'startDate', order: 'desc' },
    { id: user.id, grantedPermissions: [] },
  );

  assert.ok(pagination.total >= 1);
  assert.ok(requests.every((r) => r.employeeId === requests[0].employeeId));
});

test('getLeaveRequestById enforces ownership without :read:any', async () => {
  const ownerUser = await makeUser('getbyid-owner');
  await makeEmployee({ userId: ownerUser.id });
  const otherUser = await makeUser('getbyid-other');
  await makeEmployee({ userId: otherUser.id });

  const request = await leaveService.createLeaveRequest(
    {
      leaveTypeId: testLeaveTypeId,
      startDate: new Date(Date.UTC(2027, 10, 15)),
      endDate: new Date(Date.UTC(2027, 10, 15)),
    },
    { id: ownerUser.id, ipAddress: '127.0.0.1' },
  );

  const asOwner = await leaveService.getLeaveRequestById(request.id, {
    id: ownerUser.id,
    grantedPermissions: [],
  });
  assert.equal(asOwner.id, request.id);

  await assert.rejects(
    () =>
      leaveService.getLeaveRequestById(request.id, { id: otherUser.id, grantedPermissions: [] }),
    { message: 'You do not have permission to view this record' },
  );
});

test('proration: an employee hired mid-year receives a fractional first-year entitlement, full entitlement thereafter', async () => {
  const user = await makeUser('proration-applicant');
  const employee = await makeEmployee({ userId: user.id, dateOfJoining: new Date(Date.UTC(2027, 6, 2)) });

  const hireYearBalance = await leaveService.getOrCreateLeaveBalance(
    employee,
    testLeaveTypeId,
    2027,
    actor,
  );
  const yearStart = new Date(Date.UTC(2027, 0, 1));
  const yearEnd = new Date(Date.UTC(2027, 11, 31));
  const totalDays = Math.round((yearEnd - yearStart) / 86400000) + 1;
  const daysRemaining = Math.round((yearEnd - new Date(Date.UTC(2027, 6, 2))) / 86400000) + 1;
  const expected = Math.round(((24 * daysRemaining) / totalDays) * 100) / 100;
  assert.equal(hireYearBalance.entitlement.toNumber(), expected);
  assert.ok(expected < 24);

  const nextYearBalance = await leaveService.getOrCreateLeaveBalance(
    employee,
    testLeaveTypeId,
    2028,
    actor,
  );
  assert.equal(nextYearBalance.entitlement.toNumber(), 24);

  const beforeHireBalance = await leaveService.getOrCreateLeaveBalance(
    employee,
    testLeaveTypeId,
    2026,
    actor,
  );
  assert.equal(beforeHireBalance.entitlement.toNumber(), 0);
});

test('adjustLeaveBalance applies a manual ADMIN override and is audit-logged', async () => {
  const user = await makeUser('adjust-applicant');
  const employee = await makeEmployee({ userId: user.id });

  const balance = await leaveService.getOrCreateLeaveBalance(employee, testLeaveTypeId, 2029, actor);

  const adjusted = await leaveService.adjustLeaveBalance(balance.id, { entitlement: 30 }, actor);
  assert.equal(adjusted.entitlement.toNumber(), 30);

  const auditEntry = await prisma.auditLog.findFirst({
    where: { entityType: 'LeaveBalance', entityId: balance.id, action: 'UPDATE' },
  });
  assert.ok(auditEntry);
});

test('attendance getEffectiveStatus resolves ON_LEAVE for a date covered by an approved leave request', async () => {
  const user = await makeUser('on-leave-applicant');
  const employee = await makeEmployee({ userId: user.id, dateOfJoining: new Date('2020-01-01') });

  const request = await leaveService.createLeaveRequest(
    {
      leaveTypeId: testLeaveTypeId,
      startDate: new Date(Date.UTC(2027, 11, 1)),
      endDate: new Date(Date.UTC(2027, 11, 1)),
    },
    { id: user.id, ipAddress: '127.0.0.1' },
  );
  await leaveService.approveLeaveRequest(request.id, {
    id: actor.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['leaveRequest:decide:any'],
  });

  const result = await attendanceService.getEffectiveStatus(
    employee.id,
    new Date(Date.UTC(2027, 11, 1)),
    { id: actor.id, grantedPermissions: ['attendance:read:any'] },
  );
  assert.equal(result.status, 'ON_LEAVE');
});
