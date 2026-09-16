import { Router } from 'express';

import enrollmentController from './enrollment.controller.js';
import {
  createEnrollmentSchema,
  updateEnrollmentStatusSchema,
  listEnrollmentsQuerySchema,
  trainingComplianceQuerySchema,
} from './enrollment.validation.js';
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
  requirePermission('enrollment:create:own', 'enrollment:create:any'),
  validateMiddleware(createEnrollmentSchema),
  asyncHandler(enrollmentController.create),
);

router.get(
  '/',
  requirePermission('enrollment:read:own', 'enrollment:read:any'),
  validateMiddleware(listEnrollmentsQuerySchema, 'query'),
  asyncHandler(enrollmentController.list),
);

router.get(
  '/:id',
  requirePermission('enrollment:read:own', 'enrollment:read:any'),
  asyncHandler(enrollmentController.getById),
);

router.patch(
  '/:id/status',
  requirePermission('enrollment:manage:any', 'enrollment:withdraw:own'),
  validateMiddleware(updateEnrollmentStatusSchema),
  asyncHandler(enrollmentController.updateStatus),
);

router.delete(
  '/:id',
  requirePermission('enrollment:manage:any'),
  asyncHandler(enrollmentController.remove),
);

router.post(
  '/:id/documents',
  requirePermission('enrollment:read:own', 'enrollment:read:any', 'enrollment:manage:any'),
  uploadDocument.single('file'),
  asyncHandler(enrollmentController.uploadDocument),
);

router.get(
  '/:id/documents',
  requirePermission('enrollment:read:own', 'enrollment:read:any', 'enrollment:manage:any'),
  asyncHandler(enrollmentController.listDocuments),
);

router.delete(
  '/:id/documents/:documentId',
  requirePermission('enrollment:read:own', 'enrollment:read:any', 'enrollment:manage:any'),
  asyncHandler(enrollmentController.removeDocument),
);

// Mounted separately at /training-compliance (routes/index.js) - not
// nested under /enrollments/:id, since it reads across an employee's
// entire enrollment history for one or every mandatory program, not a
// single Enrollment record.
export const trainingComplianceRouter = Router();
trainingComplianceRouter.use(authMiddleware);
trainingComplianceRouter.get(
  '/',
  requirePermission('enrollment:read:own', 'enrollment:read:any'),
  validateMiddleware(trainingComplianceQuerySchema, 'query'),
  asyncHandler(enrollmentController.getCompliance),
);

export default router;
