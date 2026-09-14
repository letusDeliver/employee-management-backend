import { Router } from 'express';

import leaveController from './leave.controller.js';
import { listLeaveBalancesQuerySchema, adjustLeaveBalanceSchema } from './leave.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.get(
  '/',
  requirePermission('leaveBalance:read:any', 'leaveBalance:read:own'),
  validateMiddleware(listLeaveBalancesQuerySchema, 'query'),
  asyncHandler(leaveController.listBalances),
);

router.get(
  '/:id',
  requirePermission('leaveBalance:read:any', 'leaveBalance:read:own'),
  asyncHandler(leaveController.getBalanceById),
);

router.patch(
  '/:id',
  requirePermission('leaveBalance:adjust:any'),
  validateMiddleware(adjustLeaveBalanceSchema),
  asyncHandler(leaveController.adjustBalance),
);

export default router;
