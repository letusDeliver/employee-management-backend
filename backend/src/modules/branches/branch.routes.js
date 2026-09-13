import { Router } from 'express';

import branchController from './branch.controller.js';
import {
  createBranchSchema,
  updateBranchSchema,
  listBranchesQuerySchema,
} from './branch.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission('branch:create'),
  validateMiddleware(createBranchSchema),
  asyncHandler(branchController.create),
);

router.get(
  '/',
  requirePermission('branch:read'),
  validateMiddleware(listBranchesQuerySchema, 'query'),
  asyncHandler(branchController.list),
);

router.get('/:id', requirePermission('branch:read'), asyncHandler(branchController.getById));

router.patch(
  '/:id',
  requirePermission('branch:update'),
  validateMiddleware(updateBranchSchema),
  asyncHandler(branchController.update),
);

router.delete('/:id', requirePermission('branch:delete'), asyncHandler(branchController.remove));

export default router;
