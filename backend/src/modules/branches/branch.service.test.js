import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import branchService from './branch.service.js';
import employeeService from '../employees/employee.service.js';

// Integration coverage for the Branch domain (docs/domain-branch.md). Runs
// against the real dev database, the same convention established by
// employee.service.test.js on the ADR-006 branch - fixtures are namespaced
// per run and fully cleaned up in `after`.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };
const createdEmployeeIds = [];
const createdBranchIds = [];
let testDepartmentId;
let testDesignationId;

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `branch-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Branch Test Actor',
    },
  });
  actor.id = user.id;

  // Employee.departmentId and Employee.designationId are both mandatory
  // (docs/domain-department.md ADR-D07, docs/domain-designation.md ADR-DS07) -
  // every fixture Employee created below needs a real Department and
  // Designation to reference, even though this suite's actual subject is Branch.
  const department = await prisma.department.create({
    data: { name: `Branch Test Department ${RUN_ID}` },
  });
  testDepartmentId = department.id;

  const designation = await prisma.designation.create({
    data: { name: `Branch Test Designation ${RUN_ID}` },
  });
  testDesignationId = designation.id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
  if (createdEmployeeIds.length) {
    await prisma.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
  }
  if (createdBranchIds.length) {
    await prisma.branch.deleteMany({ where: { id: { in: createdBranchIds } } });
  }
  await prisma.department.delete({ where: { id: testDepartmentId } });
  await prisma.designation.delete({ where: { id: testDesignationId } });
  await prisma.user.delete({ where: { id: actor.id } });
  await prisma.$disconnect();
});

const makeEmployee = async (branchId) => {
  const employee = await prisma.employee.create({
    data: {
      departmentId: testDepartmentId,
      designationId: testDesignationId,
      salary: 1000,
      dateOfJoining: new Date(),
      branchId,
    },
  });
  createdEmployeeIds.push(employee.id);
  return employee;
};

test('creates a branch and rejects a duplicate name', async () => {
  const branch = await branchService.createBranch(
    { name: `Bengaluru HQ ${RUN_ID}`, code: `BLR-${RUN_ID}` },
    actor,
  );
  createdBranchIds.push(branch.id);

  assert.equal(branch.status, 'ACTIVE');

  await assert.rejects(
    () => branchService.createBranch({ name: `Bengaluru HQ ${RUN_ID}` }, actor),
    { message: 'A branch with this name or code already exists' },
  );
});

test('lists branches with pagination and search', async () => {
  const branch = await branchService.createBranch({ name: `Pune Office ${RUN_ID}` }, actor);
  createdBranchIds.push(branch.id);

  const { branches, pagination } = await branchService.listBranches({
    page: 1,
    limit: 10,
    search: `Pune Office ${RUN_ID}`,
    sortBy: 'createdAt',
    order: 'desc',
  });

  assert.equal(pagination.total, 1);
  assert.equal(branches[0].id, branch.id);
});

test('deactivating a branch blocks future assignment but keeps existing links intact', async () => {
  const branch = await branchService.createBranch({ name: `Chennai Site ${RUN_ID}` }, actor);
  createdBranchIds.push(branch.id);

  const employee = await makeEmployee(branch.id);

  const updated = await branchService.updateBranch(branch.id, { status: 'INACTIVE' }, actor);
  assert.equal(updated.status, 'INACTIVE');

  await assert.rejects(() => branchService.assertBranchAssignable(branch.id), {
    message: 'branchId: this branch is not active and cannot be assigned',
  });

  const stillLinked = await prisma.employee.findUnique({ where: { id: employee.id } });
  assert.equal(stillLinked.branchId, branch.id);
});

test('assertBranchAssignable rejects a nonexistent branchId', async () => {
  await assert.rejects(
    () => branchService.assertBranchAssignable('00000000-0000-0000-0000-000000000000'),
    { message: 'branchId: references a record that does not exist' },
  );
});

test('employee creation honors the branch assignability check', async () => {
  const activeBranch = await branchService.createBranch({ name: `Mumbai Site ${RUN_ID}` }, actor);
  createdBranchIds.push(activeBranch.id);

  const employee = await employeeService.createEmployee(
    {
      departmentId: testDepartmentId,
      designationId: testDesignationId,
      salary: 2000,
      dateOfJoining: new Date(),
      branchId: activeBranch.id,
    },
    actor,
  );
  createdEmployeeIds.push(employee.id);

  assert.equal(employee.branchId, activeBranch.id);

  await assert.rejects(
    () =>
      employeeService.createEmployee(
        {
          departmentId: testDepartmentId,
          designationId: testDesignationId,
          salary: 2000,
          dateOfJoining: new Date(),
          branchId: '00000000-0000-0000-0000-000000000000',
        },
        actor,
      ),
    { message: 'branchId: references a record that does not exist' },
  );
});

test('deleting a branch with zero Employee references succeeds; deleting a referenced one is rejected', async () => {
  const unreferenced = await branchService.createBranch({ name: `Delhi Site ${RUN_ID}` }, actor);
  await branchService.deleteBranch(unreferenced.id, actor);

  const referenced = await branchService.createBranch({ name: `Hyderabad Site ${RUN_ID}` }, actor);
  createdBranchIds.push(referenced.id);
  await makeEmployee(referenced.id);

  await assert.rejects(() => branchService.deleteBranch(referenced.id, actor), {
    message:
      'This branch has Employee records referencing it and cannot be deleted - deactivate it instead',
  });
});
