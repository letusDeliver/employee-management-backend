import { Router } from 'express';

import userController from './user.controller.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requireRole from '../../middlewares/rbac.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.get('/', authMiddleware, requireRole('ADMIN'), asyncHandler(userController.list));

export default router;
