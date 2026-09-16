import prisma from '../../config/database.js';
import enrollmentRepository from './enrollment.repository.js';
import enrollmentDocumentRepository from './enrollmentDocument.repository.js';
import trainingProgramRepository from './trainingProgram.repository.js';
import trainingProgramService from './trainingProgram.service.js';
import employeeRepository from '../employees/employee.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import cloudinaryStorage from '../../utils/cloudinaryStorage.js';
import NotFoundError from '../../errors/NotFoundError.js';
import ConflictError from '../../errors/ConflictError.js';
import ForbiddenError from '../../errors/ForbiddenError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const CREATE_ANY_PERMISSION = 'enrollment:create:any';
const CREATE_OWN_PERMISSION = 'enrollment:create:own';
const READ_ANY_PERMISSION = 'enrollment:read:any';
const MANAGE_ANY_PERMISSION = 'enrollment:manage:any';
const WITHDRAW_OWN_PERMISSION = 'enrollment:withdraw:own';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

const TERMINAL_STATES = ['COMPLETED', 'FAILED', 'WITHDRAWN'];

// ENROLLED->IN_PROGRESS->COMPLETED|FAILED is strictly sequential (no
// skipping, consistent with every other guarded workflow in this
// project); WITHDRAWN is reachable from either non-terminal stage
// (a judgment call, flagged - the domain doc's own diagram doesn't fully
// specify whether Withdrawn branches only off In Progress or off Enrolled
// too, and "you can withdraw before ever starting" is the more realistic
// reading). No terminal state has any outgoing transition.
const isValidTransition = (current, target) => {
  if (TERMINAL_STATES.includes(current)) {
    return false;
  }

  if (target === 'WITHDRAWN') {
    return true;
  }

  if (target === 'IN_PROGRESS') {
    return current === 'ENROLLED';
  }

  if (target === 'COMPLETED' || target === 'FAILED') {
    return current === 'IN_PROGRESS';
  }

  return false;
};

// ADMIN (create:any) enrolls anyone in anything, explicit employeeId
// required. A self-enrolling caller (create:own - MANAGER/EMPLOYEE) always
// enrolls themselves, resolved from their own linked Employee record -
// any employeeId they supply is ignored, mirroring the "never trust a
// client-supplied identity for a self-service action" precedent already
// established elsewhere in this project.
const resolveEmployeeId = async (data, actor) => {
  if (actor.grantedPermissions.includes(CREATE_ANY_PERMISSION)) {
    if (!data.employeeId) {
      throw new BadRequestError(
        'employeeId: required when enrolling on behalf of another employee',
      );
    }

    return data.employeeId;
  }

  if (actor.grantedPermissions.includes(CREATE_OWN_PERMISSION)) {
    const ownEmployee = await employeeRepository.findByUserId(actor.id);

    // Matches Leave's createLeaveRequest / Attendance's checkIn precedent
    // exactly (both throw this same message) - a self-service caller with
    // no linked Employee record is a data-integrity/account-setup gap
    // (400), not a permissions question (403).
    if (!ownEmployee) {
      throw new BadRequestError('No employee record linked to this account');
    }

    return ownEmployee.id;
  }

  throw new ForbiddenError('You do not have permission to create an enrollment');
};

// §2's "self-enrolls in optional, non-mandatory programs" is read as a
// hard restriction, not a suggestion - mandatory-program enrollment must
// go through create:any.
const createEnrollment = async (data, actor) => {
  const employeeId = await resolveEmployeeId(data, actor);
  const program = await trainingProgramService.assertTrainingProgramAssignable(
    data.trainingProgramId,
  );

  const isSelfEnroll = !actor.grantedPermissions.includes(CREATE_ANY_PERMISSION);

  if (isSelfEnroll && program.mandatory) {
    throw new BadRequestError(
      'trainingProgramId: self-enrollment is not allowed for a mandatory program - contact an administrator',
    );
  }

  return prisma.$transaction(async (tx) => {
    const enrollment = await enrollmentRepository.create(
      { employeeId, trainingProgramId: data.trainingProgramId },
      tx,
    );

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: AUDIT_ENTITY_TYPES.ENROLLMENT,
        entityId: enrollment.id,
        beforeData: null,
        afterData: normalizeForAudit(enrollment),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return enrollment;
  });
};

const assertOwnershipOrAny = async (employeeId, requester, permission) => {
  if (requester.grantedPermissions.includes(permission)) {
    return;
  }

  const ownEmployee = await employeeRepository.findByUserId(requester.id);

  if (!ownEmployee || ownEmployee.id !== employeeId) {
    throw new ForbiddenError('You do not have permission to view this enrollment');
  }
};

const getEnrollmentById = async (id, requester) => {
  const enrollment = await enrollmentRepository.findById(id);

  if (!enrollment) {
    throw new NotFoundError('Enrollment not found');
  }

  await assertOwnershipOrAny(enrollment.employeeId, requester, READ_ANY_PERMISSION);

  return enrollment;
};

const buildEnrollmentWhere = ({ employeeId, trainingProgramId, status }) => {
  const where = {};

  if (employeeId) where.employeeId = employeeId;
  if (trainingProgramId) where.trainingProgramId = trainingProgramId;
  if (status) where.status = status;

  return where;
};

// Diverges from the pure-ADMIN-only master-data domains: an employee needs
// to see their own enrollment/compliance history, a core self-service
// need, so a caller without :read:any is auto-scoped to their own
// employeeId instead of being refused list access outright - the same
// pattern Leave's listLeaveRequests already established.
const listEnrollments = async (query, requester) => {
  const { page, limit, sortBy, order, ...filters } = query;

  if (!requester.grantedPermissions.includes(READ_ANY_PERMISSION)) {
    const ownEmployee = await employeeRepository.findByUserId(requester.id);

    if (!ownEmployee) {
      return { enrollments: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }

    filters.employeeId = ownEmployee.id;
  }

  const where = buildEnrollmentWhere(filters);

  const [enrollments, total] = await Promise.all([
    enrollmentRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    enrollmentRepository.count(where),
  ]);

  return {
    enrollments,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// WITHDRAWN accepts either manage:any or withdraw:own+ownership match;
// every other target (IN_PROGRESS/COMPLETED/FAILED) requires manage:any -
// an employee can call off their own enrollment, but cannot self-attest
// completion or failure, which would undermine compliance tracking's
// whole point.
const updateEnrollmentStatus = async (id, status, score, actor) => {
  const enrollment = await enrollmentRepository.findById(id);

  if (!enrollment) {
    throw new NotFoundError('Enrollment not found');
  }

  const hasManageAny = actor.grantedPermissions.includes(MANAGE_ANY_PERMISSION);

  if (status === 'WITHDRAWN') {
    if (!hasManageAny) {
      if (!actor.grantedPermissions.includes(WITHDRAW_OWN_PERMISSION)) {
        throw new ForbiddenError('You do not have permission to withdraw this enrollment');
      }

      const ownEmployee = await employeeRepository.findByUserId(actor.id);

      if (!ownEmployee || ownEmployee.id !== enrollment.employeeId) {
        throw new ForbiddenError('You do not have permission to withdraw this enrollment');
      }
    }
  } else if (!hasManageAny) {
    throw new ForbiddenError('You do not have permission to perform this action');
  }

  if (!isValidTransition(enrollment.status, status)) {
    throw new ConflictError(`Cannot transition an enrollment from ${enrollment.status} to ${status}`);
  }

  const data = { status };

  if (score !== undefined) {
    data.score = score;
  }

  if (status === 'COMPLETED') {
    data.completedAt = new Date();
  }

  return prisma.$transaction(async (tx) => {
    const updated = await enrollmentRepository.update(id, data, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.ENROLLMENT,
        entityId: id,
        beforeData: normalizeForAudit(enrollment),
        afterData: normalizeForAudit(updated),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return updated;
  });
};

// Unrestricted by status, mirroring Attendance's deleteAttendanceRecord -
// Enrollment is compliance data that sometimes needs outright correction,
// not just a workflow-transition-only model. manage:any only.
const deleteEnrollment = async (id, actor) => {
  const enrollment = await enrollmentRepository.findById(id);

  if (!enrollment) {
    throw new NotFoundError('Enrollment not found');
  }

  // The DB cascade-deletes EnrollmentDocument rows along with the
  // Enrollment (onDelete: Cascade), but never touches the Cloudinary
  // assets those rows pointed at - fetch them first so they can be
  // cleaned up (best-effort) after the transaction commits, the same
  // pattern candidate.service.js's own hard-delete already established.
  const documents = await enrollmentDocumentRepository.findAllByEnrollmentId(id);

  await prisma.$transaction(async (tx) => {
    await enrollmentRepository.remove(id, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.ENROLLMENT,
        entityId: id,
        beforeData: normalizeForAudit(enrollment),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });

  await Promise.all(
    documents.map((document) =>
      cloudinaryStorage.deleteAsset(document.publicId, document.resourceType, {
        entityType: AUDIT_ENTITY_TYPES.ENROLLMENT_DOCUMENT,
        entityId: document.id,
      }),
    ),
  );
};

// The single reusable computed-status primitive (ADR-TR02, reusing
// Attendance's ADR-AT03/Holiday Calendar's ADR-HC04 "expose one shared
// query rather than let every consumer reimplement it" principle) -
// compliance is never stored, always derived from the enrollment history
// at read time.
const getComplianceStatus = async (employeeId, trainingProgramId) => {
  const program = await trainingProgramRepository.findById(trainingProgramId);

  if (!program) {
    throw new NotFoundError('Training program not found');
  }

  const mostRecent = await enrollmentRepository.findMostRecentCompleted(
    employeeId,
    trainingProgramId,
  );

  if (!mostRecent) {
    return { compliant: false, lastCompletedAt: null, expiresAt: null };
  }

  if (!program.renewalPeriodDays) {
    return { compliant: true, lastCompletedAt: mostRecent.completedAt, expiresAt: null };
  }

  const expiresAt = new Date(mostRecent.completedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + program.renewalPeriodDays);

  return { compliant: expiresAt > new Date(), lastCompletedAt: mostRecent.completedAt, expiresAt };
};

// The bulk variant §2's "who consumes: compliance reporting" implies -
// composes the single-program primitive across every mandatory, ACTIVE
// program rather than inventing separate bulk-query logic.
const getComplianceReport = async (employeeId) => {
  const programs = await trainingProgramRepository.findAllMandatoryActive();

  return Promise.all(
    programs.map(async (program) => ({
      trainingProgramId: program.id,
      trainingProgramName: program.name,
      ...(await getComplianceStatus(employeeId, program.id)),
    })),
  );
};

const getTrainingCompliance = async (employeeId, trainingProgramId, requester) => {
  await assertOwnershipOrAny(employeeId, requester, READ_ANY_PERMISSION);

  if (trainingProgramId) {
    return getComplianceStatus(employeeId, trainingProgramId);
  }

  return getComplianceReport(employeeId);
};

export default {
  createEnrollment,
  getEnrollmentById,
  listEnrollments,
  updateEnrollmentStatus,
  deleteEnrollment,
  getTrainingCompliance,
};
