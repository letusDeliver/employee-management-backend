import { Router } from 'express';

import payrollController from './payroll.controller.js';
import { listPayslipsQuerySchema } from './payroll.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.get(
  '/',
  requirePermission('payslip:read:any', 'payslip:read:own'),
  validateMiddleware(listPayslipsQuerySchema, 'query'),
  asyncHandler(payrollController.listPayslips),
);

router.get(
  '/:id',
  requirePermission('payslip:read:any', 'payslip:read:own'),
  asyncHandler(payrollController.getPayslipById),
);

export default router;
