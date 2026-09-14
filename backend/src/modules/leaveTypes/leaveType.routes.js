import { Router } from 'express';

import leaveTypeController from './leaveType.controller.js';
import {
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
  listLeaveTypesQuerySchema,
} from './leaveType.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission('leaveType:create'),
  validateMiddleware(createLeaveTypeSchema),
  asyncHandler(leaveTypeController.create),
);

router.get(
  '/',
  requirePermission('leaveType:read'),
  validateMiddleware(listLeaveTypesQuerySchema, 'query'),
  asyncHandler(leaveTypeController.list),
);

router.get(
  '/:id',
  requirePermission('leaveType:read'),
  asyncHandler(leaveTypeController.getById),
);

router.patch(
  '/:id',
  requirePermission('leaveType:update'),
  validateMiddleware(updateLeaveTypeSchema),
  asyncHandler(leaveTypeController.update),
);

router.delete(
  '/:id',
  requirePermission('leaveType:delete'),
  asyncHandler(leaveTypeController.remove),
);

export default router;
