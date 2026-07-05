import { Router } from 'express';

import userController from './user.controller.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.get('/', authMiddleware, requirePermission('user:list'), asyncHandler(userController.list));

export default router;
