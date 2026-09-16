import crypto from 'node:crypto';

import prisma from '../../config/database.js';
import env from '../../config/env.js';
import candidateRepository from './candidate.repository.js';
import candidateDocumentRepository from './candidateDocument.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import cloudinaryStorage from '../../utils/cloudinaryStorage.js';
import NotFoundError from '../../errors/NotFoundError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

const buildDocumentPublicId = (candidateId) =>
  `emp-mgmt/${env.NODE_ENV}/candidates/${candidateId}/documents/${crypto.randomUUID()}`;

const uploadDocument = async (candidateId, file, actor) => {
  if (!file) {
    throw new BadRequestError('A file is required');
  }

  const candidate = await candidateRepository.findById(candidateId);

  if (!candidate) {
    throw new NotFoundError('Candidate not found');
  }

  const { url, publicId, resourceType } = await cloudinaryStorage.uploadBuffer(file.buffer, {
    publicId: buildDocumentPublicId(candidateId),
    resourceType: 'auto',
  });

  return prisma.$transaction(async (tx) => {
    const document = await candidateDocumentRepository.create(
      {
        candidateId,
        url,
        publicId,
        resourceType,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedBy: actor.id,
      },
      tx,
    );

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: AUDIT_ENTITY_TYPES.CANDIDATE_DOCUMENT,
        entityId: document.id,
        beforeData: null,
        afterData: normalizeForAudit(document),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return document;
  });
};

const listDocuments = async (candidateId) => {
  const candidate = await candidateRepository.findById(candidateId);

  if (!candidate) {
    throw new NotFoundError('Candidate not found');
  }

  return candidateDocumentRepository.findAllByCandidateId(candidateId);
};

const deleteDocument = async (candidateId, documentId, actor) => {
  const candidate = await candidateRepository.findById(candidateId);

  if (!candidate) {
    throw new NotFoundError('Candidate not found');
  }

  const document = await candidateDocumentRepository.findById(documentId, candidateId);

  if (!document) {
    throw new NotFoundError('Document not found');
  }

  await prisma.$transaction(async (tx) => {
    await candidateDocumentRepository.deleteById(documentId, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.CANDIDATE_DOCUMENT,
        entityId: documentId,
        beforeData: normalizeForAudit(document),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });

  await cloudinaryStorage.deleteAsset(document.publicId, document.resourceType, {
    entityType: AUDIT_ENTITY_TYPES.CANDIDATE_DOCUMENT,
    entityId: documentId,
  });
};

export default { uploadDocument, listDocuments, deleteDocument };
