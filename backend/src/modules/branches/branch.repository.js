import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.branch.create({ data });
};

const findById = (id, client = prisma) => {
  return client.branch.findUnique({ where: { id } });
};

const findByNameOrCode = (name, code) => {
  return prisma.branch.findFirst({
    where: { OR: [{ name }, ...(code ? [{ code }] : [])] },
  });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.branch.findMany({ where, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.branch.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.branch.update({ where: { id }, data });
};

// Deliberately counts every Employee row referencing this branch, including
// soft-deleted ones - domain-branch.md's invariant is "never hard-deleted
// once referenced by any Employee" (not just active ones), and the schema's
// onDelete: Restrict on Employee.branchId enforces exactly this at the DB
// level regardless of deletedAt. Checking only non-deleted rows here would
// let this pass while the actual delete still throws a raw FK violation.
const countEmployeesForBranch = (branchId) => {
  return prisma.employee.count({ where: { branchId } });
};

const remove = (id, client = prisma) => {
  return client.branch.delete({ where: { id } });
};

export default {
  create,
  findById,
  findByNameOrCode,
  findAll,
  count,
  update,
  countEmployeesForBranch,
  remove,
};
