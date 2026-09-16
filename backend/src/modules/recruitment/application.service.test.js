import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../../config/database.js';
import applicationService from './application.service.js';
import jobRequisitionService from './jobRequisition.service.js';
import candidateService from './candidate.service.js';

// Integration coverage for Application/Interview/Offer/Hire
// (docs/domain-recruitment.md) - the Application status state machine
// (sequential forward stages, REJECTED/WITHDRAWN from any non-terminal
// stage, HIRED blocked outside the dedicated hire action), the one-
// PENDING-offer-per-Application invariant (§4), and the Hire Orchestration
// Service boundary into employeeOnboarding (ADR-RC03) - including openings
// decrement/auto-close and both the "reuse an existing User" and "create a
// new User" onboarding paths. Runs against the real dev database - fixtures
// namespaced per run and fully cleaned up in `after`.
const RUN_ID = Date.now();
const actor = { id: null, ipAddress: '127.0.0.1' };

const createdRequisitionIds = [];
const createdCandidateIds = [];
const createdApplicationIds = [];
const createdEmployeeIds = [];
const createdUserIds = [];

let testDepartmentId;
let testDesignationId;
let testInterviewerId;

before(async () => {
  const user = await prisma.user.create({
    data: {
      email: `application-test-actor-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Application Test Actor',
    },
  });
  actor.id = user.id;

  const department = await prisma.department.create({
    data: { name: `Application Test Department ${RUN_ID}` },
  });
  testDepartmentId = department.id;

  const designation = await prisma.designation.create({
    data: { name: `Application Test Designation ${RUN_ID}` },
  });
  testDesignationId = designation.id;

  const interviewerEmployee = await prisma.employee.create({
    data: {
      departmentId: testDepartmentId,
      designationId: testDesignationId,
      employmentType: 'FULL_TIME',
      salary: 1000,
      dateOfJoining: new Date('2020-01-01'),
    },
  });
  testInterviewerId = interviewerEmployee.id;
  createdEmployeeIds.push(interviewerEmployee.id);
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [actor.id, ...createdUserIds] } } });
  if (createdApplicationIds.length) {
    await prisma.offer.deleteMany({ where: { applicationId: { in: createdApplicationIds } } });
    await prisma.interview.deleteMany({ where: { applicationId: { in: createdApplicationIds } } });
    await prisma.application.deleteMany({ where: { id: { in: createdApplicationIds } } });
  }
  if (createdCandidateIds.length) {
    await prisma.candidate.deleteMany({ where: { id: { in: createdCandidateIds } } });
  }
  if (createdRequisitionIds.length) {
    await prisma.jobRequisition.deleteMany({ where: { id: { in: createdRequisitionIds } } });
  }
  if (createdEmployeeIds.length) {
    await prisma.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
  }
  await prisma.department.delete({ where: { id: testDepartmentId } });
  await prisma.designation.delete({ where: { id: testDesignationId } });
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.user.delete({ where: { id: actor.id } });
  await prisma.$disconnect();
});

const makeRequisition = async (overrides = {}) => {
  const requisition = await jobRequisitionService.createJobRequisition(
    {
      departmentId: testDepartmentId,
      designationId: testDesignationId,
      employmentType: 'FULL_TIME',
      numberOfOpenings: 1,
      ...overrides,
    },
    actor,
  );
  createdRequisitionIds.push(requisition.id);
  return requisition;
};

const makeCandidate = async (overrides = {}) => {
  const candidate = await candidateService.createCandidate(
    { name: 'Application Test Candidate', email: `app-${RUN_ID}-${Date.now()}-${Math.random()}@example.com`, ...overrides },
    actor,
  );
  createdCandidateIds.push(candidate.id);
  return candidate;
};

const makeApplication = async (candidate, requisition) => {
  const application = await applicationService.createApplication(
    { candidateId: candidate.id, jobRequisitionId: requisition.id },
    actor,
  );
  createdApplicationIds.push(application.id);
  return application;
};

// Walks an application through to the Offer stage and creates+accepts an
// Offer against it, returning the fully-loaded application (with offers).
const advanceToAcceptedOffer = async (application, { salary = 90000, startDate } = {}) => {
  await applicationService.updateApplicationStatus(application.id, 'SCREENING', actor);
  await applicationService.updateApplicationStatus(application.id, 'INTERVIEW', actor);
  await applicationService.updateApplicationStatus(application.id, 'OFFER', actor);

  const offer = await applicationService.createOffer(
    application.id,
    { salary, startDate: startDate ?? new Date('2027-01-01') },
    actor,
  );
  await applicationService.acceptOffer(offer.id, actor);

  return applicationService.getApplicationById(application.id);
};

test('createApplication rejects a non-OPEN/ON_HOLD requisition and a nonexistent candidateId', async () => {
  const requisition = await makeRequisition();
  const candidate = await makeCandidate();

  const application = await makeApplication(candidate, requisition);
  assert.equal(application.status, 'APPLIED');

  await jobRequisitionService.updateJobRequisitionStatus(requisition.id, 'CANCELLED', actor);

  await assert.rejects(() => makeApplication(candidate, requisition), {
    message: 'jobRequisitionId: this requisition is no longer accepting applications',
  });

  await assert.rejects(
    () =>
      applicationService.createApplication(
        { candidateId: '00000000-0000-0000-0000-000000000000', jobRequisitionId: requisition.id },
        actor,
      ),
    { message: 'candidateId: references a record that does not exist' },
  );
});

test('application status transitions: strictly sequential forward, REJECTED/WITHDRAWN from any non-terminal stage, HIRED blocked, terminal states have no outgoing transition', async () => {
  const requisition = await makeRequisition();
  const candidate = await makeCandidate();
  const application = await makeApplication(candidate, requisition);

  await assert.rejects(
    () => applicationService.updateApplicationStatus(application.id, 'OFFER', actor),
    { message: 'Cannot transition an application from APPLIED to OFFER' },
  );

  const screening = await applicationService.updateApplicationStatus(
    application.id,
    'SCREENING',
    actor,
  );
  assert.equal(screening.status, 'SCREENING');

  const withdrawn = await applicationService.updateApplicationStatus(
    application.id,
    'WITHDRAWN',
    actor,
  );
  assert.equal(withdrawn.status, 'WITHDRAWN');

  await assert.rejects(
    () => applicationService.updateApplicationStatus(application.id, 'SCREENING', actor),
    { message: 'Cannot transition an application from WITHDRAWN to SCREENING' },
  );

  const second = await makeApplication(candidate, await makeRequisition());
  await advanceToAcceptedOffer(second);

  await assert.rejects(
    () => applicationService.updateApplicationStatus(second.id, 'HIRED', actor),
    { message: 'Cannot transition an application from OFFER to HIRED' },
  );
});

test('interviews: create, list, update (feedback/recommendation), delete; bad interviewerId is rejected', async () => {
  const requisition = await makeRequisition();
  const candidate = await makeCandidate();
  const application = await makeApplication(candidate, requisition);

  const interview = await applicationService.createInterview(
    application.id,
    { interviewerId: testInterviewerId, scheduledAt: new Date('2026-10-01T14:00:00.000Z') },
    actor,
  );
  assert.equal(interview.recommendation, null);

  const interviews = await applicationService.listInterviews(application.id);
  assert.equal(interviews.length, 1);

  const updated = await applicationService.updateInterview(
    application.id,
    interview.id,
    { feedback: 'Strong fundamentals', recommendation: 'YES' },
    actor,
  );
  assert.equal(updated.recommendation, 'YES');

  await applicationService.deleteInterview(application.id, interview.id, actor);
  const afterDelete = await applicationService.listInterviews(application.id);
  assert.equal(afterDelete.length, 0);

  await assert.rejects(
    () =>
      applicationService.createInterview(
        application.id,
        { interviewerId: '00000000-0000-0000-0000-000000000000', scheduledAt: new Date() },
        actor,
      ),
    { message: 'interviewerId: references a record that does not exist' },
  );
});

test('offers: only creatable in the Offer stage, only one Pending at a time, only a Pending offer transitions', async () => {
  const requisition = await makeRequisition();
  const candidate = await makeCandidate();
  const application = await makeApplication(candidate, requisition);

  await assert.rejects(
    () => applicationService.createOffer(application.id, { salary: 90000, startDate: new Date() }, actor),
    { message: 'This application must be in the Offer stage before an Offer can be created (§4)' },
  );

  await applicationService.updateApplicationStatus(application.id, 'SCREENING', actor);
  await applicationService.updateApplicationStatus(application.id, 'INTERVIEW', actor);
  await applicationService.updateApplicationStatus(application.id, 'OFFER', actor);

  const firstOffer = await applicationService.createOffer(
    application.id,
    { salary: 90000, startDate: new Date('2027-01-01') },
    actor,
  );
  assert.equal(firstOffer.status, 'PENDING');

  await assert.rejects(
    () =>
      applicationService.createOffer(
        application.id,
        { salary: 95000, startDate: new Date('2027-02-01') },
        actor,
      ),
    {
      message:
        'This application already has a Pending offer - decline, expire, or accept it before creating a new one',
    },
  );

  const declined = await applicationService.declineOffer(firstOffer.id, actor);
  assert.equal(declined.status, 'DECLINED');

  await assert.rejects(() => applicationService.declineOffer(firstOffer.id, actor), {
    message: 'Cannot transition an offer from DECLINED to DECLINED',
  });

  const secondOffer = await applicationService.createOffer(
    application.id,
    { salary: 95000, startDate: new Date('2027-02-01') },
    actor,
  );
  const accepted = await applicationService.acceptOffer(secondOffer.id, actor);
  assert.equal(accepted.status, 'ACCEPTED');
});

test('hireApplication (no access provisioning): creates an unlinked Employee, decrements openings, auto-closes the requisition, and blocks a second hire once exhausted', async () => {
  const requisition = await makeRequisition({ numberOfOpenings: 1 });
  const candidate = await makeCandidate();
  const application = await makeApplication(candidate, requisition);
  await advanceToAcceptedOffer(application, {
    salary: 88000,
    startDate: new Date('2027-03-01'),
  });

  const result = await applicationService.hireApplication(application.id, {}, actor);
  createdEmployeeIds.push(result.employee.id);

  assert.equal(result.application.status, 'HIRED');
  assert.equal(result.application.hiredEmployeeId, result.employee.id);
  assert.equal(result.userId, null);
  assert.equal(result.employee.userId, null);
  assert.equal(String(result.employee.salary), '88000');
  assert.equal(result.employee.departmentId, testDepartmentId);
  assert.equal(result.employee.designationId, testDesignationId);
  assert.equal(
    new Date(result.employee.dateOfJoining).toISOString(),
    new Date('2027-03-01').toISOString(),
  );

  const closedRequisition = await jobRequisitionService.getJobRequisitionById(requisition.id);
  assert.equal(closedRequisition.status, 'CLOSED');
  assert.equal(closedRequisition.remainingOpenings, 0);

  const secondCandidate = await makeCandidate();
  const secondApplication = await makeApplication(secondCandidate, await makeRequisition());
  // Force the second application's own requisition CLOSED to simulate
  // attempting to hire against an exhausted one directly.
  await advanceToAcceptedOffer(secondApplication);
  await prisma.jobRequisition.update({
    where: { id: secondApplication.jobRequisitionId },
    data: { status: 'CLOSED', remainingOpenings: 0 },
  });

  await assert.rejects(
    () => applicationService.hireApplication(secondApplication.id, {}, actor),
    {
      message: 'This job requisition is no longer OPEN or has no remaining openings - cannot hire',
    },
  );
});

test('hireApplication requires the Offer stage with an Accepted offer', async () => {
  const requisition = await makeRequisition();
  const candidate = await makeCandidate();
  const application = await makeApplication(candidate, requisition);

  await assert.rejects(() => applicationService.hireApplication(application.id, {}, actor), {
    message: 'An application must be in the Offer stage to be hired',
  });

  await applicationService.updateApplicationStatus(application.id, 'SCREENING', actor);
  await applicationService.updateApplicationStatus(application.id, 'INTERVIEW', actor);
  await applicationService.updateApplicationStatus(application.id, 'OFFER', actor);
  await applicationService.createOffer(
    application.id,
    { salary: 90000, startDate: new Date('2027-01-01') },
    actor,
  );

  await assert.rejects(() => applicationService.hireApplication(application.id, {}, actor), {
    message: 'This application has no Accepted offer to hire against',
  });
});

test('hireApplication with provisionAccess: creates a new User when none exists for the candidate’s email, reuses an existing one otherwise, and requires initialPassword only for the new-User path', async () => {
  const requisition = await makeRequisition({ numberOfOpenings: 2 });

  // New-User path.
  const newHireEmail = `new-hire-${RUN_ID}@example.com`;
  const candidateA = await makeCandidate({ name: 'New Hire', email: newHireEmail });
  const applicationA = await makeApplication(candidateA, requisition);
  await advanceToAcceptedOffer(applicationA);

  await assert.rejects(
    () =>
      applicationService.hireApplication(
        applicationA.id,
        { provisionAccess: true },
        actor,
      ),
    {
      message:
        'initialPassword: required when provisioning access for a candidate with no existing User account',
    },
  );

  const resultA = await applicationService.hireApplication(
    applicationA.id,
    { provisionAccess: true, initialPassword: 'a-strong-password-123' },
    actor,
  );
  createdEmployeeIds.push(resultA.employee.id);
  createdUserIds.push(resultA.userId);

  assert.ok(resultA.userId);
  assert.equal(resultA.employee.userId, resultA.userId);

  const createdUser = await prisma.user.findUnique({ where: { id: resultA.userId } });
  assert.equal(createdUser.email, newHireEmail);

  const roles = await prisma.userRole.findMany({
    where: { userId: resultA.userId },
    include: { role: true },
  });
  assert.ok(roles.some((r) => r.role.name === 'EMPLOYEE'));

  // Reuse-existing-User path (rehire) - a User already exists for this
  // email with no live Employee.
  const existingUser = await prisma.user.create({
    data: {
      email: `rehire-${RUN_ID}@example.com`,
      password: 'not-a-real-hash',
      name: 'Rehire Candidate',
    },
  });
  createdUserIds.push(existingUser.id);

  const candidateB = await makeCandidate({ name: 'Rehire Candidate', email: existingUser.email });
  const applicationB = await makeApplication(candidateB, requisition);
  await advanceToAcceptedOffer(applicationB);

  const resultB = await applicationService.hireApplication(
    applicationB.id,
    { provisionAccess: true },
    actor,
  );
  createdEmployeeIds.push(resultB.employee.id);

  assert.equal(resultB.userId, existingUser.id);
  assert.equal(resultB.employee.userId, existingUser.id);
});
