import { Router } from 'express';

import trainingProgramController from './trainingProgram.controller.js';
import {
  createTrainingProgramSchema,
  updateTrainingProgramSchema,
  listTrainingProgramsQuerySchema,
} from './trainingProgram.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission('trainingProgram:create'),
  validateMiddleware(createTrainingProgramSchema),
  asyncHandler(trainingProgramController.create),
);

router.get(
  '/',
  requirePermission('trainingProgram:read'),
  validateMiddleware(listTrainingProgramsQuerySchema, 'query'),
  asyncHandler(trainingProgramController.list),
);

router.get(
  '/:id',
  requirePermission('trainingProgram:read'),
  asyncHandler(trainingProgramController.getById),
);

router.patch(
  '/:id',
  requirePermission('trainingProgram:update'),
  validateMiddleware(updateTrainingProgramSchema),
  asyncHandler(trainingProgramController.update),
);

router.delete(
  '/:id',
  requirePermission('trainingProgram:delete'),
  asyncHandler(trainingProgramController.remove),
);

export default router;
