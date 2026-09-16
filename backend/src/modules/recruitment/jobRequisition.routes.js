import { Router } from 'express';

import jobRequisitionController from './jobRequisition.controller.js';
import {
  createJobRequisitionSchema,
  updateJobRequisitionStatusSchema,
  listJobRequisitionsQuerySchema,
} from './jobRequisition.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission('jobRequisition:create'),
  validateMiddleware(createJobRequisitionSchema),
  asyncHandler(jobRequisitionController.create),
);

router.get(
  '/',
  requirePermission('jobRequisition:read'),
  validateMiddleware(listJobRequisitionsQuerySchema, 'query'),
  asyncHandler(jobRequisitionController.list),
);

router.get(
  '/:id',
  requirePermission('jobRequisition:read'),
  asyncHandler(jobRequisitionController.getById),
);

router.patch(
  '/:id/status',
  requirePermission('jobRequisition:update'),
  validateMiddleware(updateJobRequisitionStatusSchema),
  asyncHandler(jobRequisitionController.updateStatus),
);

router.delete(
  '/:id',
  requirePermission('jobRequisition:delete'),
  asyncHandler(jobRequisitionController.remove),
);

export default router;
