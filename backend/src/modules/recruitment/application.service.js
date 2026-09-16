import prisma from '../../config/database.js';
import applicationRepository from './application.repository.js';
import candidateRepository from './candidate.repository.js';
import jobRequisitionRepository from './jobRequisition.repository.js';
import interviewRepository from './interview.repository.js';
import offerRepository from './offer.repository.js';
import employeeOnboardingService from '../employeeOnboarding/employeeOnboarding.service.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import NotFoundError from '../../errors/NotFoundError.js';
import ConflictError from '../../errors/ConflictError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

const FORWARD_STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER'];
const TERMINAL_STATES = ['HIRED', 'REJECTED', 'WITHDRAWN'];

// APPLIED->SCREENING->INTERVIEW->OFFER is strictly sequential, no skipping
// (consistent with every other guarded workflow in this project).
// REJECTED/WITHDRAWN are reachable from any non-terminal forward stage.
// HIRED is never reachable here - only through hireApplication below, so
// its onboarding side-effect always fires. No outgoing transition exists
// from any terminal state.
const isValidApplicationTransition = (current, target) => {
  if (TERMINAL_STATES.includes(current)) {
    return false;
  }

  if (target === 'REJECTED' || target === 'WITHDRAWN') {
    return FORWARD_STAGES.includes(current);
  }

  const currentIndex = FORWARD_STAGES.indexOf(current);
  const targetIndex = FORWARD_STAGES.indexOf(target);

  return targetIndex === currentIndex + 1;
};

const createApplication = async (data, actor) => {
  const candidate = await candidateRepository.findById(data.candidateId);

  if (!candidate) {
    throw new BadRequestError('candidateId: references a record that does not exist');
  }

  const jobRequisition = await jobRequisitionRepository.findById(data.jobRequisitionId);

  if (!jobRequisition) {
    throw new BadRequestError('jobRequisitionId: references a record that does not exist');
  }

  if (!['OPEN', 'ON_HOLD'].includes(jobRequisition.status)) {
    throw new BadRequestError(
      'jobRequisitionId: this requisition is no longer accepting applications',
    );
  }

  return prisma.$transaction(async (tx) => {
    const application = await applicationRepository.create(data, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: AUDIT_ENTITY_TYPES.APPLICATION,
        entityId: application.id,
        beforeData: null,
        afterData: normalizeForAudit(application),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return application;
  });
};

const getApplicationById = async (id) => {
  const application = await applicationRepository.findById(id);

  if (!application) {
    throw new NotFoundError('Application not found');
  }

  return application;
};

const buildApplicationWhere = ({ candidateId, jobRequisitionId, status }) => {
  const where = {};

  if (candidateId) {
    where.candidateId = candidateId;
  }

  if (jobRequisitionId) {
    where.jobRequisitionId = jobRequisitionId;
  }

  if (status) {
    where.status = status;
  }

  return where;
};

const listApplications = async (query) => {
  const { page, limit, sortBy, order, ...filters } = query;
  const where = buildApplicationWhere(filters);

  const [applications, total] = await Promise.all([
    applicationRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    applicationRepository.count(where),
  ]);

  return {
    applications,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const updateApplicationStatus = async (id, status, actor) => {
  const application = await applicationRepository.findById(id);

  if (!application) {
    throw new NotFoundError('Application not found');
  }

  if (!isValidApplicationTransition(application.status, status)) {
    throw new ConflictError(`Cannot transition an application from ${application.status} to ${status}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await applicationRepository.update(id, { status }, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.APPLICATION,
        entityId: id,
        beforeData: normalizeForAudit(application),
        afterData: normalizeForAudit(updated),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return updated;
  });
};

// --- Interviews (child of Application) ---

const createInterview = async (applicationId, data, actor) => {
  const application = await applicationRepository.findById(applicationId);

  if (!application) {
    throw new NotFoundError('Application not found');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const interview = await interviewRepository.create({ ...data, applicationId }, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.INTERVIEW,
          entityId: interview.id,
          beforeData: null,
          afterData: normalizeForAudit(interview),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return interview;
    });
  } catch (error) {
    if (error.code === 'P2003') {
      throw new BadRequestError('interviewerId: references a record that does not exist');
    }

    throw error;
  }
};

const listInterviews = async (applicationId) => {
  const application = await applicationRepository.findById(applicationId);

  if (!application) {
    throw new NotFoundError('Application not found');
  }

  return interviewRepository.findAllByApplicationId(applicationId);
};

const updateInterview = async (applicationId, interviewId, data, actor) => {
  const interview = await interviewRepository.findById(interviewId, applicationId);

  if (!interview) {
    throw new NotFoundError('Interview not found');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await interviewRepository.update(interviewId, data, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.INTERVIEW,
        entityId: interviewId,
        beforeData: normalizeForAudit(interview),
        afterData: normalizeForAudit(updated),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return updated;
  });
};

const deleteInterview = async (applicationId, interviewId, actor) => {
  const interview = await interviewRepository.findById(interviewId, applicationId);

  if (!interview) {
    throw new NotFoundError('Interview not found');
  }

  await prisma.$transaction(async (tx) => {
    await interviewRepository.remove(interviewId, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.INTERVIEW,
        entityId: interviewId,
        beforeData: normalizeForAudit(interview),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });
};

// --- Offers (child of Application) ---

const DUPLICATE_PENDING_OFFER_MESSAGE =
  'This application already has a Pending offer - decline, expire, or accept it before creating a new one';

const createOffer = async (applicationId, data, actor) => {
  const application = await applicationRepository.findById(applicationId);

  if (!application) {
    throw new NotFoundError('Application not found');
  }

  if (application.status !== 'OFFER') {
    throw new BadRequestError(
      'This application must be in the Offer stage before an Offer can be created (§4)',
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const offer = await offerRepository.create({ ...data, applicationId }, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.OFFER,
          entityId: offer.id,
          beforeData: null,
          afterData: normalizeForAudit(offer),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return offer;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_PENDING_OFFER_MESSAGE);
    }

    throw error;
  }
};

const transitionOffer = async (offerId, targetStatus, actor) => {
  const offer = await offerRepository.findById(offerId);

  if (!offer) {
    throw new NotFoundError('Offer not found');
  }

  if (offer.status !== 'PENDING') {
    throw new ConflictError(`Cannot transition an offer from ${offer.status} to ${targetStatus}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await offerRepository.update(offerId, { status: targetStatus }, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.OFFER,
        entityId: offerId,
        beforeData: normalizeForAudit(offer),
        afterData: normalizeForAudit(updated),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return updated;
  });
};

const acceptOffer = (offerId, actor) => transitionOffer(offerId, 'ACCEPTED', actor);
const declineOffer = (offerId, actor) => transitionOffer(offerId, 'DECLINED', actor);
const expireOffer = (offerId, actor) => transitionOffer(offerId, 'EXPIRED', actor);

// --- Hire (the single boundary into Identity, ADR-RC03) ---

// The Hire Orchestration Service: reads the Application/Candidate/
// JobRequisition/accepted-Offer data and invokes employeeOnboarding's
// onboardEmployee - Identity's own, unmodified onboarding process
// (docs/domain-identity-employee-lifecycle.md §2) - exactly as if an
// administrator had entered the same data directly (ADR-RC03). No other
// component in this module creates Employee/User records.
const hireApplication = async (applicationId, data, actor) => {
  const application = await applicationRepository.findById(applicationId);

  if (!application) {
    throw new NotFoundError('Application not found');
  }

  if (application.status !== 'OFFER') {
    throw new BadRequestError('An application must be in the Offer stage to be hired');
  }

  const acceptedOffer = application.offers.find((offer) => offer.status === 'ACCEPTED');

  if (!acceptedOffer) {
    throw new BadRequestError('This application has no Accepted offer to hire against');
  }

  // Everything below - the openings decrement, the User/Employee onboarding,
  // and the Application's HIRED transition - runs inside one outer
  // transaction (employeeOnboardingService.onboardEmployee accepts the same
  // tx, which in turn passes it through to employeeService.createEmployee).
  // Without this, a crash between steps could leave a decremented-but-
  // never-hired requisition (a "leaked" opening) or a hired Employee whose
  // Application was never marked HIRED - the same "no partial failure"
  // invariant docs/domain-identity-employee-lifecycle.md §3 requires for
  // onboarding, extended here to the cross-aggregate write hiring performs.
  return prisma.$transaction(async (tx) => {
    // §4's mandatory invariant, read conjunctively ("still OPEN (or has
    // remaining openings)" - both conditions together, not either/or): a
    // requisition placed ON_HOLD after this application reached the Offer
    // stage must block the hire, not silently let it through. A single
    // guarded UPDATE (jobRequisition.repository.js), not a separate
    // read-then-write check a race could slip between.
    const decrementResult = await jobRequisitionRepository.decrementRemainingOpenings(
      application.jobRequisitionId,
      tx,
    );

    if (decrementResult.count === 0) {
      throw new ConflictError(
        'This job requisition is no longer OPEN or has no remaining openings - cannot hire',
      );
    }

    await jobRequisitionRepository.closeIfExhausted(application.jobRequisitionId, tx);

    const { employee, userId } = await employeeOnboardingService.onboardEmployee(
      {
        departmentId: application.jobRequisition.departmentId,
        designationId: application.jobRequisition.designationId,
        branchId: application.jobRequisition.branchId,
        employmentType: application.jobRequisition.employmentType,
        salary: acceptedOffer.salary,
        dateOfJoining: acceptedOffer.startDate,
        managerId: data.managerId,
        shiftId: data.shiftId,
      },
      data.provisionAccess
        ? {
            email: application.candidate.email,
            name: application.candidate.name,
            initialPassword: data.initialPassword,
          }
        : null,
      actor,
      tx,
    );

    const updatedApplication = await applicationRepository.update(
      applicationId,
      { status: 'HIRED', hiredEmployeeId: employee.id },
      tx,
    );

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.APPLICATION,
        entityId: applicationId,
        beforeData: normalizeForAudit(application),
        afterData: normalizeForAudit(updatedApplication),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return { application: updatedApplication, employee, userId };
  });
};

export default {
  createApplication,
  getApplicationById,
  listApplications,
  updateApplicationStatus,
  createInterview,
  listInterviews,
  updateInterview,
  deleteInterview,
  createOffer,
  acceptOffer,
  declineOffer,
  expireOffer,
  hireApplication,
};
