import prisma from '../../config/database.js';
import jobRequisitionRepository from './jobRequisition.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import branchService from '../branches/branch.service.js';
import departmentService from '../departments/department.service.js';
import designationService from '../designations/designation.service.js';
import NotFoundError from '../../errors/NotFoundError.js';
import ConflictError from '../../errors/ConflictError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

// OPEN <-> ON_HOLD, and either can be manually CANCELLED (the search is
// called off). CLOSED is deliberately not reachable through this map - it
// is set automatically only when openings are exhausted at hire time
// (jobRequisition.repository.js's closeIfExhausted), keeping it meaningful
// as "filled" rather than overloaded with "manually stopped" (CANCELLED
// already covers that). Neither CLOSED nor CANCELLED has any outgoing
// transition - both are terminal, per §2's lifecycle diagram.
const ALLOWED_TRANSITIONS = {
  OPEN: ['ON_HOLD', 'CANCELLED'],
  ON_HOLD: ['OPEN', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
};

const createJobRequisition = async (data, actor) => {
  if (data.branchId) {
    await branchService.assertBranchAssignable(data.branchId);
  }

  await departmentService.assertDepartmentAssignable(data.departmentId);
  await designationService.assertDesignationAssignable(data.designationId);

  return prisma.$transaction(async (tx) => {
    const requisition = await jobRequisitionRepository.create(
      { ...data, remainingOpenings: data.numberOfOpenings },
      tx,
    );

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: AUDIT_ENTITY_TYPES.JOB_REQUISITION,
        entityId: requisition.id,
        beforeData: null,
        afterData: normalizeForAudit(requisition),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return requisition;
  });
};

const getJobRequisitionById = async (id) => {
  const requisition = await jobRequisitionRepository.findById(id);

  if (!requisition) {
    throw new NotFoundError('Job requisition not found');
  }

  return requisition;
};

const buildJobRequisitionWhere = ({ departmentId, designationId, branchId, status }) => {
  const where = {};

  if (departmentId) {
    where.departmentId = departmentId;
  }

  if (designationId) {
    where.designationId = designationId;
  }

  if (branchId) {
    where.branchId = branchId;
  }

  if (status) {
    where.status = status;
  }

  return where;
};

const listJobRequisitions = async (query) => {
  const { page, limit, sortBy, order, ...filters } = query;
  const where = buildJobRequisitionWhere(filters);

  const [jobRequisitions, total] = await Promise.all([
    jobRequisitionRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    jobRequisitionRepository.count(where),
  ]);

  return {
    jobRequisitions,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const updateJobRequisitionStatus = async (id, status, actor) => {
  const requisition = await jobRequisitionRepository.findById(id);

  if (!requisition) {
    throw new NotFoundError('Job requisition not found');
  }

  if (status === 'CLOSED') {
    throw new BadRequestError(
      'status: CLOSED is set automatically when a requisition’s openings are exhausted, not settable directly',
    );
  }

  const allowed = ALLOWED_TRANSITIONS[requisition.status] ?? [];

  if (!allowed.includes(status)) {
    throw new ConflictError(
      `Cannot transition a job requisition from ${requisition.status} to ${status}`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await jobRequisitionRepository.update(id, { status }, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.JOB_REQUISITION,
        entityId: id,
        beforeData: normalizeForAudit(requisition),
        afterData: normalizeForAudit(updated),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return updated;
  });
};

const deleteJobRequisition = async (id, actor) => {
  const requisition = await jobRequisitionRepository.findById(id);

  if (!requisition) {
    throw new NotFoundError('Job requisition not found');
  }

  const referenceCount = await jobRequisitionRepository.countApplicationsForRequisition(id);

  if (referenceCount > 0) {
    throw new ConflictError(
      'This job requisition has Application records referencing it and cannot be deleted - cancel it instead',
    );
  }

  await prisma.$transaction(async (tx) => {
    await jobRequisitionRepository.remove(id, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.JOB_REQUISITION,
        entityId: id,
        beforeData: normalizeForAudit(requisition),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });
};

export default {
  createJobRequisition,
  getJobRequisitionById,
  listJobRequisitions,
  updateJobRequisitionStatus,
  deleteJobRequisition,
};
