import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import departmentService from './department.service.js';
import employeeService from '../employees/employee.service.js';

// Integration coverage for the Department domain (docs/domain-department.md).
// Runs against the real dev database - fixtures are namespaced per run and
// fully cleaned up in `after`, same convention as branch.service.test.js.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };
const createdEmployeeIds = [];
const createdDepartmentIds = [];
let testDesignationId;

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `department-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Department Test Actor',
    },
  });
  actor.id = user.id;

  // Employee.designationId is mandatory (docs/domain-designation.md ADR-DS07) -
  // every fixture Employee created below needs a real Designation to
  // reference, even though this suite's actual subject is Department.
  const designation = await prisma.designation.create({
    data: { name: `Department Test Designation ${RUN_ID}` },
  });
  testDesignationId = designation.id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
  if (createdEmployeeIds.length) {
    await prisma.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
  }
  if (createdDepartmentIds.length) {
    await prisma.department.deleteMany({ where: { id: { in: createdDepartmentIds } } });
  }
  await prisma.designation.delete({ where: { id: testDesignationId } });
  await prisma.user.delete({ where: { id: actor.id } });
  await prisma.$disconnect();
});

const makeEmployee = async (departmentId) => {
  const employee = await prisma.employee.create({
    data: {
      departmentId,
      designationId: testDesignationId,
      employmentType: 'FULL_TIME',
      salary: 1000,
      dateOfJoining: new Date(),
    },
  });
  createdEmployeeIds.push(employee.id);
  return employee;
};

test('creates a department and rejects a duplicate name (case-insensitive)', async () => {
  const department = await departmentService.createDepartment(
    { name: `Engineering ${RUN_ID}`, code: `ENG-${RUN_ID}` },
    actor,
  );
  createdDepartmentIds.push(department.id);

  assert.equal(department.status, 'ACTIVE');

  await assert.rejects(
    () => departmentService.createDepartment({ name: `engineering ${RUN_ID}` }, actor),
    { message: 'A department with this name or code already exists' },
  );
});

test('lists departments with pagination and search', async () => {
  const department = await departmentService.createDepartment({ name: `Finance ${RUN_ID}` }, actor);
  createdDepartmentIds.push(department.id);

  const { departments, pagination } = await departmentService.listDepartments({
    page: 1,
    limit: 10,
    search: `Finance ${RUN_ID}`,
    sortBy: 'createdAt',
    order: 'desc',
  });

  assert.equal(pagination.total, 1);
  assert.equal(departments[0].id, department.id);
});

test('deactivating a department blocks future assignment but keeps existing links intact', async () => {
  const department = await departmentService.createDepartment({ name: `Sales ${RUN_ID}` }, actor);
  createdDepartmentIds.push(department.id);

  const employee = await makeEmployee(department.id);

  const updated = await departmentService.updateDepartment(
    department.id,
    { status: 'INACTIVE' },
    actor,
  );
  assert.equal(updated.status, 'INACTIVE');

  await assert.rejects(() => departmentService.assertDepartmentAssignable(department.id), {
    message: 'departmentId: this department is not active and cannot be assigned',
  });

  const stillLinked = await prisma.employee.findUnique({ where: { id: employee.id } });
  assert.equal(stillLinked.departmentId, department.id);
});

test('assertDepartmentAssignable rejects a nonexistent departmentId', async () => {
  await assert.rejects(
    () => departmentService.assertDepartmentAssignable('00000000-0000-0000-0000-000000000000'),
    { message: 'departmentId: references a record that does not exist' },
  );
});

test('employee creation requires a valid, active departmentId', async () => {
  const activeDepartment = await departmentService.createDepartment(
    { name: `Marketing ${RUN_ID}` },
    actor,
  );
  createdDepartmentIds.push(activeDepartment.id);

  const employee = await employeeService.createEmployee(
    {
      departmentId: activeDepartment.id,
      designationId: testDesignationId,
      employmentType: 'FULL_TIME',
      salary: 2000,
      dateOfJoining: new Date(),
    },
    actor,
  );
  createdEmployeeIds.push(employee.id);

  assert.equal(employee.departmentId, activeDepartment.id);

  await assert.rejects(
    () =>
      employeeService.createEmployee(
        {
          departmentId: '00000000-0000-0000-0000-000000000000',
          designationId: testDesignationId,
          employmentType: 'FULL_TIME',
          salary: 2000,
          dateOfJoining: new Date(),
        },
        actor,
      ),
    { message: 'departmentId: references a record that does not exist' },
  );
});

test('deleting a department with zero Employee references succeeds; deleting a referenced one is rejected', async () => {
  const unreferenced = await departmentService.createDepartment({ name: `HR ${RUN_ID}` }, actor);
  await departmentService.deleteDepartment(unreferenced.id, actor);

  const referenced = await departmentService.createDepartment({ name: `Legal ${RUN_ID}` }, actor);
  createdDepartmentIds.push(referenced.id);
  await makeEmployee(referenced.id);

  await assert.rejects(() => departmentService.deleteDepartment(referenced.id, actor), {
    message:
      'This department has Employee records referencing it and cannot be deleted - deactivate it instead',
  });
});
