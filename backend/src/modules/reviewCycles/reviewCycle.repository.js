import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.reviewCycle.create({ data });
};

const findById = (id, client = prisma) => {
  return client.reviewCycle.findUnique({ where: { id } });
};

// Case-insensitive on name (docs/domain-performance.md, same uniqueness
// convention as every prior master-data domain in this review).
const findByName = (name) => {
  return prisma.reviewCycle.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.reviewCycle.findMany({ where, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.reviewCycle.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.reviewCycle.update({ where: { id }, data });
};

// "Cannot hard-delete a ReviewCycle while any review references it" (§4's
// mandatory invariant) - checked before every delete, same "never
// hard-deleted while referenced" pattern as every prior master-data domain.
const countReferencesForReviewCycle = (reviewCycleId) => {
  return prisma.performanceReview.count({ where: { reviewCycleId } });
};

const remove = (id, client = prisma) => {
  return client.reviewCycle.delete({ where: { id } });
};

export default {
  create,
  findById,
  findByName,
  findAll,
  count,
  update,
  countReferencesForReviewCycle,
  remove,
};
