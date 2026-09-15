import { Router } from 'express';

import performanceController from './performance.controller.js';
import {
  createPerformanceReviewSchema,
  updatePerformanceReviewSchema,
  selfAssessmentSchema,
  addAddendumSchema,
  listPerformanceReviewsQuerySchema,
} from './performance.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission('performanceReview:create:reports', 'performanceReview:create:any'),
  validateMiddleware(createPerformanceReviewSchema),
  asyncHandler(performanceController.create),
);

router.get(
  '/',
  requirePermission(
    'performanceReview:read:any',
    'performanceReview:read:own',
    'performanceReview:manage:reports',
  ),
  validateMiddleware(listPerformanceReviewsQuerySchema, 'query'),
  asyncHandler(performanceController.list),
);

router.get(
  '/:id',
  requirePermission(
    'performanceReview:read:any',
    'performanceReview:read:own',
    'performanceReview:manage:reports',
    'performanceReview:manage:any',
  ),
  asyncHandler(performanceController.getById),
);

router.patch(
  '/:id',
  requirePermission('performanceReview:manage:reports', 'performanceReview:manage:any'),
  validateMiddleware(updatePerformanceReviewSchema),
  asyncHandler(performanceController.update),
);

router.patch(
  '/:id/submit',
  requirePermission('performanceReview:manage:reports', 'performanceReview:manage:any'),
  asyncHandler(performanceController.submit),
);

router.patch(
  '/:id/acknowledge',
  requirePermission('performanceReview:acknowledge:own'),
  asyncHandler(performanceController.acknowledge),
);

router.patch(
  '/:id/self-assessment',
  requirePermission('performanceReview:selfAssess:own'),
  validateMiddleware(selfAssessmentSchema),
  asyncHandler(performanceController.selfAssess),
);

router.delete(
  '/:id',
  requirePermission('performanceReview:manage:reports', 'performanceReview:manage:any'),
  asyncHandler(performanceController.remove),
);

router.post(
  '/:id/addenda',
  requirePermission(
    'performanceReview:read:any',
    'performanceReview:read:own',
    'performanceReview:manage:reports',
    'performanceReview:manage:any',
  ),
  validateMiddleware(addAddendumSchema),
  asyncHandler(performanceController.addAddendum),
);

export default router;
