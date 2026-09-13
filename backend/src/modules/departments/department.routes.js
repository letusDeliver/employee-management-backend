import { Router } from 'express';

import departmentController from './department.controller.js';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  listDepartmentsQuerySchema,
} from './department.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission('department:create'),
  validateMiddleware(createDepartmentSchema),
  asyncHandler(departmentController.create),
);

router.get(
  '/',
  requirePermission('department:read'),
  validateMiddleware(listDepartmentsQuerySchema, 'query'),
  asyncHandler(departmentController.list),
);

router.get(
  '/:id',
  requirePermission('department:read'),
  asyncHandler(departmentController.getById),
);

router.patch(
  '/:id',
  requirePermission('department:update'),
  validateMiddleware(updateDepartmentSchema),
  asyncHandler(departmentController.update),
);

router.delete(
  '/:id',
  requirePermission('department:delete'),
  asyncHandler(departmentController.remove),
);

export default router;
