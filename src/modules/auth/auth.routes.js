import { Router } from 'express';

import authController from './auth.controller.js';
import { registerSchema, loginSchema } from './auth.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.post('/register', validateMiddleware(registerSchema), asyncHandler(authController.register));
router.post('/login', validateMiddleware(loginSchema), asyncHandler(authController.login));

export default router;
