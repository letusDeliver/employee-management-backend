import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.employee.create({ data });
};

const findById = (id) => {
  return prisma.employee.findFirst({ where: { id, deletedAt: null } });
};

const findByUserId = (userId) => {
  return prisma.employee.findFirst({ where: { userId, deletedAt: null } });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.employee.findMany({
    where: { ...where, deletedAt: null },
    orderBy,
    skip,
    take,
  });
};

const count = (where = {}) => {
  return prisma.employee.count({ where: { ...where, deletedAt: null } });
};

const update = (id, data, client = prisma) => {
  return client.employee.update({ where: { id }, data });
};

const softDelete = (id, client = prisma) => {
  return client.employee.update({ where: { id }, data: { deletedAt: new Date() } });
};

export default { create, findById, findByUserId, findAll, count, update, softDelete };
