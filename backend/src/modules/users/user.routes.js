import { Router } from 'express';

import userController from './user.controller.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import createUploadMiddleware from '../../middlewares/upload.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

const uploadProfilePicture = createUploadMiddleware({
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxSizeBytes: 5 * 1024 * 1024,
});

router.get('/', authMiddleware, requirePermission('user:list'), asyncHandler(userController.list));

router.post(
  '/me/profile-picture',
  authMiddleware,
  uploadProfilePicture.single('file'),
  asyncHandler(userController.uploadProfilePicture),
);

router.delete(
  '/me/profile-picture',
  authMiddleware,
  asyncHandler(userController.deleteProfilePicture),
);

export default router;
