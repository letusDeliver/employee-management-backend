import prisma from '../../config/database.js';
import assetRepository from './asset.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import ConflictError from '../../errors/ConflictError.js';
import NotFoundError from '../../errors/NotFoundError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const DUPLICATE_ASSET_MESSAGE = 'An asset with this tag already exists';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

// Direct (PATCH) status changes only. ASSIGNED is entered via assignment
// and left via return, never here; RETIRED is terminal. A no-op (same
// status) is not a transition and is always allowed.
const DIRECT_TRANSITIONS = {
  AVAILABLE: ['UNDER_REPAIR', 'RETIRED'],
  UNDER_REPAIR: ['AVAILABLE', 'RETIRED'],
  ASSIGNED: [],
  RETIRED: [],
};

const createAsset = async (data, actor) => {
  const existing = await assetRepository.findByAssetTag(data.assetTag);

  if (existing) {
    throw new ConflictError(DUPLICATE_ASSET_MESSAGE);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const asset = await assetRepository.create(data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.ASSET,
          entityId: asset.id,
          beforeData: null,
          afterData: normalizeForAudit(asset),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return asset;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_ASSET_MESSAGE);
    }

    throw error;
  }
};

const getAssetById = async (id) => {
  const asset = await assetRepository.findById(id);

  if (!asset) {
    throw new NotFoundError('Asset not found');
  }

  return asset;
};

const buildAssetWhere = ({ search, type, status }) => {
  const where = {};

  if (search) {
    where.OR = [
      { assetTag: { contains: search, mode: 'insensitive' } },
      { type: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (type) {
    where.type = { equals: type, mode: 'insensitive' };
  }

  if (status) {
    where.status = status;
  }

  return where;
};

const listAssets = async (query) => {
  const { page, limit, sortBy, order, ...filters } = query;
  const where = buildAssetWhere(filters);

  const [assets, total] = await Promise.all([
    assetRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    assetRepository.count(where),
  ]);

  return {
    assets,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const updateAsset = async (id, data, actor) => {
  const asset = await assetRepository.findById(id);

  if (!asset) {
    throw new NotFoundError('Asset not found');
  }

  if (data.assetTag) {
    const existing = await assetRepository.findByAssetTag(data.assetTag);

    if (existing && existing.id !== id) {
      throw new ConflictError(DUPLICATE_ASSET_MESSAGE);
    }
  }

  if (data.status && data.status !== asset.status) {
    if (asset.status === 'ASSIGNED') {
      throw new ConflictError(
        'This asset is currently assigned - record its return before changing its status',
      );
    }

    if (!DIRECT_TRANSITIONS[asset.status].includes(data.status)) {
      throw new ConflictError(`Cannot change asset status from ${asset.status} to ${data.status}`);
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const { status, ...fields } = data;

      // Status changes are compare-and-set against the status validated
      // above, so a concurrent assign/return that moved the asset in
      // between can never be silently overwritten (ADR-AM02).
      if (status && status !== asset.status) {
        const changed = await assetRepository.transitionStatus(id, asset.status, status, tx);

        if (changed === 0) {
          throw new ConflictError('This asset was modified concurrently - reload it and retry');
        }
      }

      const updated = await assetRepository.update(id, fields, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.UPDATE,
          entityType: AUDIT_ENTITY_TYPES.ASSET,
          entityId: id,
          beforeData: normalizeForAudit(asset),
          afterData: normalizeForAudit(updated),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return updated;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_ASSET_MESSAGE);
    }

    throw error;
  }
};

const deleteAsset = async (id, actor) => {
  const asset = await assetRepository.findById(id);

  if (!asset) {
    throw new NotFoundError('Asset not found');
  }

  const referenceCount = await assetRepository.countAssignmentsForAsset(id);

  if (referenceCount > 0) {
    throw new ConflictError(
      'This asset has assignment history and cannot be deleted - retire it instead',
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await assetRepository.remove(id, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.DELETE,
          entityType: AUDIT_ENTITY_TYPES.ASSET,
          entityId: id,
          beforeData: normalizeForAudit(asset),
          afterData: null,
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );
    });
  } catch (error) {
    // An assignment landing between the count above and the delete trips
    // the onDelete: Restrict FK (P2003) - same outcome as the guard.
    if (error.code === 'P2003') {
      throw new ConflictError(
        'This asset has assignment history and cannot be deleted - retire it instead',
      );
    }

    throw error;
  }
};

// Positive allowlist (ADR-AM03): assignable means status === AVAILABLE,
// never the inverse. Consumed by assetAssignment.service.js.
const assertAssetAssignable = async (assetId) => {
  const asset = await assetRepository.findById(assetId);

  if (!asset) {
    throw new BadRequestError('assetId: references a record that does not exist');
  }

  if (asset.status !== 'AVAILABLE') {
    throw new BadRequestError(
      `assetId: this asset is ${asset.status} and cannot be assigned - only AVAILABLE assets can be assigned`,
    );
  }

  return asset;
};

export default {
  createAsset,
  getAssetById,
  listAssets,
  updateAsset,
  deleteAsset,
  assertAssetAssignable,
};
