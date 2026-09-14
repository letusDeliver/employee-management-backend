import { Router } from 'express';

import attendanceController from './attendance.controller.js';
import {
  createAttendanceRecordSchema,
  updateAttendanceRecordSchema,
  listAttendanceQuerySchema,
  effectiveStatusQuerySchema,
} from './attendance.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post(
  '/check-in',
  requirePermission('attendance:checkin'),
  asyncHandler(attendanceController.checkIn),
);

router.patch(
  '/check-out',
  requirePermission('attendance:checkin'),
  asyncHandler(attendanceController.checkOut),
);

router.post(
  '/',
  requirePermission('attendance:create:any'),
  validateMiddleware(createAttendanceRecordSchema),
  asyncHandler(attendanceController.create),
);

router.get(
  '/',
  requirePermission('attendance:read:any'),
  validateMiddleware(listAttendanceQuerySchema, 'query'),
  asyncHandler(attendanceController.list),
);

// Must precede '/:id' - otherwise Express would try to match "effective-
// status" itself as an :id value.
router.get(
  '/effective-status',
  requirePermission('attendance:read:any', 'attendance:read:own'),
  validateMiddleware(effectiveStatusQuerySchema, 'query'),
  asyncHandler(attendanceController.getEffectiveStatus),
);

router.get(
  '/:id',
  requirePermission('attendance:read:any', 'attendance:read:own'),
  asyncHandler(attendanceController.getById),
);

router.patch(
  '/:id',
  requirePermission('attendance:update:any'),
  validateMiddleware(updateAttendanceRecordSchema),
  asyncHandler(attendanceController.update),
);

router.delete(
  '/:id',
  requirePermission('attendance:delete:any'),
  asyncHandler(attendanceController.remove),
);

export default router;
