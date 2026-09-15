import { Router } from 'express';

import reviewCycleController from './reviewCycle.controller.js';
import {
  createReviewCycleSchema,
  updateReviewCycleSchema,
  listReviewCyclesQuerySchema,
} from './reviewCycle.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission('reviewCycle:create'),
  validateMiddleware(createReviewCycleSchema),
  asyncHandler(reviewCycleController.create),
);

router.get(
  '/',
  requirePermission('reviewCycle:read'),
  validateMiddleware(listReviewCyclesQuerySchema, 'query'),
  asyncHandler(reviewCycleController.list),
);

router.get(
  '/:id',
  requirePermission('reviewCycle:read'),
  asyncHandler(reviewCycleController.getById),
);

router.patch(
  '/:id',
  requirePermission('reviewCycle:update'),
  validateMiddleware(updateReviewCycleSchema),
  asyncHandler(reviewCycleController.update),
);

router.delete(
  '/:id',
  requirePermission('reviewCycle:delete'),
  asyncHandler(reviewCycleController.remove),
);

export default router;
