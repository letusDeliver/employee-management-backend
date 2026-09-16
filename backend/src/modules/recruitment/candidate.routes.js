import { Router } from 'express';

import candidateController from './candidate.controller.js';
import candidateDocumentController from './candidateDocument.controller.js';
import {
  createCandidateSchema,
  updateCandidateSchema,
  listCandidatesQuerySchema,
} from './candidate.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import createUploadMiddleware from '../../middlewares/upload.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

const uploadDocument = createUploadMiddleware({
  allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  maxSizeBytes: 10 * 1024 * 1024,
});

router.use(authMiddleware);

router.post(
  '/',
  requirePermission('candidate:create'),
  validateMiddleware(createCandidateSchema),
  asyncHandler(candidateController.create),
);

router.get(
  '/',
  requirePermission('candidate:read'),
  validateMiddleware(listCandidatesQuerySchema, 'query'),
  asyncHandler(candidateController.list),
);

router.get('/:id', requirePermission('candidate:read'), asyncHandler(candidateController.getById));

router.patch(
  '/:id',
  requirePermission('candidate:update'),
  validateMiddleware(updateCandidateSchema),
  asyncHandler(candidateController.update),
);

router.delete(
  '/:id',
  requirePermission('candidate:delete'),
  asyncHandler(candidateController.remove),
);

router.post(
  '/:id/documents',
  requirePermission('candidate:update'),
  uploadDocument.single('file'),
  asyncHandler(candidateDocumentController.upload),
);

router.get(
  '/:id/documents',
  requirePermission('candidate:read'),
  asyncHandler(candidateDocumentController.list),
);

router.delete(
  '/:id/documents/:documentId',
  requirePermission('candidate:update'),
  asyncHandler(candidateDocumentController.remove),
);

export default router;
