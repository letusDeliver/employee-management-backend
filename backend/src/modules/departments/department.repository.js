import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.department.create({ data });
};

const findById = (id, client = prisma) => {
  return client.department.findUnique({ where: { id } });
};

// Case-insensitive on name (docs/domain-department.md §3: "unique
// (case-insensitive) among non-archived departments") - unlike Branch's
// equivalent lookup, which the business architecture never made that
// explicit requirement for. `code`, when present, is matched exactly.
const findByNameOrCode = (name, code) => {
  return prisma.department.findFirst({
    where: {
      OR: [{ name: { equals: name, mode: 'insensitive' } }, ...(code ? [{ code }] : [])],
    },
  });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.department.findMany({ where, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.department.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.department.update({ where: { id }, data });
};

// Deliberately counts every Employee row referencing this department,
// including soft-deleted ones - same reasoning as Branch's equivalent
// (docs/domain-department.md's "never hard-deleted while referenced" is a
// hard invariant, and departmentId is mandatory so even a soft-deleted
// Employee still holds a non-null reference; onDelete: Restrict enforces
// this at the DB level regardless of deletedAt).
const countEmployeesForDepartment = (departmentId) => {
  return prisma.employee.count({ where: { departmentId } });
};

const remove = (id, client = prisma) => {
  return client.department.delete({ where: { id } });
};

export default {
  create,
  findById,
  findByNameOrCode,
  findAll,
  count,
  update,
  countEmployeesForDepartment,
  remove,
};
