import crypto from 'node:crypto';

import prisma from '../../config/database.js';
import env from '../../config/env.js';
import employeeRepository from './employee.repository.js';
import employeeDocumentRepository from './employeeDocument.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import cloudinaryStorage from '../../utils/cloudinaryStorage.js';
import NotFoundError from '../../errors/NotFoundError.js';
import ForbiddenError from '../../errors/ForbiddenError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const READ_ANY_PERMISSION = 'employee:read:any';

// Raw Prisma records aren't safe to pass directly into a Json column -
// same normalization already established for Employee's own audit trail.
const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

// A fresh, server-generated UUID per document - never derived from the
// original filename or any other client-supplied value. Employees can
// have many documents, so (unlike the profile picture) there's no single
// fixed slot to overwrite.
const buildDocumentPublicId = (employeeId) =>
  `emp-mgmt/${env.NODE_ENV}/employees/${employeeId}/documents/${crypto.randomUUID()}`;

const uploadDocument = async (employeeId, file, actor) => {
  if (!file) {
    throw new BadRequestError('A file is required');
  }

  const employee = await employeeRepository.findById(employeeId);

  if (!employee) {
    throw new NotFoundError('Employee not found');
  }

  // Cloudinary upload happens before any database write - if it fails,
  // nothing has touched the database yet.
  const { url, publicId, resourceType } = await cloudinaryStorage.uploadBuffer(file.buffer, {
    publicId: buildDocumentPublicId(employeeId),
    resourceType: 'auto',
  });

  return prisma.$transaction(async (tx) => {
    const document = await employeeDocumentRepository.create(
      {
        employeeId,
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
        entityType: AUDIT_ENTITY_TYPES.EMPLOYEE_DOCUMENT,
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

const listDocuments = async (employeeId, requester) => {
  const employee = await employeeRepository.findById(employeeId);

  if (!employee) {
    throw new NotFoundError('Employee not found');
  }

  const hasAnyAccess = requester.grantedPermissions.includes(READ_ANY_PERMISSION);

  if (!hasAnyAccess && employee.userId !== requester.id) {
    throw new ForbiddenError('You do not have permission to view this employee record');
  }

  return employeeDocumentRepository.findAllByEmployeeId(employeeId);
};

const deleteDocument = async (employeeId, documentId, actor) => {
  const employee = await employeeRepository.findById(employeeId);

  if (!employee) {
    throw new NotFoundError('Employee not found');
  }

  const document = await employeeDocumentRepository.findById(documentId, employeeId);

  if (!document) {
    throw new NotFoundError('Document not found');
  }

  await prisma.$transaction(async (tx) => {
    await employeeDocumentRepository.deleteById(documentId, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.EMPLOYEE_DOCUMENT,
        entityId: documentId,
        beforeData: normalizeForAudit(document),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });

  // Runs only after the transaction above has committed - the database is
  // already consistent regardless of whether this cleanup call succeeds.
  // resourceType comes from the stored document row (Cloudinary's own
  // classification at upload time), never a default - see the Cloudinary
  // Consistency Model note in cloudinaryStorage.js's deleteAsset.
  await cloudinaryStorage.deleteAsset(document.publicId, document.resourceType, {
    entityType: AUDIT_ENTITY_TYPES.EMPLOYEE_DOCUMENT,
    entityId: documentId,
  });
};

export default { uploadDocument, listDocuments, deleteDocument };
