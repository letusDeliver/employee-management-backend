import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import trainingProgramService from './trainingProgram.service.js';

// Integration coverage for TrainingProgram (docs/domain-training.md §2) -
// master data, same status-lifecycle shape as Branch/Department/
// Designation/Shift/LeaveType/ReviewCycle. Runs against the real dev
// database - fixtures namespaced per run and fully cleaned up in `after`.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };
const createdProgramIds = [];

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `training-program-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Training Program Test Actor',
    },
  });
  actor.id = user.id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
  if (createdProgramIds.length) {
    await prisma.trainingProgram.deleteMany({ where: { id: { in: createdProgramIds } } });
  }
  await prisma.user.delete({ where: { id: actor.id } });
  await prisma.$disconnect();
});

const makeProgram = async (overrides = {}) => {
  const program = await trainingProgramService.createTrainingProgram(
    { name: `Security Awareness ${RUN_ID}-${Date.now()}-${Math.random()}`, ...overrides },
    actor,
  );
  createdProgramIds.push(program.id);
  return program;
};

test('creates a training program and rejects a duplicate name (case-insensitive)', async () => {
  const name = `Annual Compliance ${RUN_ID}`;
  const program = await makeProgram({ name, mandatory: true, renewalPeriodDays: 365 });

  assert.equal(program.status, 'ACTIVE');
  assert.equal(program.mandatory, true);
  assert.equal(program.renewalPeriodDays, 365);

  await assert.rejects(() => makeProgram({ name: name.toLowerCase() }), {
    message: 'A training program with this name already exists',
  });
});

test('lists training programs with pagination, search, and mandatory filter', async () => {
  const program = await makeProgram({ name: `Findable Program ${RUN_ID}`, mandatory: true });

  const { trainingPrograms, pagination } = await trainingProgramService.listTrainingPrograms({
    page: 1,
    limit: 10,
    search: `Findable Program ${RUN_ID}`,
    mandatory: true,
    sortBy: 'createdAt',
    order: 'desc',
  });

  assert.equal(pagination.total, 1);
  assert.equal(trainingPrograms[0].id, program.id);
});

test('deactivating a program blocks future assignment but keeps existing links intact', async () => {
  const program = await makeProgram();

  const updated = await trainingProgramService.updateTrainingProgram(
    program.id,
    { status: 'INACTIVE' },
    actor,
  );
  assert.equal(updated.status, 'INACTIVE');

  await assert.rejects(
    () => trainingProgramService.assertTrainingProgramAssignable(program.id),
    { message: 'trainingProgramId: this training program is not active and cannot be assigned' },
  );
});

test('assertTrainingProgramAssignable rejects a nonexistent trainingProgramId', async () => {
  await assert.rejects(
    () =>
      trainingProgramService.assertTrainingProgramAssignable('00000000-0000-0000-0000-000000000000'),
    { message: 'trainingProgramId: references a record that does not exist' },
  );
});

test('deleting a training program with zero Enrollment references succeeds; a referenced one is rejected', async () => {
  const unreferenced = await makeProgram();
  await trainingProgramService.deleteTrainingProgram(unreferenced.id, actor);

  const gone = await prisma.trainingProgram.findUnique({ where: { id: unreferenced.id } });
  assert.equal(gone, null);

  const referenced = await makeProgram();
  const department = await prisma.department.create({
    data: { name: `Training Delete Guard Department ${RUN_ID}` },
  });
  const designation = await prisma.designation.create({
    data: { name: `Training Delete Guard Designation ${RUN_ID}` },
  });
  const employee = await prisma.employee.create({
    data: {
      departmentId: department.id,
      designationId: designation.id,
      employmentType: 'FULL_TIME',
      salary: 1000,
      dateOfJoining: new Date('2020-01-01'),
    },
  });

  await prisma.enrollment.create({
    data: { employeeId: employee.id, trainingProgramId: referenced.id },
  });

  await assert.rejects(() => trainingProgramService.deleteTrainingProgram(referenced.id, actor), {
    message:
      'This training program has Enrollment records referencing it and cannot be deleted - deactivate it instead',
  });

  await prisma.enrollment.deleteMany({ where: { trainingProgramId: referenced.id } });
  await prisma.employee.delete({ where: { id: employee.id } });
  await prisma.department.delete({ where: { id: department.id } });
  await prisma.designation.delete({ where: { id: designation.id } });
});
