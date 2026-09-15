import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import payrollService from './payroll.service.js';
import leaveService from '../leave/leave.service.js';
import leaveTypeService from '../leaveTypes/leaveType.service.js';

// Integration coverage for the Payroll domain (docs/domain-payroll.md) -
// PayrollRun's lifecycle, the per-employee calculation reusing Attendance's
// own coordinating service and Leave's isPaid distinction (ADR-LV09), and
// own/any Payslip scoping. Runs against the real dev database - fixtures
// namespaced per run and fully cleaned up in `after`.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };

// A period far enough in the calendar that no other test/dev data collides
// with it - one PayrollRun per (periodMonth, periodYear) is a hard
// uniqueness constraint (ADR-PR01).
const PERIOD_MONTH = 3;
const PERIOD_YEAR = 2031;

const createdEmployeeIds = [];
const createdUserIds = [];
const createdLeaveTypeIds = [];
const createdPayrollRunIds = [];

let testDepartmentId;
let testDesignationId;
let paidLeaveTypeId;
let unpaidLeaveTypeId;

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `payroll-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Payroll Test Actor',
    },
  });
  actor.id = user.id;

  const department = await prisma.department.create({
    data: { name: `Payroll Test Department ${RUN_ID}` },
  });
  testDepartmentId = department.id;

  const designation = await prisma.designation.create({
    data: { name: `Payroll Test Designation ${RUN_ID}` },
  });
  testDesignationId = designation.id;

  const paidLeaveType = await leaveTypeService.createLeaveType(
    { name: `Payroll Paid Leave ${RUN_ID}`, defaultAnnualEntitlement: 30, isPaid: true },
    actor,
  );
  paidLeaveTypeId = paidLeaveType.id;
  createdLeaveTypeIds.push(paidLeaveType.id);

  const unpaidLeaveType = await leaveTypeService.createLeaveType(
    { name: `Payroll Unpaid Leave ${RUN_ID}`, defaultAnnualEntitlement: 30, isPaid: false },
    actor,
  );
  unpaidLeaveTypeId = unpaidLeaveType.id;
  createdLeaveTypeIds.push(unpaidLeaveType.id);
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
  await prisma.payslipLineItem.deleteMany({
    where: { payslip: { payrollRunId: { in: createdPayrollRunIds } } },
  });
  await prisma.payslip.deleteMany({ where: { payrollRunId: { in: createdPayrollRunIds } } });
  if (createdPayrollRunIds.length) {
    await prisma.payrollRun.deleteMany({ where: { id: { in: createdPayrollRunIds } } });
  }
  await prisma.attendanceRecord.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
  await prisma.leaveRequest.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
  await prisma.leaveBalance.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
  if (createdEmployeeIds.length) {
    await prisma.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
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
      email: `payroll-${label}-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: `Payroll ${label}`,
    },
  });
  createdUserIds.push(user.id);
  return user;
};

// Deliberately no branchId/shiftId: getEffectiveStatus never returns
// HOLIDAY/WEEK_OFF for an employee with neither, so every calendar day in
// the period is a working day and the test's expected math has no
// holiday/week-off exclusions to account for.
const makeEmployee = async ({ userId, dateOfJoining, salary = 3100 } = {}) => {
  const employee = await prisma.employee.create({
    data: {
      userId,
      departmentId: testDepartmentId,
      designationId: testDesignationId,
      employmentType: 'FULL_TIME',
      salary,
      dateOfJoining: dateOfJoining ?? new Date('2020-01-01'),
    },
  });
  createdEmployeeIds.push(employee.id);
  return employee;
};

const anyRequester = () => ({ id: actor.id, grantedPermissions: ['payslip:read:any'] });

test('createPayrollRun creates a DRAFT run and rejects a duplicate period', async () => {
  const run = await payrollService.createPayrollRun(
    { periodMonth: PERIOD_MONTH, periodYear: PERIOD_YEAR },
    actor,
  );
  createdPayrollRunIds.push(run.id);
  assert.equal(run.status, 'DRAFT');

  await assert.rejects(
    () => payrollService.createPayrollRun({ periodMonth: PERIOD_MONTH, periodYear: PERIOD_YEAR }, actor),
    { message: 'A payroll run already exists for this period' },
  );
});

test('processPayrollRun computes paid/unpaid days and net pay across present, absent, half-day, and both paid and unpaid leave', async () => {
  const run = await payrollService.createPayrollRun(
    { periodMonth: PERIOD_MONTH, periodYear: PERIOD_YEAR + 1 },
    actor,
  );
  createdPayrollRunIds.push(run.id);

  const user = await makeUser('calc-employee');
  const employee = await makeEmployee({ userId: user.id, salary: 3100 });

  const calcYear = PERIOD_YEAR + 1;
  const calcDayOf = (day) => new Date(Date.UTC(calcYear, PERIOD_MONTH - 1, day));
  const calcTotalDays = new Date(Date.UTC(calcYear, PERIOD_MONTH, 0)).getUTCDate();

  // Days 1-3: PRESENT (a bare checkIn, no shift so no lateness is possible).
  for (let day = 1; day <= 3; day += 1) {
    await prisma.attendanceRecord.create({
      data: { employeeId: employee.id, date: calcDayOf(day), checkIn: calcDayOf(day) },
    });
  }
  // Day 4: HALF_DAY.
  await prisma.attendanceRecord.create({
    data: { employeeId: employee.id, date: calcDayOf(4), isHalfDay: true },
  });
  // Day 5: approved UNPAID leave.
  const unpaidRequest = await leaveService.createLeaveRequest(
    { leaveTypeId: unpaidLeaveTypeId, startDate: calcDayOf(5), endDate: calcDayOf(5) },
    { id: user.id, ipAddress: '127.0.0.1' },
  );
  await leaveService.approveLeaveRequest(unpaidRequest.id, {
    id: actor.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['leaveRequest:decide:any'],
  });
  // Day 6: approved PAID leave.
  const paidRequest = await leaveService.createLeaveRequest(
    { leaveTypeId: paidLeaveTypeId, startDate: calcDayOf(6), endDate: calcDayOf(6) },
    { id: user.id, ipAddress: '127.0.0.1' },
  );
  await leaveService.approveLeaveRequest(paidRequest.id, {
    id: actor.id,
    ipAddress: '127.0.0.1',
    grantedPermissions: ['leaveRequest:decide:any'],
  });
  // Days 7..end of month: no record, no leave -> ABSENT by default.

  const processed = await payrollService.processPayrollRun(run.id, actor);
  assert.equal(processed.status, 'PROCESSING');

  const { payslips } = await payrollService.listPayslips(
    { page: 1, limit: 10, sortBy: 'periodYear', order: 'desc', payrollRunId: run.id, employeeId: employee.id },
    anyRequester(),
  );
  const [payslip] = payslips;
  assert.ok(payslip, 'expected a Payslip for the test employee');

  const expectedPaidDays = 3 + 0.5 + 1; // 3 present + half of the half-day + the paid leave day
  const expectedUnpaidDays = 0.5 + 1 + (calcTotalDays - 6); // half-day + unpaid leave + trailing absences
  const expectedPerDayRate = 3100 / calcTotalDays;
  const expectedDeduction = Math.round(expectedPerDayRate * expectedUnpaidDays * 100) / 100;
  const expectedNetPay = Math.round((3100 - expectedDeduction) * 100) / 100;

  assert.equal(payslip.workingDaysInPeriod.toNumber(), calcTotalDays);
  assert.equal(payslip.paidDays.toNumber(), expectedPaidDays);
  assert.equal(payslip.unpaidDays.toNumber(), expectedUnpaidDays);
  assert.equal(payslip.grossPay.toNumber(), 3100);
  assert.equal(payslip.totalDeductions.toNumber(), expectedDeduction);
  assert.equal(payslip.netPay.toNumber(), expectedNetPay);
  assert.equal(payslip.departmentName, (await prisma.department.findUnique({ where: { id: testDepartmentId } })).name);

  const full = await payrollService.getPayslipById(payslip.id, anyRequester());
  assert.ok(full.lineItems.some((item) => item.type === 'EARNING' && item.label === 'Base Salary'));
  assert.ok(full.lineItems.some((item) => item.type === 'DEDUCTION'));
});

test('PayrollRun lifecycle guards: process/finalize/markPaid/delete each require the correct prior status', async () => {
  const run = await payrollService.createPayrollRun(
    { periodMonth: PERIOD_MONTH, periodYear: PERIOD_YEAR + 2 },
    actor,
  );
  createdPayrollRunIds.push(run.id);

  await assert.rejects(() => payrollService.finalizePayrollRun(run.id, actor), {
    message: 'Only a PROCESSING payroll run can be finalized',
  });
  await assert.rejects(() => payrollService.markPayrollRunPaid(run.id, actor), {
    message: 'Only a FINALIZED payroll run can be marked as paid',
  });

  const processed = await payrollService.processPayrollRun(run.id, actor);
  assert.equal(processed.status, 'PROCESSING');

  await assert.rejects(() => payrollService.processPayrollRun(run.id, actor), {
    message: 'Only a DRAFT payroll run can be processed',
  });
  await assert.rejects(() => payrollService.deletePayrollRun(run.id, actor), {
    message: 'Only a DRAFT payroll run can be deleted',
  });

  const finalized = await payrollService.finalizePayrollRun(run.id, actor);
  assert.equal(finalized.status, 'FINALIZED');

  const paid = await payrollService.markPayrollRunPaid(run.id, actor);
  assert.equal(paid.status, 'PAID');
});

test('deletePayrollRun succeeds for a DRAFT run with zero Payslips', async () => {
  const run = await payrollService.createPayrollRun(
    { periodMonth: PERIOD_MONTH, periodYear: PERIOD_YEAR + 3 },
    actor,
  );

  await payrollService.deletePayrollRun(run.id, actor);

  const found = await prisma.payrollRun.findUnique({ where: { id: run.id } });
  assert.equal(found, null);
});

test('listPayslips auto-scopes to the caller\'s own employeeId without payslip:read:any', async () => {
  const run = await payrollService.createPayrollRun(
    { periodMonth: PERIOD_MONTH, periodYear: PERIOD_YEAR + 4 },
    actor,
  );
  createdPayrollRunIds.push(run.id);

  const user = await makeUser('scope-employee');
  await makeEmployee({ userId: user.id });

  await payrollService.processPayrollRun(run.id, actor);

  const { payslips, pagination } = await payrollService.listPayslips(
    { page: 1, limit: 10, sortBy: 'periodYear', order: 'desc' },
    { id: user.id, grantedPermissions: [] },
  );

  assert.ok(pagination.total >= 1);
  assert.ok(payslips.every((p) => p.employeeId === payslips[0].employeeId));
});

test('getPayslipById enforces ownership without payslip:read:any', async () => {
  const run = await payrollService.createPayrollRun(
    { periodMonth: PERIOD_MONTH, periodYear: PERIOD_YEAR + 5 },
    actor,
  );
  createdPayrollRunIds.push(run.id);

  const ownerUser = await makeUser('getbyid-owner');
  await makeEmployee({ userId: ownerUser.id });
  const otherUser = await makeUser('getbyid-other');
  await makeEmployee({ userId: otherUser.id });

  await payrollService.processPayrollRun(run.id, actor);

  const ownerEmployee = await prisma.employee.findFirst({ where: { userId: ownerUser.id } });
  const { payslips } = await payrollService.listPayslips(
    {
      page: 1,
      limit: 10,
      sortBy: 'periodYear',
      order: 'desc',
      payrollRunId: run.id,
      employeeId: ownerEmployee.id,
    },
    anyRequester(),
  );
  const [ownPayslip] = payslips;

  const asOwner = await payrollService.getPayslipById(ownPayslip.id, {
    id: ownerUser.id,
    grantedPermissions: [],
  });
  assert.equal(asOwner.id, ownPayslip.id);

  await assert.rejects(
    () => payrollService.getPayslipById(ownPayslip.id, { id: otherUser.id, grantedPermissions: [] }),
    { message: 'You do not have permission to view this payslip' },
  );
});
