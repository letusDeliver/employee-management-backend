import { Router } from 'express';

import designationController from './designation.controller.js';
import {
  createDesignationSchema,
  updateDesignationSchema,
  listDesignationsQuerySchema,
} from './designation.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission('designation:create'),
  validateMiddleware(createDesignationSchema),
  asyncHandler(designationController.create),
);

router.get(
  '/',
  requirePermission('designation:read'),
  validateMiddleware(listDesignationsQuerySchema, 'query'),
  asyncHandler(designationController.list),
);

router.get(
  '/:id',
  requirePermission('designation:read'),
  asyncHandler(designationController.getById),
);

router.patch(
  '/:id',
  requirePermission('designation:update'),
  validateMiddleware(updateDesignationSchema),
  asyncHandler(designationController.update),
);

router.delete(
  '/:id',
  requirePermission('designation:delete'),
  asyncHandler(designationController.remove),
);

export default router;
