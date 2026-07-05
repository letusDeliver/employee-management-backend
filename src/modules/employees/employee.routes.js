import { Router } from 'express';

import employeeController from './employee.controller.js';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  listEmployeesQuerySchema,
} from './employee.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission('employee:create'),
  validateMiddleware(createEmployeeSchema),
  asyncHandler(employeeController.create),
);

router.get(
  '/',
  requirePermission('employee:read:any'),
  validateMiddleware(listEmployeesQuerySchema, 'query'),
  asyncHandler(employeeController.list),
);

router.get(
  '/:id',
  requirePermission('employee:read:any', 'employee:read:own'),
  asyncHandler(employeeController.getById),
);

router.patch(
  '/:id',
  requirePermission('employee:update:any'),
  validateMiddleware(updateEmployeeSchema),
  asyncHandler(employeeController.update),
);

router.delete(
  '/:id',
  requirePermission('employee:delete:any'),
  asyncHandler(employeeController.remove),
);

export default router;
