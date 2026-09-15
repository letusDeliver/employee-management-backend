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

// Payroll's own read (docs/domain-payroll.md §5's "read current department/
// designation/branch names for snapshotting") - the only consumer that
// needs Department/Designation/Branch/User names in the same query rather
// than the bare Employee row every other findAll/findById caller uses.
const findAllActiveWithOrgContext = () => {
  return prisma.employee.findMany({
    where: { deletedAt: null },
    include: { department: true, designation: true, branch: true, user: true },
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

export default {
  create,
  findById,
  findByUserId,
  findAll,
  findAllActiveWithOrgContext,
  count,
  update,
  softDelete,
};
