import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import shiftService from './shift.service.js';
import employeeService from '../employees/employee.service.js';

// Integration coverage for the Shift domain (docs/domain-shift.md). Runs
// against the real dev database - fixtures are namespaced per run and fully
// cleaned up in `after`, same convention as branch/department/designation's
// suites.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };
const createdEmployeeIds = [];
const createdShiftIds = [];
let testDepartmentId;
let testDesignationId;

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `shift-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Shift Test Actor',
    },
  });
  actor.id = user.id;

  // Employee.departmentId/designationId are mandatory - every fixture
  // Employee created below needs real records to reference, even though
  // this suite's actual subject is Shift.
  const department = await prisma.department.create({
    data: { name: `Shift Test Department ${RUN_ID}` },
  });
  testDepartmentId = department.id;

  const designation = await prisma.designation.create({
    data: { name: `Shift Test Designation ${RUN_ID}` },
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
  await prisma.designation.delete({ where: { id: testDesignationId } });
  await prisma.department.delete({ where: { id: testDepartmentId } });
  await prisma.user.delete({ where: { id: actor.id } });
  await prisma.$disconnect();
});

const makeEmployee = async (shiftId) => {
  const employee = await prisma.employee.create({
    data: {
      departmentId: testDepartmentId,
      designationId: testDesignationId,
      employmentType: 'FULL_TIME',
      salary: 1000,
      dateOfJoining: new Date(),
      shiftId,
    },
  });
  createdEmployeeIds.push(employee.id);
  return employee;
};

test('creates a shift and rejects a duplicate name (case-insensitive)', async () => {
  const shift = await shiftService.createShift(
    {
      name: `Day Shift ${RUN_ID}`,
      startTime: '09:00',
      endTime: '18:00',
      workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    },
    actor,
  );
  createdShiftIds.push(shift.id);

  assert.equal(shift.status, 'ACTIVE');

  await assert.rejects(
    () =>
      shiftService.createShift(
        {
          name: `day shift ${RUN_ID}`,
          startTime: '09:00',
          endTime: '18:00',
          workingDays: ['MONDAY'],
        },
        actor,
      ),
    { message: 'A shift with this name already exists' },
  );
});

test('lists shifts with pagination and search', async () => {
  const shift = await shiftService.createShift(
    {
      name: `Evening Shift ${RUN_ID}`,
      startTime: '14:00',
      endTime: '22:00',
      workingDays: ['MONDAY', 'TUESDAY'],
    },
    actor,
  );
  createdShiftIds.push(shift.id);

  const { shifts, pagination } = await shiftService.listShifts({
    page: 1,
    limit: 10,
    search: `Evening Shift ${RUN_ID}`,
    sortBy: 'createdAt',
    order: 'desc',
  });

  assert.equal(pagination.total, 1);
  assert.equal(shifts[0].id, shift.id);
});

test('deactivating a shift blocks future assignment but keeps existing links intact', async () => {
  const shift = await shiftService.createShift(
    {
      name: `Support Shift ${RUN_ID}`,
      startTime: '08:00',
      endTime: '17:00',
      workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY'],
    },
    actor,
  );
  createdShiftIds.push(shift.id);

  const employee = await makeEmployee(shift.id);

  const updated = await shiftService.updateShift(shift.id, { status: 'INACTIVE' }, actor);
  assert.equal(updated.status, 'INACTIVE');

  await assert.rejects(() => shiftService.assertShiftAssignable(shift.id), {
    message: 'shiftId: this shift is not active and cannot be assigned',
  });

  const stillLinked = await prisma.employee.findUnique({ where: { id: employee.id } });
  assert.equal(stillLinked.shiftId, shift.id);
});

test('assertShiftAssignable rejects a nonexistent shiftId', async () => {
  await assert.rejects(
    () => shiftService.assertShiftAssignable('00000000-0000-0000-0000-000000000000'),
    { message: 'shiftId: references a record that does not exist' },
  );
});

test('employee creation accepts no shiftId (optional) and a valid, active shiftId', async () => {
  const employeeWithoutShift = await employeeService.createEmployee(
    {
      departmentId: testDepartmentId,
      designationId: testDesignationId,
      employmentType: 'FULL_TIME',
      salary: 1500,
      dateOfJoining: new Date(),
    },
    actor,
  );
  createdEmployeeIds.push(employeeWithoutShift.id);
  assert.equal(employeeWithoutShift.shiftId, null);

  const activeShift = await shiftService.createShift(
    {
      name: `Night Shift ${RUN_ID}`,
      startTime: '22:00',
      endTime: '07:00',
      workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    },
    actor,
  );
  createdShiftIds.push(activeShift.id);

  const employeeWithShift = await employeeService.createEmployee(
    {
      departmentId: testDepartmentId,
      designationId: testDesignationId,
      employmentType: 'FULL_TIME',
      salary: 1500,
      dateOfJoining: new Date(),
      shiftId: activeShift.id,
    },
    actor,
  );
  createdEmployeeIds.push(employeeWithShift.id);
  assert.equal(employeeWithShift.shiftId, activeShift.id);

  await assert.rejects(
    () =>
      employeeService.createEmployee(
        {
          departmentId: testDepartmentId,
          designationId: testDesignationId,
          employmentType: 'FULL_TIME',
          salary: 1500,
          dateOfJoining: new Date(),
          shiftId: '00000000-0000-0000-0000-000000000000',
        },
        actor,
      ),
    { message: 'shiftId: references a record that does not exist' },
  );
});

test('deleting a shift with zero Employee references succeeds; deleting a referenced one is rejected', async () => {
  const unreferenced = await shiftService.createShift(
    {
      name: `Weekend Shift ${RUN_ID}`,
      startTime: '10:00',
      endTime: '16:00',
      workingDays: ['SATURDAY', 'SUNDAY'],
    },
    actor,
  );
  await shiftService.deleteShift(unreferenced.id, actor);

  const referenced = await shiftService.createShift(
    {
      name: `Rotational Shift ${RUN_ID}`,
      startTime: '06:00',
      endTime: '14:00',
      workingDays: ['MONDAY'],
    },
    actor,
  );
  createdShiftIds.push(referenced.id);
  await makeEmployee(referenced.id);

  await assert.rejects(() => shiftService.deleteShift(referenced.id, actor), {
    message:
      'This shift has Employee records referencing it and cannot be deleted - deactivate it instead',
  });
});

test('isOvernightShift identifies midnight-crossing shifts by comparing HH:mm strings', () => {
  assert.equal(shiftService.isOvernightShift({ startTime: '22:00', endTime: '07:00' }), true);
  assert.equal(shiftService.isOvernightShift({ startTime: '09:00', endTime: '18:00' }), false);
});
