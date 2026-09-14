import prisma from '../../config/database.js';
import leaveTypeRepository from './leaveType.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import ConflictError from '../../errors/ConflictError.js';
import NotFoundError from '../../errors/NotFoundError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const DUPLICATE_LEAVE_TYPE_MESSAGE = 'A leave type with this name already exists';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

const createLeaveType = async (data, actor) => {
  const existing = await leaveTypeRepository.findByName(data.name);

  if (existing) {
    throw new ConflictError(DUPLICATE_LEAVE_TYPE_MESSAGE);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const leaveType = await leaveTypeRepository.create(data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.LEAVE_TYPE,
          entityId: leaveType.id,
          beforeData: null,
          afterData: normalizeForAudit(leaveType),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return leaveType;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_LEAVE_TYPE_MESSAGE);
    }

    throw error;
  }
};

const getLeaveTypeById = async (id) => {
  const leaveType = await leaveTypeRepository.findById(id);

  if (!leaveType) {
    throw new NotFoundError('Leave type not found');
  }

  return leaveType;
};

const buildLeaveTypeWhere = ({ search, status }) => {
  const where = {};

  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  if (status) {
    where.status = status;
  }

  return where;
};

const listLeaveTypes = async (query) => {
  const { page, limit, sortBy, order, ...filters } = query;
  const where = buildLeaveTypeWhere(filters);

  const [leaveTypes, total] = await Promise.all([
    leaveTypeRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    leaveTypeRepository.count(where),
  ]);

  return {
    leaveTypes,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const updateLeaveType = async (id, data, actor) => {
  const leaveType = await leaveTypeRepository.findById(id);

  if (!leaveType) {
    throw new NotFoundError('Leave type not found');
  }

  if (data.name) {
    const existing = await leaveTypeRepository.findByName(data.name);

    if (existing && existing.id !== id) {
      throw new ConflictError(DUPLICATE_LEAVE_TYPE_MESSAGE);
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await leaveTypeRepository.update(id, data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.UPDATE,
          entityType: AUDIT_ENTITY_TYPES.LEAVE_TYPE,
          entityId: id,
          beforeData: normalizeForAudit(leaveType),
          afterData: normalizeForAudit(updated),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return updated;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_LEAVE_TYPE_MESSAGE);
    }

    throw error;
  }
};

const deleteLeaveType = async (id, actor) => {
  const leaveType = await leaveTypeRepository.findById(id);

  if (!leaveType) {
    throw new NotFoundError('Leave type not found');
  }

  const referenceCount = await leaveTypeRepository.countReferencesForLeaveType(id);

  if (referenceCount > 0) {
    throw new ConflictError(
      'This leave type has LeaveRequest or LeaveBalance records referencing it and cannot be deleted - deactivate it instead',
    );
  }

  await prisma.$transaction(async (tx) => {
    await leaveTypeRepository.remove(id, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.LEAVE_TYPE,
        entityId: id,
        beforeData: normalizeForAudit(leaveType),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });
};

// Consumed by leave.service.js - the same synchronous cross-domain-style
// read pattern every assignability check in this review uses, just an
// intra-domain call this time (Leave's own two aggregates). Enforces the
// positive allowlist rule from domain-leave.md §3: a LeaveRequest must
// reference an ACTIVE LeaveType at request time.
const assertLeaveTypeAssignable = async (leaveTypeId) => {
  const leaveType = await leaveTypeRepository.findById(leaveTypeId);

  if (!leaveType) {
    throw new BadRequestError('leaveTypeId: references a record that does not exist');
  }

  if (leaveType.status !== 'ACTIVE') {
    throw new BadRequestError('leaveTypeId: this leave type is not active and cannot be assigned');
  }

  return leaveType;
};

export default {
  createLeaveType,
  getLeaveTypeById,
  listLeaveTypes,
  updateLeaveType,
  deleteLeaveType,
  assertLeaveTypeAssignable,
};
