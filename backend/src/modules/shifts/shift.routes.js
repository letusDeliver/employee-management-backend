import { Router } from 'express';

import shiftController from './shift.controller.js';
import {
  createShiftSchema,
  updateShiftSchema,
  listShiftsQuerySchema,
} from './shift.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission('shift:create'),
  validateMiddleware(createShiftSchema),
  asyncHandler(shiftController.create),
);

router.get(
  '/',
  requirePermission('shift:read'),
  validateMiddleware(listShiftsQuerySchema, 'query'),
  asyncHandler(shiftController.list),
);

router.get('/:id', requirePermission('shift:read'), asyncHandler(shiftController.getById));

router.patch(
  '/:id',
  requirePermission('shift:update'),
  validateMiddleware(updateShiftSchema),
  asyncHandler(shiftController.update),
);

router.delete('/:id', requirePermission('shift:delete'), asyncHandler(shiftController.remove));

export default router;
