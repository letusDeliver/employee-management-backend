import { Router } from 'express';

import assetController from './asset.controller.js';
import { createAssetSchema, updateAssetSchema, listAssetsQuerySchema } from './asset.validation.js';
import { assignAssetSchema, returnAssetSchema } from './assetAssignment.validation.js';
import validateMiddleware from '../../middlewares/validate.middleware.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import requirePermission from '../../middlewares/permission.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  requirePermission('asset:create'),
  validateMiddleware(createAssetSchema),
  asyncHandler(assetController.create),
);

router.get(
  '/',
  requirePermission('asset:read'),
  validateMiddleware(listAssetsQuerySchema, 'query'),
  asyncHandler(assetController.list),
);

router.get('/:id', requirePermission('asset:read'), asyncHandler(assetController.getById));

router.patch(
  '/:id',
  requirePermission('asset:update'),
  validateMiddleware(updateAssetSchema),
  asyncHandler(assetController.update),
);

router.delete('/:id', requirePermission('asset:delete'), asyncHandler(assetController.remove));

router.post(
  '/:id/assign',
  requirePermission('assetAssignment:create'),
  validateMiddleware(assignAssetSchema),
  asyncHandler(assetController.assign),
);

router.post(
  '/:id/return',
  requirePermission('assetAssignment:return'),
  validateMiddleware(returnAssetSchema),
  asyncHandler(assetController.returnAsset),
);

router.get(
  '/:id/current-holder',
  requirePermission('assetAssignment:read:any'),
  asyncHandler(assetController.getCurrentHolder),
);

router.get(
  '/:id/assignments',
  requirePermission('assetAssignment:read:any'),
  asyncHandler(assetController.listHistory),
);

export default router;
