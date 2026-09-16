import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import candidateService from './candidate.service.js';

// Integration coverage for Candidate (docs/domain-recruitment.md §3, ADR-RC02)
// - not a User, no uniqueness constraint on email, and a real hard delete
// (unlike Employee's soft-delete) gated on zero Application references.
// Runs against the real dev database - fixtures namespaced per run and
// fully cleaned up in `after`.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };
const createdCandidateIds = [];

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `candidate-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Candidate Test Actor',
    },
  });
  actor.id = user.id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
  if (createdCandidateIds.length) {
    await prisma.candidate.deleteMany({ where: { id: { in: createdCandidateIds } } });
  }
  await prisma.user.delete({ where: { id: actor.id } });
  await prisma.$disconnect();
});

const makeCandidate = async (overrides = {}) => {
  const candidate = await candidateService.createCandidate(
    { name: 'Jane Doe', email: `jane-${RUN_ID}-${Date.now()}@example.com`, ...overrides },
    actor,
  );
  createdCandidateIds.push(candidate.id);
  return candidate;
};

test('creates a candidate and allows a second candidate with the same email (no uniqueness constraint)', async () => {
  const email = `dup-${RUN_ID}@example.com`;
  const first = await makeCandidate({ email });
  const second = await makeCandidate({ email });

  assert.notEqual(first.id, second.id);
  assert.equal(first.email, second.email);
});

test('updates a candidate', async () => {
  const candidate = await makeCandidate();
  const updated = await candidateService.updateCandidate(
    candidate.id,
    { phone: '+1-555-0100' },
    actor,
  );
  assert.equal(updated.phone, '+1-555-0100');
});

test('lists candidates with pagination and search', async () => {
  const candidate = await makeCandidate({ name: `Searchable Candidate ${RUN_ID}` });

  const { candidates, pagination } = await candidateService.listCandidates({
    page: 1,
    limit: 10,
    search: `Searchable Candidate ${RUN_ID}`,
    sortBy: 'createdAt',
    order: 'desc',
  });

  assert.equal(pagination.total, 1);
  assert.equal(candidates[0].id, candidate.id);
});

test('deleting a candidate with zero Application references succeeds; a referenced one is rejected', async () => {
  const unreferenced = await makeCandidate();
  await candidateService.deleteCandidate(unreferenced.id, actor);

  const gone = await prisma.candidate.findUnique({ where: { id: unreferenced.id } });
  assert.equal(gone, null);

  const referenced = await makeCandidate();
  const department = await prisma.department.create({
    data: { name: `Candidate Delete Guard Department ${RUN_ID}` },
  });
  const designation = await prisma.designation.create({
    data: { name: `Candidate Delete Guard Designation ${RUN_ID}` },
  });
  const requisition = await prisma.jobRequisition.create({
    data: {
      departmentId: department.id,
      designationId: designation.id,
      employmentType: 'FULL_TIME',
      numberOfOpenings: 1,
      remainingOpenings: 1,
    },
  });

  await prisma.application.create({
    data: { candidateId: referenced.id, jobRequisitionId: requisition.id },
  });

  await assert.rejects(() => candidateService.deleteCandidate(referenced.id, actor), {
    message: 'This candidate has Application records referencing it and cannot be deleted',
  });

  await prisma.application.deleteMany({ where: { candidateId: referenced.id } });
  await prisma.jobRequisition.delete({ where: { id: requisition.id } });
  await prisma.department.delete({ where: { id: department.id } });
  await prisma.designation.delete({ where: { id: designation.id } });
});
