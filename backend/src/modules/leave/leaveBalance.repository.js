import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.leaveBalance.create({ data });
};

const findById = (id, client = prisma) => {
  return client.leaveBalance.findUnique({ where: { id } });
};

const findByKey = (employeeId, leaveTypeId, year, client = prisma) => {
  return client.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
  });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.leaveBalance.findMany({ where, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.leaveBalance.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.leaveBalance.update({ where: { id }, data });
};

export default { create, findById, findByKey, findAll, count, update };
