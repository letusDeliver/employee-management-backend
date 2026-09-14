import { Router } from 'express';

import leaveController from './leave.controller.js';
import {
  createLeaveRequestSchema,
  rejectLeaveRequestSchema,
  listLeaveRequestsQuerySchema,
} from './leave.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission('leaveRequest:create:own'),
  validateMiddleware(createLeaveRequestSchema),
  asyncHandler(leaveController.create),
);

router.get(
  '/',
  requirePermission('leaveRequest:read:any', 'leaveRequest:read:own'),
  validateMiddleware(listLeaveRequestsQuerySchema, 'query'),
  asyncHandler(leaveController.list),
);

router.get(
  '/:id',
  requirePermission('leaveRequest:read:any', 'leaveRequest:read:own'),
  asyncHandler(leaveController.getById),
);

router.patch(
  '/:id/approve',
  requirePermission('leaveRequest:decide:any', 'leaveRequest:decide:reports'),
  asyncHandler(leaveController.approve),
);

router.patch(
  '/:id/reject',
  requirePermission('leaveRequest:decide:any', 'leaveRequest:decide:reports'),
  validateMiddleware(rejectLeaveRequestSchema),
  asyncHandler(leaveController.reject),
);

router.patch(
  '/:id/cancel',
  requirePermission('leaveRequest:cancel:any', 'leaveRequest:cancel:own'),
  asyncHandler(leaveController.cancel),
);

export default router;
