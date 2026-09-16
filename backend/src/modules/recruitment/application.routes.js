import { Router } from 'express';

import applicationController from './application.controller.js';
import {
  createApplicationSchema,
  updateApplicationStatusSchema,
  listApplicationsQuerySchema,
  createInterviewSchema,
  updateInterviewSchema,
  createOfferSchema,
  hireApplicationSchema,
} from './application.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission('application:create'),
  validateMiddleware(createApplicationSchema),
  asyncHandler(applicationController.create),
);

router.get(
  '/',
  requirePermission('application:read'),
  validateMiddleware(listApplicationsQuerySchema, 'query'),
  asyncHandler(applicationController.list),
);

router.get(
  '/:id',
  requirePermission('application:read'),
  asyncHandler(applicationController.getById),
);

router.patch(
  '/:id/status',
  requirePermission('application:update'),
  validateMiddleware(updateApplicationStatusSchema),
  asyncHandler(applicationController.updateStatus),
);

router.post(
  '/:id/hire',
  requirePermission('application:hire'),
  validateMiddleware(hireApplicationSchema),
  asyncHandler(applicationController.hire),
);

router.post(
  '/:id/interviews',
  requirePermission('application:update'),
  validateMiddleware(createInterviewSchema),
  asyncHandler(applicationController.createInterview),
);

router.get(
  '/:id/interviews',
  requirePermission('application:read'),
  asyncHandler(applicationController.listInterviews),
);

router.patch(
  '/:id/interviews/:interviewId',
  requirePermission('application:update'),
  validateMiddleware(updateInterviewSchema),
  asyncHandler(applicationController.updateInterview),
);

router.delete(
  '/:id/interviews/:interviewId',
  requirePermission('application:update'),
  asyncHandler(applicationController.deleteInterview),
);

router.post(
  '/:id/offers',
  requirePermission('application:update'),
  validateMiddleware(createOfferSchema),
  asyncHandler(applicationController.createOffer),
);

router.patch(
  '/:id/offers/:offerId/accept',
  requirePermission('application:update'),
  asyncHandler(applicationController.acceptOffer),
);

router.patch(
  '/:id/offers/:offerId/decline',
  requirePermission('application:update'),
  asyncHandler(applicationController.declineOffer),
);

router.patch(
  '/:id/offers/:offerId/expire',
  requirePermission('application:update'),
  asyncHandler(applicationController.expireOffer),
);

export default router;
