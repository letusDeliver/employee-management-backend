import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.performanceReview.create({ data });
};

const findById = (id) => {
  return prisma.performanceReview.findUnique({
    where: { id },
    include: { addenda: { orderBy: { createdAt: 'asc' } } },
  });
};

const findByEmployeeAndCycle = (employeeId, reviewCycleId) => {
  return prisma.performanceReview.findUnique({
    where: { employeeId_reviewCycleId: { employeeId, reviewCycleId } },
  });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.performanceReview.findMany({ where, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.performanceReview.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.performanceReview.update({ where: { id }, data });
};

const remove = (id, client = prisma) => {
  return client.performanceReview.delete({ where: { id } });
};

const createAddendum = (data, client = prisma) => {
  return client.reviewAddendum.create({ data });
};

export default {
  create,
  findById,
  findByEmployeeAndCycle,
  findAll,
  count,
  update,
  remove,
  createAddendum,
};
