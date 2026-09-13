import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.designation.create({ data });
};

const findById = (id, client = prisma) => {
  return client.designation.findUnique({ where: { id } });
};

// Case-insensitive on name (docs/domain-designation.md §4: "unique
// (case-insensitive) among non-archived designations"), same pattern as
// Department's equivalent lookup. `code`, when present, is matched exactly.
const findByNameOrCode = (name, code) => {
  return prisma.designation.findFirst({
    where: {
      OR: [{ name: { equals: name, mode: 'insensitive' } }, ...(code ? [{ code }] : [])],
    },
  });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.designation.findMany({ where, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.designation.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.designation.update({ where: { id }, data });
};

// Deliberately counts every Employee row referencing this designation,
// including soft-deleted ones - same reasoning as Branch/Department's
// equivalent (docs/domain-designation.md's "never hard-deleted while
// referenced" is a hard invariant, and designationId is mandatory so even a
// soft-deleted Employee still holds a non-null reference; onDelete: Restrict
// enforces this at the DB level regardless of deletedAt).
const countEmployeesForDesignation = (designationId) => {
  return prisma.employee.count({ where: { designationId } });
};

const remove = (id, client = prisma) => {
  return client.designation.delete({ where: { id } });
};

export default {
  create,
  findById,
  findByNameOrCode,
  findAll,
  count,
  update,
  countEmployeesForDesignation,
  remove,
};
