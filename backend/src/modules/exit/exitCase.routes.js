import { Router } from 'express';

import exitCaseController from './exitCase.controller.js';
import {
  createExitCaseSchema,
  updateExitCaseSchema,
  separateExitCaseSchema,
  addClearanceItemSchema,
  updateClearanceItemSchema,
  listExitCasesQuerySchema,
} from './exitCase.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission('exitCase:create:own', 'exitCase:create:any'),
  validateMiddleware(createExitCaseSchema),
  asyncHandler(exitCaseController.create),
);

router.get(
  '/',
  requirePermission('exitCase:read:own', 'exitCase:read:any'),
  validateMiddleware(listExitCasesQuerySchema, 'query'),
  asyncHandler(exitCaseController.list),
);

// Registered before the /:id routes so the literal path is never read as an id.
router.post(
  '/process-due',
  requirePermission('exitCase:manage:any'),
  asyncHandler(exitCaseController.processDue),
);

router.get(
  '/:id',
  requirePermission('exitCase:read:own', 'exitCase:read:any'),
  asyncHandler(exitCaseController.getById),
);

router.patch(
  '/:id',
  requirePermission('exitCase:manage:any'),
  validateMiddleware(updateExitCaseSchema),
  asyncHandler(exitCaseController.update),
);

router.post(
  '/:id/withdraw',
  requirePermission('exitCase:manage:any', 'exitCase:withdraw:own'),
  asyncHandler(exitCaseController.withdraw),
);

router.post(
  '/:id/separate',
  requirePermission('exitCase:manage:any'),
  validateMiddleware(separateExitCaseSchema),
  asyncHandler(exitCaseController.separate),
);

router.post(
  '/:id/clearance-items',
  requirePermission('exitCase:manage:any'),
  validateMiddleware(addClearanceItemSchema),
  asyncHandler(exitCaseController.addClearanceItem),
);

router.patch(
  '/:id/clearance-items/:itemId',
  requirePermission('exitCase:manage:any'),
  validateMiddleware(updateClearanceItemSchema),
  asyncHandler(exitCaseController.updateClearanceItem),
);

export default router;
