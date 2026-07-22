import { Router } from 'express';

import authController from './auth.controller.js';
import { registerSchema, loginSchema } from './auth.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.post('/register', validateMiddleware(registerSchema), asyncHandler(authController.register));
router.post('/login', validateMiddleware(loginSchema), asyncHandler(authController.login));
router.post('/refresh', asyncHandler(authController.refresh));
router.post('/logout', asyncHandler(authController.logout));
router.get('/me', authMiddleware, asyncHandler(authController.me));

export default router;
