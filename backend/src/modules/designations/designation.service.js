import prisma from '../../config/database.js';
import designationRepository from './designation.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import ConflictError from '../../errors/ConflictError.js';
import NotFoundError from '../../errors/NotFoundError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const DUPLICATE_DESIGNATION_MESSAGE = 'A designation with this name or code already exists';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

const createDesignation = async (data, actor) => {
  const existing = await designationRepository.findByNameOrCode(data.name, data.code);

  if (existing) {
    throw new ConflictError(DUPLICATE_DESIGNATION_MESSAGE);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const designation = await designationRepository.create(data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.DESIGNATION,
          entityId: designation.id,
          beforeData: null,
          afterData: normalizeForAudit(designation),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return designation;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_DESIGNATION_MESSAGE);
    }

    throw error;
  }
};

const getDesignationById = async (id) => {
  const designation = await designationRepository.findById(id);

  if (!designation) {
    throw new NotFoundError('Designation not found');
  }

  return designation;
};

const buildDesignationWhere = ({ search, status }) => {
  const where = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (status) {
    where.status = status;
  }

  return where;
};

const listDesignations = async (query) => {
  const { page, limit, sortBy, order, ...filters } = query;
  const where = buildDesignationWhere(filters);

  const [designations, total] = await Promise.all([
    designationRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    designationRepository.count(where),
  ]);

  return {
    designations,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const updateDesignation = async (id, data, actor) => {
  const designation = await designationRepository.findById(id);

  if (!designation) {
    throw new NotFoundError('Designation not found');
  }

  if (data.name || data.code) {
    const existing = await designationRepository.findByNameOrCode(
      data.name ?? designation.name,
      data.code,
    );

    if (existing && existing.id !== id) {
      throw new ConflictError(DUPLICATE_DESIGNATION_MESSAGE);
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await designationRepository.update(id, data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.UPDATE,
          entityType: AUDIT_ENTITY_TYPES.DESIGNATION,
          entityId: id,
          beforeData: normalizeForAudit(designation),
          afterData: normalizeForAudit(updated),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return updated;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_DESIGNATION_MESSAGE);
    }

    throw error;
  }
};

const deleteDesignation = async (id, actor) => {
  const designation = await designationRepository.findById(id);

  if (!designation) {
    throw new NotFoundError('Designation not found');
  }

  const referenceCount = await designationRepository.countEmployeesForDesignation(id);

  if (referenceCount > 0) {
    throw new ConflictError(
      'This designation has Employee records referencing it and cannot be deleted - deactivate it instead',
    );
  }

  await prisma.$transaction(async (tx) => {
    await designationRepository.remove(id, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.DESIGNATION,
        entityId: id,
        beforeData: normalizeForAudit(designation),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });
};

// Consumed by employee.service.js - the synchronous cross-domain read
// pattern established by ADR-B06/ADR-D06, now extended to Designation.
// Enforces the positive allowlist rule from domain-designation.md §4:
// assignable means status === ACTIVE, never the inverse.
const assertDesignationAssignable = async (designationId) => {
  const designation = await designationRepository.findById(designationId);

  if (!designation) {
    throw new BadRequestError('designationId: references a record that does not exist');
  }

  if (designation.status !== 'ACTIVE') {
    throw new BadRequestError(
      'designationId: this designation is not active and cannot be assigned',
    );
  }
};

export default {
  createDesignation,
  getDesignationById,
  listDesignations,
  updateDesignation,
  deleteDesignation,
  assertDesignationAssignable,
};
