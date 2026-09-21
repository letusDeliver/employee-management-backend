import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.clearanceItem.create({ data });
};

const createMany = (data, client = prisma) => {
  return client.clearanceItem.createMany({ data });
};

const findById = (id, client = prisma) => {
  return client.clearanceItem.findUnique({ where: { id } });
};

const update = (id, data, client = prisma) => {
  return client.clearanceItem.update({ where: { id }, data });
};

// Resolves every still-PENDING item of one type on a case - used at
// separation to mark the ACCESS_REVOCATION item DONE, since the offboarding
// primitive itself is what revokes access.
const resolvePendingByType = (exitCaseId, type, data, client = prisma) => {
  return client.clearanceItem.updateMany({
    where: { exitCaseId, type, status: 'PENDING' },
    data,
  });
};

const countPending = (exitCaseId, client = prisma) => {
  return client.clearanceItem.count({ where: { exitCaseId, status: 'PENDING' } });
};

// Assets that already have a PENDING or WAIVED item on this case. A DONE
// item does not count: if that asset was returned and then re-issued to the
// same employee, it needs a fresh item. WAIVED does count - a waived (lost)
// asset must not be resurrected as a new pending item.
const findAssetIdsWithOpenOrWaivedItem = async (exitCaseId, client = prisma) => {
  const rows = await client.clearanceItem.findMany({
    where: { exitCaseId, assetId: { not: null }, status: { in: ['PENDING', 'WAIVED'] } },
    select: { assetId: true },
  });

  return rows.map((row) => row.assetId);
};

export default {
  create,
  createMany,
  findById,
  update,
  resolvePendingByType,
  countPending,
  findAssetIdsWithOpenOrWaivedItem,
};
