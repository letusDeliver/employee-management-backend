import { Router } from 'express';

import holidayCalendarController from './holidayCalendar.controller.js';
import {
  createHolidayCalendarSchema,
  updateHolidayCalendarSchema,
  listHolidayCalendarsQuerySchema,
  createHolidaySchema,
  updateHolidaySchema,
} from './holidayCalendar.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission('holidayCalendar:create'),
  validateMiddleware(createHolidayCalendarSchema),
  asyncHandler(holidayCalendarController.create),
);

router.get(
  '/',
  requirePermission('holidayCalendar:read'),
  validateMiddleware(listHolidayCalendarsQuerySchema, 'query'),
  asyncHandler(holidayCalendarController.list),
);

router.get(
  '/:id',
  requirePermission('holidayCalendar:read'),
  asyncHandler(holidayCalendarController.getById),
);

router.patch(
  '/:id',
  requirePermission('holidayCalendar:update'),
  validateMiddleware(updateHolidayCalendarSchema),
  asyncHandler(holidayCalendarController.update),
);

router.delete(
  '/:id',
  requirePermission('holidayCalendar:delete'),
  asyncHandler(holidayCalendarController.remove),
);

router.post(
  '/:id/holidays',
  requirePermission('holidayCalendar:update'),
  validateMiddleware(createHolidaySchema),
  asyncHandler(holidayCalendarController.addHoliday),
);

router.get(
  '/:id/holidays',
  requirePermission('holidayCalendar:read'),
  asyncHandler(holidayCalendarController.listHolidays),
);

router.patch(
  '/:id/holidays/:holidayId',
  requirePermission('holidayCalendar:update'),
  validateMiddleware(updateHolidaySchema),
  asyncHandler(holidayCalendarController.updateHoliday),
);

router.delete(
  '/:id/holidays/:holidayId',
  requirePermission('holidayCalendar:update'),
  asyncHandler(holidayCalendarController.removeHoliday),
);

export default router;
