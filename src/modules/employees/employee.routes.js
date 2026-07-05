import { Router } from 'express';

import employeeController from './employee.controller.js';
import employeeDocumentController from './employeeDocument.controller.js';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  listEmployeesQuerySchema,
} from './employee.validation.js';
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
  requirePermission('employee:create'),
  validateMiddleware(createEmployeeSchema),
  asyncHandler(employeeController.create),
);

router.get(
  '/',
  requirePermission('employee:read:any'),
  validateMiddleware(listEmployeesQuerySchema, 'query'),
  asyncHandler(employeeController.list),
);

router.get(
  '/:id',
  requirePermission('employee:read:any', 'employee:read:own'),
  asyncHandler(employeeController.getById),
);

router.patch(
  '/:id',
  requirePermission('employee:update:any'),
  validateMiddleware(updateEmployeeSchema),
  asyncHandler(employeeController.update),
);

router.delete(
  '/:id',
  requirePermission('employee:delete:any'),
  asyncHandler(employeeController.remove),
);

router.post(
  '/:id/documents',
  requirePermission('employee:update:any'),
  uploadDocument.single('file'),
  asyncHandler(employeeDocumentController.upload),
);

router.get(
  '/:id/documents',
  requirePermission('employee:read:any', 'employee:read:own'),
  asyncHandler(employeeDocumentController.list),
);

router.delete(
  '/:id/documents/:documentId',
  requirePermission('employee:update:any'),
  asyncHandler(employeeDocumentController.remove),
);

export default router;
