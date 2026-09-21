import prisma from '../../config/database.js';

// Assignment reads include the Asset row so an employee reading their own
// holdings sees the tag/type, not just an opaque assetId.
const include = { asset: true };

const create = (data, client = prisma) => {
  return client.assetAssignment.create({ data, include });
};

const findById = (id, client = prisma) => {
  return client.assetAssignment.findUnique({ where: { id }, include });
};

const findActiveByAssetId = (assetId, client = prisma) => {
  return client.assetAssignment.findFirst({ where: { assetId, returnedAt: null }, include });
};

const findAllActiveByEmployeeId = (employeeId) => {
  return prisma.assetAssignment.findMany({
    where: { employeeId, returnedAt: null },
    orderBy: [{ assignedAt: 'desc' }, { id: 'asc' }],
    include,
  });
};

const findAllByAssetId = (assetId) => {
  return prisma.assetAssignment.findMany({
    where: { assetId },
    orderBy: [{ assignedAt: 'desc' }, { id: 'asc' }],
    include,
  });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.assetAssignment.findMany({ where, orderBy, skip, take, include });
};

const count = (where = {}) => {
  return prisma.assetAssignment.count({ where });
};

// The only update the ledger ever receives: closing an assignment. Guarded
// on returnedAt: null so a concurrent double-return closes it exactly once.
const closeActive = async (id, data, client = prisma) => {
  const result = await client.assetAssignment.updateMany({
    where: { id, returnedAt: null },
    data,
  });

  return result.count;
};

export default {
  create,
  findById,
  findActiveByAssetId,
  findAllActiveByEmployeeId,
  findAllByAssetId,
  findAll,
  count,
  closeActive,
};
