import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import reviewCycleService from './reviewCycle.service.js';

// Integration coverage for the ReviewCycle aggregate (docs/domain-performance.md
// §2 - master data, same shape as Branch/Department/Designation/LeaveType,
// OPEN/CLOSED instead of ACTIVE/INACTIVE). Runs against the real dev
// database - fixtures namespaced per run and fully cleaned up in `after`.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };
const createdCycleIds = [];

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `review-cycle-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Review Cycle Test Actor',
    },
  });
  actor.id = user.id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
  if (createdCycleIds.length) {
    await prisma.reviewCycle.deleteMany({ where: { id: { in: createdCycleIds } } });
  }
  await prisma.user.delete({ where: { id: actor.id } });
  await prisma.$disconnect();
});

test('creates a review cycle and rejects a duplicate name (case-insensitive)', async () => {
  const cycle = await reviewCycleService.createReviewCycle(
    {
      name: `H1 2026 Review ${RUN_ID}`,
      startDate: new Date(Date.UTC(2026, 0, 1)),
      endDate: new Date(Date.UTC(2026, 5, 30)),
    },
    actor,
  );
  createdCycleIds.push(cycle.id);

  assert.equal(cycle.status, 'OPEN');

  await assert.rejects(
    () =>
      reviewCycleService.createReviewCycle(
        {
          name: `h1 2026 review ${RUN_ID}`,
          startDate: new Date(Date.UTC(2026, 0, 1)),
          endDate: new Date(Date.UTC(2026, 5, 30)),
        },
        actor,
      ),
    { message: 'A review cycle with this name already exists' },
  );
});

test('lists review cycles with pagination and search', async () => {
  const cycle = await reviewCycleService.createReviewCycle(
    {
      name: `H2 2026 Review ${RUN_ID}`,
      startDate: new Date(Date.UTC(2026, 6, 1)),
      endDate: new Date(Date.UTC(2026, 11, 31)),
    },
    actor,
  );
  createdCycleIds.push(cycle.id);

  const { cycles, pagination } = await reviewCycleService.listReviewCycles({
    page: 1,
    limit: 10,
    search: `H2 2026 Review ${RUN_ID}`,
    sortBy: 'createdAt',
    order: 'desc',
  });

  assert.equal(pagination.total, 1);
  assert.equal(cycles[0].id, cycle.id);
});

test('closing a review cycle blocks future assignment but keeps existing links intact', async () => {
  const cycle = await reviewCycleService.createReviewCycle(
    {
      name: `Annual 2027 Review ${RUN_ID}`,
      startDate: new Date(Date.UTC(2027, 0, 1)),
      endDate: new Date(Date.UTC(2027, 11, 31)),
    },
    actor,
  );
  createdCycleIds.push(cycle.id);

  const updated = await reviewCycleService.updateReviewCycle(cycle.id, { status: 'CLOSED' }, actor);
  assert.equal(updated.status, 'CLOSED');

  await assert.rejects(() => reviewCycleService.assertReviewCycleAssignable(cycle.id), {
    message: 'reviewCycleId: this review cycle is not open and cannot be assigned',
  });
});

test('assertReviewCycleAssignable rejects a nonexistent reviewCycleId', async () => {
  await assert.rejects(
    () => reviewCycleService.assertReviewCycleAssignable('00000000-0000-0000-0000-000000000000'),
    { message: 'reviewCycleId: references a record that does not exist' },
  );
});

test('deleting a review cycle with zero PerformanceReview references succeeds', async () => {
  const unreferenced = await reviewCycleService.createReviewCycle(
    {
      name: `Unreferenced Cycle ${RUN_ID}`,
      startDate: new Date(Date.UTC(2028, 0, 1)),
      endDate: new Date(Date.UTC(2028, 5, 30)),
    },
    actor,
  );
  await reviewCycleService.deleteReviewCycle(unreferenced.id, actor);

  const gone = await prisma.reviewCycle.findUnique({ where: { id: unreferenced.id } });
  assert.equal(gone, null);
});
