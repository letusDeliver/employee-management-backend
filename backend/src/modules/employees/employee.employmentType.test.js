import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import employeeService from './employee.service.js';

// Coverage for the Employment Type domain (docs/domain-employment-type.md).
// Unlike Branch/Department/Designation, there is no service/repository of
// its own to test (ADR-ET01: a closed enum, not a managed aggregate) - this
// suite exists purely to verify Employee's employmentType field behaves as
// a mandatory, closed-enum value. Runs against the real dev database, same
// convention as the other domain suites.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };
const createdEmployeeIds = [];
let testDepartmentId;
let testDesignationId;

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `employment-type-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Employment Type Test Actor',
    },
  });
  actor.id = user.id;

  const department = await prisma.department.create({
    data: { name: `Employment Type Test Department ${RUN_ID}` },
  });
  testDepartmentId = department.id;

  const designation = await prisma.designation.create({
    data: { name: `Employment Type Test Designation ${RUN_ID}` },
  });
  testDesignationId = designation.id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
  if (createdEmployeeIds.length) {
    await prisma.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
  }
  await prisma.department.delete({ where: { id: testDepartmentId } });
  await prisma.designation.delete({ where: { id: testDesignationId } });
  await prisma.user.delete({ where: { id: actor.id } });
  await prisma.$disconnect();
});

const baseEmployeeData = () => ({
  departmentId: testDepartmentId,
  designationId: testDesignationId,
  salary: 1000,
  dateOfJoining: new Date(),
});

test('employee creation accepts each of the four valid employmentType values', async () => {
  for (const employmentType of ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']) {
    const employee = await employeeService.createEmployee(
      { ...baseEmployeeData(), employmentType },
      actor,
    );
    createdEmployeeIds.push(employee.id);

    assert.equal(employee.employmentType, employmentType);
  }
});

test('employee creation rejects an invalid employmentType value', async () => {
  await assert.rejects(
    () =>
      employeeService.createEmployee(
        { ...baseEmployeeData(), employmentType: 'FREELANCER' },
        actor,
      ),
    (error) => error.message.includes('employmentType'),
  );
});

test('employmentType conversion overwrites the current value on update', async () => {
  const employee = await employeeService.createEmployee(
    { ...baseEmployeeData(), employmentType: 'INTERN' },
    actor,
  );
  createdEmployeeIds.push(employee.id);

  const updated = await employeeService.updateEmployee(
    employee.id,
    { employmentType: 'FULL_TIME' },
    actor,
  );

  assert.equal(updated.employmentType, 'FULL_TIME');
});
