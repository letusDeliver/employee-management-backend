import prisma from '../../config/database.js';
import reviewCycleRepository from './reviewCycle.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import ConflictError from '../../errors/ConflictError.js';
import NotFoundError from '../../errors/NotFoundError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const DUPLICATE_NAME_MESSAGE = 'A review cycle with this name already exists';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

const createReviewCycle = async (data, actor) => {
  const existing = await reviewCycleRepository.findByName(data.name);

  if (existing) {
    throw new ConflictError(DUPLICATE_NAME_MESSAGE);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const cycle = await reviewCycleRepository.create(data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.REVIEW_CYCLE,
          entityId: cycle.id,
          beforeData: null,
          afterData: normalizeForAudit(cycle),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return cycle;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_NAME_MESSAGE);
    }

    throw error;
  }
};

const getReviewCycleById = async (id) => {
  const cycle = await reviewCycleRepository.findById(id);

  if (!cycle) {
    throw new NotFoundError('Review cycle not found');
  }

  return cycle;
};

const buildReviewCycleWhere = ({ search, status }) => {
  const where = {};

  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  if (status) {
    where.status = status;
  }

  return where;
};

const listReviewCycles = async (query) => {
  const { page, limit, sortBy, order, ...filters } = query;
  const where = buildReviewCycleWhere(filters);

  const [cycles, total] = await Promise.all([
    reviewCycleRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    reviewCycleRepository.count(where),
  ]);

  return {
    cycles,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const updateReviewCycle = async (id, data, actor) => {
  const cycle = await reviewCycleRepository.findById(id);

  if (!cycle) {
    throw new NotFoundError('Review cycle not found');
  }

  if (data.name) {
    const existing = await reviewCycleRepository.findByName(data.name);

    if (existing && existing.id !== id) {
      throw new ConflictError(DUPLICATE_NAME_MESSAGE);
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await reviewCycleRepository.update(id, data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.UPDATE,
          entityType: AUDIT_ENTITY_TYPES.REVIEW_CYCLE,
          entityId: id,
          beforeData: normalizeForAudit(cycle),
          afterData: normalizeForAudit(updated),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return updated;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_NAME_MESSAGE);
    }

    throw error;
  }
};

const deleteReviewCycle = async (id, actor) => {
  const cycle = await reviewCycleRepository.findById(id);

  if (!cycle) {
    throw new NotFoundError('Review cycle not found');
  }

  const referenceCount = await reviewCycleRepository.countReferencesForReviewCycle(id);

  if (referenceCount > 0) {
    throw new ConflictError(
      'This review cycle has PerformanceReview records referencing it and cannot be deleted - close it instead',
    );
  }

  await prisma.$transaction(async (tx) => {
    await reviewCycleRepository.remove(id, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.REVIEW_CYCLE,
        entityId: id,
        beforeData: normalizeForAudit(cycle),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });
};

// Consumed by performance.service.js - positive allowlist rule (only an
// OPEN cycle accepts new reviews), the same pattern every assignability
// check in this review uses.
const assertReviewCycleAssignable = async (reviewCycleId) => {
  const cycle = await reviewCycleRepository.findById(reviewCycleId);

  if (!cycle) {
    throw new BadRequestError('reviewCycleId: references a record that does not exist');
  }

  if (cycle.status !== 'OPEN') {
    throw new BadRequestError('reviewCycleId: this review cycle is not open and cannot be assigned');
  }

  return cycle;
};

export default {
  createReviewCycle,
  getReviewCycleById,
  listReviewCycles,
  updateReviewCycle,
  deleteReviewCycle,
  assertReviewCycleAssignable,
};
