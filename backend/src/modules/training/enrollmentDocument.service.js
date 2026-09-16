import crypto from 'node:crypto';

import prisma from '../../config/database.js';
import env from '../../config/env.js';
import employeeRepository from '../employees/employee.repository.js';
import enrollmentRepository from './enrollment.repository.js';
import enrollmentDocumentRepository from './enrollmentDocument.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import cloudinaryStorage from '../../utils/cloudinaryStorage.js';
import NotFoundError from '../../errors/NotFoundError.js';
import ForbiddenError from '../../errors/ForbiddenError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const READ_ANY_PERMISSION = 'enrollment:read:any';
const MANAGE_ANY_PERMISSION = 'enrollment:manage:any';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

const buildDocumentPublicId = (enrollmentId) =>
  `emp-mgmt/${env.NODE_ENV}/enrollments/${enrollmentId}/documents/${crypto.randomUUID()}`;

// The routes for these three endpoints declare read:own/read:any/manage:any
// as equally sufficient - this check must honor all three, not just
// read:any, or a manage:any-only caller (no read:any) would incorrectly be
// blocked despite holding a permission the route itself accepts.
const assertOwnershipOrAny = async (employeeId, requester) => {
  if (
    requester.grantedPermissions.includes(READ_ANY_PERMISSION) ||
    requester.grantedPermissions.includes(MANAGE_ANY_PERMISSION)
  ) {
    return;
  }

  const ownEmployee = await employeeRepository.findByUserId(requester.id);

  if (!ownEmployee || ownEmployee.id !== employeeId) {
    throw new ForbiddenError('You do not have permission to view this enrollment');
  }
};

const uploadDocument = async (enrollmentId, file, actor) => {
  if (!file) {
    throw new BadRequestError('A file is required');
  }

  const enrollment = await enrollmentRepository.findById(enrollmentId);

  if (!enrollment) {
    throw new NotFoundError('Enrollment not found');
  }

  await assertOwnershipOrAny(enrollment.employeeId, actor);

  const { url, publicId, resourceType } = await cloudinaryStorage.uploadBuffer(file.buffer, {
    publicId: buildDocumentPublicId(enrollmentId),
    resourceType: 'auto',
  });

  return prisma.$transaction(async (tx) => {
    const document = await enrollmentDocumentRepository.create(
      {
        enrollmentId,
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
        entityType: AUDIT_ENTITY_TYPES.ENROLLMENT_DOCUMENT,
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

const listDocuments = async (enrollmentId, requester) => {
  const enrollment = await enrollmentRepository.findById(enrollmentId);

  if (!enrollment) {
    throw new NotFoundError('Enrollment not found');
  }

  await assertOwnershipOrAny(enrollment.employeeId, requester);

  return enrollmentDocumentRepository.findAllByEnrollmentId(enrollmentId);
};

const deleteDocument = async (enrollmentId, documentId, actor) => {
  const enrollment = await enrollmentRepository.findById(enrollmentId);

  if (!enrollment) {
    throw new NotFoundError('Enrollment not found');
  }

  await assertOwnershipOrAny(enrollment.employeeId, actor);

  const document = await enrollmentDocumentRepository.findById(documentId, enrollmentId);

  if (!document) {
    throw new NotFoundError('Document not found');
  }

  await prisma.$transaction(async (tx) => {
    await enrollmentDocumentRepository.deleteById(documentId, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.ENROLLMENT_DOCUMENT,
        entityId: documentId,
        beforeData: normalizeForAudit(document),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });

  await cloudinaryStorage.deleteAsset(document.publicId, document.resourceType, {
    entityType: AUDIT_ENTITY_TYPES.ENROLLMENT_DOCUMENT,
    entityId: documentId,
  });
};

export default { uploadDocument, listDocuments, deleteDocument };
