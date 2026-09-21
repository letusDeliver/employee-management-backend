import { Router } from 'express';

import assetAssignmentController from './assetAssignment.controller.js';
import { listAssetAssignmentsQuerySchema } from './assetAssignment.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.get(
  '/',
  requirePermission('assetAssignment:read:own', 'assetAssignment:read:any'),
  validateMiddleware(listAssetAssignmentsQuerySchema, 'query'),
  asyncHandler(assetAssignmentController.list),
);

router.get(
  '/:id',
  requirePermission('assetAssignment:read:own', 'assetAssignment:read:any'),
  asyncHandler(assetAssignmentController.getById),
);

export default router;
