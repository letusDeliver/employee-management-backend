import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.leaveType.create({ data });
};

const findById = (id, client = prisma) => {
  return client.leaveType.findUnique({ where: { id } });
};

// Case-insensitive on name (docs/domain-leave.md §4, same uniqueness
// convention as every prior master-data domain in this review).
const findByName = (name) => {
  return prisma.leaveType.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.leaveType.findMany({ where, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.leaveType.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.leaveType.update({ where: { id }, data });
};

// Counts every LeaveRequest AND LeaveBalance row referencing this type -
// both must be zero before a hard delete is allowed (same "never
// hard-deleted while referenced" invariant as every prior master-data
// domain, just checked across two referencing aggregates instead of one).
const countReferencesForLeaveType = async (leaveTypeId) => {
  const [requestCount, balanceCount] = await Promise.all([
    prisma.leaveRequest.count({ where: { leaveTypeId } }),
    prisma.leaveBalance.count({ where: { leaveTypeId } }),
  ]);
  return requestCount + balanceCount;
};

const remove = (id, client = prisma) => {
  return client.leaveType.delete({ where: { id } });
};

export default {
  create,
  findById,
  findByName,
  findAll,
  count,
  update,
  countReferencesForLeaveType,
  remove,
};
