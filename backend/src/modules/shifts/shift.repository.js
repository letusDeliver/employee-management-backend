import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.shift.create({ data });
};

const findById = (id, client = prisma) => {
  return client.shift.findUnique({ where: { id } });
};

// Case-insensitive on name (docs/domain-shift.md §4, same uniqueness
// convention as every prior domain in this review).
const findByName = (name) => {
  return prisma.shift.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.shift.findMany({ where, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.shift.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.shift.update({ where: { id }, data });
};

// Deliberately counts every Employee row referencing this shift, including
// soft-deleted ones - same reasoning as Branch/Department/Designation's
// equivalent (docs/domain-shift.md's "never hard-deleted while referenced"
// is a hard invariant, and onDelete: Restrict enforces this at the DB level
// regardless of deletedAt).
const countEmployeesForShift = (shiftId) => {
  return prisma.employee.count({ where: { shiftId } });
};

const remove = (id, client = prisma) => {
  return client.shift.delete({ where: { id } });
};

export default {
  create,
  findById,
  findByName,
  findAll,
  count,
  update,
  countEmployeesForShift,
  remove,
};
