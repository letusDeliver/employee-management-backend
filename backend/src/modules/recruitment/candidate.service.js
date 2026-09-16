import prisma from '../../config/database.js';
import candidateRepository from './candidate.repository.js';
import candidateDocumentRepository from './candidateDocument.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import cloudinaryStorage from '../../utils/cloudinaryStorage.js';
import NotFoundError from '../../errors/NotFoundError.js';
import ConflictError from '../../errors/ConflictError.js';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

const createCandidate = async (data, actor) => {
  return prisma.$transaction(async (tx) => {
    const candidate = await candidateRepository.create(data, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: AUDIT_ENTITY_TYPES.CANDIDATE,
        entityId: candidate.id,
        beforeData: null,
        afterData: normalizeForAudit(candidate),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return candidate;
  });
};

const getCandidateById = async (id) => {
  const candidate = await candidateRepository.findById(id);

  if (!candidate) {
    throw new NotFoundError('Candidate not found');
  }

  return candidate;
};

const buildCandidateWhere = ({ search }) => {
  const where = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
    ];
  }

  return where;
};

const listCandidates = async (query) => {
  const { page, limit, sortBy, order, ...filters } = query;
  const where = buildCandidateWhere(filters);

  const [candidates, total] = await Promise.all([
    candidateRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    candidateRepository.count(where),
  ]);

  return {
    candidates,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const updateCandidate = async (id, data, actor) => {
  const candidate = await candidateRepository.findById(id);

  if (!candidate) {
    throw new NotFoundError('Candidate not found');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await candidateRepository.update(id, data, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.CANDIDATE,
        entityId: id,
        beforeData: normalizeForAudit(candidate),
        afterData: normalizeForAudit(updated),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return updated;
  });
};

const deleteCandidate = async (id, actor) => {
  const candidate = await candidateRepository.findById(id);

  if (!candidate) {
    throw new NotFoundError('Candidate not found');
  }

  const referenceCount = await candidateRepository.countApplicationsForCandidate(id);

  if (referenceCount > 0) {
    throw new ConflictError(
      'This candidate has Application records referencing it and cannot be deleted',
    );
  }

  // The DB cascade-deletes CandidateDocument rows along with the Candidate
  // (onDelete: Cascade), but never touches the Cloudinary assets those rows
  // pointed at - fetch them first so they can be cleaned up after the
  // transaction commits, the same best-effort ordering
  // candidateDocument.service.js's own single-document delete already uses.
  // Employee's equivalent never needed this: Employee is only ever
  // soft-deleted, so EmployeeDocument rows are never actually cascade-
  // removed in practice - Candidate's real hard delete is what makes this a
  // genuinely new case.
  const documents = await candidateDocumentRepository.findAllByCandidateId(id);

  await prisma.$transaction(async (tx) => {
    await candidateRepository.remove(id, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.CANDIDATE,
        entityId: id,
        beforeData: normalizeForAudit(candidate),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });

  await Promise.all(
    documents.map((document) =>
      cloudinaryStorage.deleteAsset(document.publicId, document.resourceType, {
        entityType: AUDIT_ENTITY_TYPES.CANDIDATE_DOCUMENT,
        entityId: document.id,
      }),
    ),
  );
};

export default {
  createCandidate,
  getCandidateById,
  listCandidates,
  updateCandidate,
  deleteCandidate,
};
