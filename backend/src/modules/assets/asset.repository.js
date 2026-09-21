import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.asset.create({ data });
};

const findById = (id, client = prisma) => {
  return client.asset.findUnique({ where: { id } });
};

// Case-insensitive on assetTag, same uniqueness convention as every prior
// domain in this review.
const findByAssetTag = (assetTag) => {
  return prisma.asset.findFirst({
    where: { assetTag: { equals: assetTag, mode: 'insensitive' } },
  });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.asset.findMany({ where, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.asset.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.asset.update({ where: { id }, data });
};

// Compare-and-set status change: only writes when the asset is still in
// `fromStatus`. Returns the affected row count (0 means another request
// won the race), so assign/return can never both act on the same asset.
const transitionStatus = async (id, fromStatus, toStatus, client = prisma) => {
  const result = await client.asset.updateMany({
    where: { id, status: fromStatus },
    data: { status: toStatus },
  });

  return result.count;
};

// Deliberately counts every AssetAssignment row, returned or not -
// domain-asset-management.md §4's "an asset with any assignment history
// cannot be hard-deleted" is a hard invariant (onDelete: Restrict backs
// it at the DB level).
const countAssignmentsForAsset = (assetId) => {
  return prisma.assetAssignment.count({ where: { assetId } });
};

const remove = (id, client = prisma) => {
  return client.asset.delete({ where: { id } });
};

export default {
  create,
  findById,
  findByAssetTag,
  findAll,
  count,
  update,
  transitionStatus,
  countAssignmentsForAsset,
  remove,
};
