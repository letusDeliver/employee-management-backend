import prisma from '../../config/database.js';
import trainingProgramRepository from './trainingProgram.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import ConflictError from '../../errors/ConflictError.js';
import NotFoundError from '../../errors/NotFoundError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const DUPLICATE_PROGRAM_MESSAGE = 'A training program with this name already exists';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

const createTrainingProgram = async (data, actor) => {
  const existing = await trainingProgramRepository.findByName(data.name);

  if (existing) {
    throw new ConflictError(DUPLICATE_PROGRAM_MESSAGE);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const program = await trainingProgramRepository.create(data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.TRAINING_PROGRAM,
          entityId: program.id,
          beforeData: null,
          afterData: normalizeForAudit(program),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return program;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_PROGRAM_MESSAGE);
    }

    throw error;
  }
};

const getTrainingProgramById = async (id) => {
  const program = await trainingProgramRepository.findById(id);

  if (!program) {
    throw new NotFoundError('Training program not found');
  }

  return program;
};

const buildTrainingProgramWhere = ({ search, mandatory, status }) => {
  const where = {};

  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  if (mandatory !== undefined) {
    where.mandatory = mandatory;
  }

  if (status) {
    where.status = status;
  }

  return where;
};

const listTrainingPrograms = async (query) => {
  const { page, limit, sortBy, order, ...filters } = query;
  const where = buildTrainingProgramWhere(filters);

  const [trainingPrograms, total] = await Promise.all([
    trainingProgramRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    trainingProgramRepository.count(where),
  ]);

  return {
    trainingPrograms,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const updateTrainingProgram = async (id, data, actor) => {
  const program = await trainingProgramRepository.findById(id);

  if (!program) {
    throw new NotFoundError('Training program not found');
  }

  if (data.name) {
    const existing = await trainingProgramRepository.findByName(data.name);

    if (existing && existing.id !== id) {
      throw new ConflictError(DUPLICATE_PROGRAM_MESSAGE);
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await trainingProgramRepository.update(id, data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.UPDATE,
          entityType: AUDIT_ENTITY_TYPES.TRAINING_PROGRAM,
          entityId: id,
          beforeData: normalizeForAudit(program),
          afterData: normalizeForAudit(updated),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return updated;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_PROGRAM_MESSAGE);
    }

    throw error;
  }
};

const deleteTrainingProgram = async (id, actor) => {
  const program = await trainingProgramRepository.findById(id);

  if (!program) {
    throw new NotFoundError('Training program not found');
  }

  const referenceCount = await trainingProgramRepository.countEnrollmentsForProgram(id);

  if (referenceCount > 0) {
    throw new ConflictError(
      'This training program has Enrollment records referencing it and cannot be deleted - deactivate it instead',
    );
  }

  await prisma.$transaction(async (tx) => {
    await trainingProgramRepository.remove(id, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.TRAINING_PROGRAM,
        entityId: id,
        beforeData: normalizeForAudit(program),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });
};

// Consumed by enrollment.service.js - the synchronous cross-domain read
// pattern established by ADR-B06/ADR-D06 and extended by every domain
// since. Enforces the positive allowlist rule: assignable means status ===
// ACTIVE, never the inverse.
const assertTrainingProgramAssignable = async (trainingProgramId) => {
  const program = await trainingProgramRepository.findById(trainingProgramId);

  if (!program) {
    throw new BadRequestError('trainingProgramId: references a record that does not exist');
  }

  if (program.status !== 'ACTIVE') {
    throw new BadRequestError('trainingProgramId: this training program is not active and cannot be assigned');
  }

  return program;
};

export default {
  createTrainingProgram,
  getTrainingProgramById,
  listTrainingPrograms,
  updateTrainingProgram,
  deleteTrainingProgram,
  assertTrainingProgramAssignable,
};
