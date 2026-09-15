import { Router } from 'express';

import payrollController from './payroll.controller.js';
import { createPayrollRunSchema, listPayrollRunsQuerySchema } from './payroll.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission('payrollRun:create'),
  validateMiddleware(createPayrollRunSchema),
  asyncHandler(payrollController.create),
);

router.get(
  '/',
  requirePermission('payrollRun:read'),
  validateMiddleware(listPayrollRunsQuerySchema, 'query'),
  asyncHandler(payrollController.list),
);

router.get(
  '/:id',
  requirePermission('payrollRun:read'),
  asyncHandler(payrollController.getById),
);

router.patch(
  '/:id/process',
  requirePermission('payrollRun:process'),
  asyncHandler(payrollController.process),
);

router.patch(
  '/:id/finalize',
  requirePermission('payrollRun:finalize'),
  asyncHandler(payrollController.finalize),
);

router.patch(
  '/:id/mark-paid',
  requirePermission('payrollRun:markPaid'),
  asyncHandler(payrollController.markPaid),
);

router.delete(
  '/:id',
  requirePermission('payrollRun:delete'),
  asyncHandler(payrollController.remove),
);

export default router;
