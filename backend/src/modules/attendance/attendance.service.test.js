import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import attendanceService from './attendance.service.js';
import { createAttendanceRecordSchema } from './attendance.validation.js';

// Integration coverage for the Attendance domain (docs/domain-attendance.md).
// Runs against the real dev database - fixtures are namespaced per run and
// fully cleaned up in `after`, same convention as every other domain suite.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };
const ANY_PERMS = { grantedPermissions: ['attendance:read:any'] };

const createdEmployeeIds = [];
const createdUserIds = [];
const createdBranchIds = [];
const createdCalendarIds = [];
const createdShiftIds = [];

let testDepartmentId;
let testDesignationId;

// A fixed, real-calendar past date (safely clear of "today", which the
// self-service check-in/check-out tests use) - its weekday is computed
// programmatically rather than assumed, so shift workingDays fixtures stay
// correct regardless of which actual date this ends up being.
const FIXED_DATE = new Date(Date.UTC(2026, 0, 5));
const WEEKDAY_NAMES = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];
const FIXED_WEEKDAY = WEEKDAY_NAMES[FIXED_DATE.getUTCDay()];
const OTHER_WEEKDAY = WEEKDAY_NAMES[(FIXED_DATE.getUTCDay() + 1) % 7];

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `attendance-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Attendance Test Actor',
    },
  });
  actor.id = user.id;

  const department = await prisma.department.create({
    data: { name: `Attendance Test Department ${RUN_ID}` },
  });
  testDepartmentId = department.id;

  const designation = await prisma.designation.create({
    data: { name: `Attendance Test Designation ${RUN_ID}` },
  });
  testDesignationId = designation.id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
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
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.user.delete({ where: { id: actor.id } });
  await prisma.$disconnect();
});

const makeUser = async (label) => {
  const user = await prisma.user.create({
    data: {
      email: `attendance-${label}-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: `Attendance ${label}`,
    },
  });
  createdUserIds.push(user.id);
  return user;
};

const makeEmployee = async ({ userId, branchId, shiftId } = {}) => {
  const employee = await prisma.employee.create({
    data: {
      userId,
      departmentId: testDepartmentId,
      designationId: testDesignationId,
      employmentType: 'FULL_TIME',
      salary: 1000,
      dateOfJoining: new Date('2020-01-01'),
      branchId,
      shiftId,
    },
  });
  createdEmployeeIds.push(employee.id);
  return employee;
};

test('checkIn creates a record for today and rejects a duplicate check-in', async () => {
  const user = await makeUser('checkin-user');
  await makeEmployee({ userId: user.id });

  const record = await attendanceService.checkIn({ id: user.id, ipAddress: '127.0.0.1' });
  assert.ok(record.checkIn);
  assert.equal(record.checkOut, null);

  await assert.rejects(
    () => attendanceService.checkIn({ id: user.id, ipAddress: '127.0.0.1' }),
    { message: 'Already checked in for today' },
  );
});

test('checkOut requires a prior check-in and rejects a duplicate check-out', async () => {
  const user = await makeUser('checkout-user');
  await makeEmployee({ userId: user.id });

  await assert.rejects(
    () => attendanceService.checkOut({ id: user.id, ipAddress: '127.0.0.1' }),
    { message: 'Cannot check out before checking in today' },
  );

  await attendanceService.checkIn({ id: user.id, ipAddress: '127.0.0.1' });
  const record = await attendanceService.checkOut({ id: user.id, ipAddress: '127.0.0.1' });
  assert.ok(record.checkOut);

  await assert.rejects(
    () => attendanceService.checkOut({ id: user.id, ipAddress: '127.0.0.1' }),
    { message: 'Already checked out for today' },
  );
});

test('checkIn rejects a caller with no linked Employee record', async () => {
  const user = await makeUser('no-employee-user');

  await assert.rejects(
    () => attendanceService.checkIn({ id: user.id, ipAddress: '127.0.0.1' }),
    { message: 'No employee record linked to this account' },
  );
});

test('admin creates a record for a past date; duplicate (employeeId, date) is rejected; future date is rejected', async () => {
  const employee = await makeEmployee();

  const record = await attendanceService.createAttendanceRecord(
    {
      employeeId: employee.id,
      date: FIXED_DATE,
      checkIn: new Date(Date.UTC(2026, 0, 5, 9, 0)),
      checkOut: new Date(Date.UTC(2026, 0, 5, 18, 0)),
    },
    actor,
  );
  assert.equal(record.employeeId, employee.id);

  await assert.rejects(
    () =>
      attendanceService.createAttendanceRecord(
        { employeeId: employee.id, date: FIXED_DATE },
        actor,
      ),
    { message: 'An attendance record already exists for this employee and date' },
  );

  const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const parsed = createAttendanceRecordSchema.safeParse({
    employeeId: employee.id,
    date: futureDate.toISOString(),
  });
  assert.equal(parsed.success, false);
  assert.match(parsed.error.issues[0].message, /future/);
});

test('getAttendanceRecordById: owner can view their own record, a non-owner without :any is rejected, :any can view any', async () => {
  const ownerUser = await makeUser('record-owner');
  const owner = await makeEmployee({ userId: ownerUser.id });
  const otherUser = await makeUser('record-other');
  await makeEmployee({ userId: otherUser.id });

  const record = await attendanceService.createAttendanceRecord(
    { employeeId: owner.id, date: new Date(Date.UTC(2026, 0, 6)) },
    actor,
  );

  const asOwner = await attendanceService.getAttendanceRecordById(record.id, {
    id: ownerUser.id,
    grantedPermissions: [],
  });
  assert.equal(asOwner.id, record.id);

  await assert.rejects(
    () =>
      attendanceService.getAttendanceRecordById(record.id, {
        id: otherUser.id,
        grantedPermissions: [],
      }),
    { message: 'You do not have permission to view this attendance record' },
  );

  const asAny = await attendanceService.getAttendanceRecordById(record.id, {
    id: actor.id,
    grantedPermissions: ['attendance:read:any'],
  });
  assert.equal(asAny.id, record.id);
});

test('lists attendance records filtered by employeeId and date range', async () => {
  const employee = await makeEmployee();
  await attendanceService.createAttendanceRecord(
    { employeeId: employee.id, date: new Date(Date.UTC(2026, 0, 7)) },
    actor,
  );
  await attendanceService.createAttendanceRecord(
    { employeeId: employee.id, date: new Date(Date.UTC(2026, 0, 8)) },
    actor,
  );

  const { records, pagination } = await attendanceService.listAttendanceRecords({
    page: 1,
    limit: 10,
    employeeId: employee.id,
    dateFrom: new Date(Date.UTC(2026, 0, 7)),
    dateTo: new Date(Date.UTC(2026, 0, 7)),
    sortBy: 'date',
    order: 'desc',
  });

  assert.equal(pagination.total, 1);
  assert.equal(records[0].date.toISOString(), new Date(Date.UTC(2026, 0, 7)).toISOString());
});

test('updateAttendanceRecord corrects checkOut and is captured by AuditLog', async () => {
  const employee = await makeEmployee();
  const record = await attendanceService.createAttendanceRecord(
    { employeeId: employee.id, date: new Date(Date.UTC(2026, 0, 9)), checkIn: new Date(Date.UTC(2026, 0, 9, 9, 0)) },
    actor,
  );

  const updated = await attendanceService.updateAttendanceRecord(
    record.id,
    { checkOut: new Date(Date.UTC(2026, 0, 9, 17, 30)) },
    actor,
  );
  assert.ok(updated.checkOut);

  const auditEntry = await prisma.auditLog.findFirst({
    where: { entityType: 'AttendanceRecord', entityId: record.id, action: 'UPDATE' },
  });
  assert.ok(auditEntry);
});

test('deleteAttendanceRecord succeeds with no reference-count restriction and is audit-logged', async () => {
  const employee = await makeEmployee();
  const record = await attendanceService.createAttendanceRecord(
    { employeeId: employee.id, date: new Date(Date.UTC(2026, 0, 10)) },
    actor,
  );

  await attendanceService.deleteAttendanceRecord(record.id, actor);

  const gone = await prisma.attendanceRecord.findUnique({ where: { id: record.id } });
  assert.equal(gone, null);

  const auditEntry = await prisma.auditLog.findFirst({
    where: { entityType: 'AttendanceRecord', entityId: record.id, action: 'DELETE' },
  });
  assert.ok(auditEntry);
});

test('getEffectiveStatus resolves HOLIDAY when the employee\'s branch calendar has a holiday on that date', async () => {
  const calendar = await prisma.holidayCalendar.create({
    data: { name: `Attendance Test Calendar ${RUN_ID}` },
  });
  createdCalendarIds.push(calendar.id);
  await prisma.holiday.create({
    data: { holidayCalendarId: calendar.id, date: FIXED_DATE, name: 'Test Holiday' },
  });

  const branch = await prisma.branch.create({
    data: { name: `Attendance Test Branch ${RUN_ID}`, holidayCalendarId: calendar.id },
  });
  createdBranchIds.push(branch.id);

  const employee = await makeEmployee({ branchId: branch.id });

  const result = await attendanceService.getEffectiveStatus(employee.id, FIXED_DATE, ANY_PERMS);
  assert.equal(result.status, 'HOLIDAY');
});

test('getEffectiveStatus resolves WEEK_OFF when the date is not in the employee\'s shift workingDays', async () => {
  const shift = await prisma.shift.create({
    data: {
      name: `Attendance Test Shift Off ${RUN_ID}`,
      startTime: '09:00',
      endTime: '18:00',
      workingDays: [OTHER_WEEKDAY],
    },
  });
  createdShiftIds.push(shift.id);

  const employee = await makeEmployee({ shiftId: shift.id });

  const result = await attendanceService.getEffectiveStatus(employee.id, FIXED_DATE, ANY_PERMS);
  assert.equal(result.status, 'WEEK_OFF');
});

test('getEffectiveStatus resolves ABSENT when no record exists on a working day, PRESENT when checked in on time', async () => {
  const shift = await prisma.shift.create({
    data: {
      name: `Attendance Test Shift Working ${RUN_ID}`,
      startTime: '09:00',
      endTime: '18:00',
      workingDays: [FIXED_WEEKDAY],
    },
  });
  createdShiftIds.push(shift.id);

  const employee = await makeEmployee({ shiftId: shift.id });

  const absent = await attendanceService.getEffectiveStatus(employee.id, FIXED_DATE, ANY_PERMS);
  assert.equal(absent.status, 'ABSENT');

  await attendanceService.createAttendanceRecord(
    {
      employeeId: employee.id,
      date: FIXED_DATE,
      checkIn: new Date(Date.UTC(2026, 0, 5, 8, 50)),
    },
    actor,
  );

  const present = await attendanceService.getEffectiveStatus(employee.id, FIXED_DATE, ANY_PERMS);
  assert.equal(present.status, 'PRESENT');
});

test('getEffectiveStatus resolves LATE when checkIn is after shift.startTime (non-overnight)', async () => {
  const shift = await prisma.shift.create({
    data: {
      name: `Attendance Test Shift Late ${RUN_ID}`,
      startTime: '09:00',
      endTime: '18:00',
      workingDays: [FIXED_WEEKDAY],
    },
  });
  createdShiftIds.push(shift.id);

  const employee = await makeEmployee({ shiftId: shift.id });
  await attendanceService.createAttendanceRecord(
    {
      employeeId: employee.id,
      date: FIXED_DATE,
      checkIn: new Date(Date.UTC(2026, 0, 5, 9, 45)),
    },
    actor,
  );

  const result = await attendanceService.getEffectiveStatus(employee.id, FIXED_DATE, ANY_PERMS);
  assert.equal(result.status, 'LATE');
});

test('getEffectiveStatus resolves HALF_DAY from the stored flag regardless of checkIn time', async () => {
  const employee = await makeEmployee();
  const halfDayDate = new Date(Date.UTC(2026, 0, 11));
  await attendanceService.createAttendanceRecord(
    { employeeId: employee.id, date: halfDayDate, isHalfDay: true },
    actor,
  );

  const result = await attendanceService.getEffectiveStatus(employee.id, halfDayDate, ANY_PERMS);
  assert.equal(result.status, 'HALF_DAY');
});

test('getEffectiveStatus does not compute LATE for an overnight shift (documented limitation)', async () => {
  const shift = await prisma.shift.create({
    data: {
      name: `Attendance Test Shift Overnight ${RUN_ID}`,
      startTime: '22:00',
      endTime: '07:00',
      workingDays: [FIXED_WEEKDAY],
    },
  });
  createdShiftIds.push(shift.id);

  const employee = await makeEmployee({ shiftId: shift.id });
  const overnightDate = new Date(Date.UTC(2026, 0, 12));
  await attendanceService.createAttendanceRecord(
    {
      employeeId: employee.id,
      date: overnightDate,
      checkIn: new Date(Date.UTC(2026, 0, 12, 23, 30)),
    },
    actor,
  );

  const result = await attendanceService.getEffectiveStatus(employee.id, overnightDate, ANY_PERMS);
  assert.equal(result.status, 'PRESENT');
});

test('getEffectiveStatus rejects querying another employee\'s status without :any', async () => {
  const user = await makeUser('effective-status-caller');
  await makeEmployee({ userId: user.id });
  const otherEmployee = await makeEmployee();

  await assert.rejects(
    () =>
      attendanceService.getEffectiveStatus(otherEmployee.id, new Date(Date.UTC(2026, 0, 13)), {
        id: user.id,
        grantedPermissions: [],
      }),
    { message: 'You do not have permission to view this attendance record' },
  );
});
