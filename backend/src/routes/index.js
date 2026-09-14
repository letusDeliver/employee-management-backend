import { Router } from 'express';

import prisma from '../config/database.js';
import asyncHandler from '../utils/asyncHandler.js';
import ServiceUnavailableError from '../errors/ServiceUnavailableError.js';
import authRouter from '../modules/auth/auth.routes.js';
import userRouter from '../modules/users/user.routes.js';
import employeeRouter from '../modules/employees/employee.routes.js';
import branchRouter from '../modules/branches/branch.routes.js';
import departmentRouter from '../modules/departments/department.routes.js';
import designationRouter from '../modules/designations/designation.routes.js';
import holidayCalendarRouter from '../modules/holidayCalendars/holidayCalendar.routes.js';
import shiftRouter from '../modules/shifts/shift.routes.js';
import attendanceRouter from '../modules/attendance/attendance.routes.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/users', userRouter);
router.use('/employees', employeeRouter);
router.use('/branches', branchRouter);
router.use('/departments', departmentRouter);
router.use('/designations', designationRouter);
router.use('/holiday-calendars', holidayCalendarRouter);
router.use('/shifts', shiftRouter);
router.use('/attendance', attendanceRouter);

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

router.get(
  '/ready',
  asyncHandler(async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableError('Database connection is not available');
    }

    res.status(200).json({ status: 'ok', database: 'connected' });
  }),
);

export default router;
