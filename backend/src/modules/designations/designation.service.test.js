import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import designationService from './designation.service.js';
import employeeService from '../employees/employee.service.js';

// Integration coverage for the Designation domain (docs/domain-designation.md).
// Runs against the real dev database - fixtures are namespaced per run and
// fully cleaned up in `after`, same convention as branch/department's suites.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };
const createdEmployeeIds = [];
const createdDesignationIds = [];
let testDepartmentId;

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `designation-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Designation Test Actor',
    },
  });
  actor.id = user.id;

  // Employee.departmentId is mandatory (docs/domain-department.md ADR-D07) -
  // every fixture Employee created below needs a real Department to
  // reference, even though this suite's actual subject is Designation.
  const department = await prisma.department.create({
    data: { name: `Designation Test Department ${RUN_ID}` },
  });
  testDepartmentId = department.id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
  if (createdEmployeeIds.length) {
    await prisma.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
  }
  if (createdDesignationIds.length) {
    await prisma.designation.deleteMany({ where: { id: { in: createdDesignationIds } } });
  }
  await prisma.department.delete({ where: { id: testDepartmentId } });
  await prisma.user.delete({ where: { id: actor.id } });
  await prisma.$disconnect();
});

const makeEmployee = async (designationId) => {
  const employee = await prisma.employee.create({
    data: {
      departmentId: testDepartmentId,
      designationId,
      employmentType: 'FULL_TIME',
      salary: 1000,
      dateOfJoining: new Date(),
    },
  });
  createdEmployeeIds.push(employee.id);
  return employee;
};

test('creates a designation and rejects a duplicate name (case-insensitive)', async () => {
  const designation = await designationService.createDesignation(
    { name: `Software Engineer ${RUN_ID}`, code: `SWE-${RUN_ID}` },
    actor,
  );
  createdDesignationIds.push(designation.id);

  assert.equal(designation.status, 'ACTIVE');

  await assert.rejects(
    () => designationService.createDesignation({ name: `software engineer ${RUN_ID}` }, actor),
    { message: 'A designation with this name or code already exists' },
  );
});

test('lists designations with pagination and search', async () => {
  const designation = await designationService.createDesignation(
    { name: `Product Manager ${RUN_ID}` },
    actor,
  );
  createdDesignationIds.push(designation.id);

  const { designations, pagination } = await designationService.listDesignations({
    page: 1,
    limit: 10,
    search: `Product Manager ${RUN_ID}`,
    sortBy: 'createdAt',
    order: 'desc',
  });

  assert.equal(pagination.total, 1);
  assert.equal(designations[0].id, designation.id);
});

test('deactivating a designation blocks future assignment but keeps existing links intact', async () => {
  const designation = await designationService.createDesignation(
    { name: `Sales Executive ${RUN_ID}` },
    actor,
  );
  createdDesignationIds.push(designation.id);

  const employee = await makeEmployee(designation.id);

  const updated = await designationService.updateDesignation(
    designation.id,
    { status: 'INACTIVE' },
    actor,
  );
  assert.equal(updated.status, 'INACTIVE');

  await assert.rejects(() => designationService.assertDesignationAssignable(designation.id), {
    message: 'designationId: this designation is not active and cannot be assigned',
  });

  const stillLinked = await prisma.employee.findUnique({ where: { id: employee.id } });
  assert.equal(stillLinked.designationId, designation.id);
});

test('assertDesignationAssignable rejects a nonexistent designationId', async () => {
  await assert.rejects(
    () => designationService.assertDesignationAssignable('00000000-0000-0000-0000-000000000000'),
    { message: 'designationId: references a record that does not exist' },
  );
});

test('employee creation requires a valid, active designationId', async () => {
  const activeDesignation = await designationService.createDesignation(
    { name: `Marketing Lead ${RUN_ID}` },
    actor,
  );
  createdDesignationIds.push(activeDesignation.id);

  const employee = await employeeService.createEmployee(
    {
      departmentId: testDepartmentId,
      designationId: activeDesignation.id,
      employmentType: 'FULL_TIME',
      salary: 2000,
      dateOfJoining: new Date(),
    },
    actor,
  );
  createdEmployeeIds.push(employee.id);

  assert.equal(employee.designationId, activeDesignation.id);

  await assert.rejects(
    () =>
      employeeService.createEmployee(
        {
          departmentId: testDepartmentId,
          designationId: '00000000-0000-0000-0000-000000000000',
          employmentType: 'FULL_TIME',
          salary: 2000,
          dateOfJoining: new Date(),
        },
        actor,
      ),
    { message: 'designationId: references a record that does not exist' },
  );
});

test('deleting a designation with zero Employee references succeeds; deleting a referenced one is rejected', async () => {
  const unreferenced = await designationService.createDesignation(
    { name: `HR Executive ${RUN_ID}` },
    actor,
  );
  await designationService.deleteDesignation(unreferenced.id, actor);

  const referenced = await designationService.createDesignation(
    { name: `Legal Counsel ${RUN_ID}` },
    actor,
  );
  createdDesignationIds.push(referenced.id);
  await makeEmployee(referenced.id);

  await assert.rejects(() => designationService.deleteDesignation(referenced.id, actor), {
    message:
      'This designation has Employee records referencing it and cannot be deleted - deactivate it instead',
  });
});
