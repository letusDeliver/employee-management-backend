import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.leaveRequest.create({ data });
};

const findById = (id, client = prisma) => {
  return client.leaveRequest.findUnique({ where: { id } });
};

// Candidates for the overlap check (docs/domain-leave.md §4) - PENDING and
// APPROVED are the only statuses a new request can conflict with; REJECTED/
// CANCELLED requests never block a new application over the same dates.
const findActiveByEmployee = (employeeId) => {
  return prisma.leaveRequest.findMany({
    where: { employeeId, status: { in: ['PENDING', 'APPROVED'] } },
  });
};

// The query docs/domain-attendance.md §3/§12 names as a requirement for
// Leave to expose - "does employee X have an approved leave covering date
// Y" - consumed by attendance.service.js's getEffectiveStatus.
const findApprovedCoveringDate = (employeeId, date) => {
  return prisma.leaveRequest.findFirst({
    where: { employeeId, status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } },
  });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.leaveRequest.findMany({ where, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.leaveRequest.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.leaveRequest.update({ where: { id }, data });
};

export default {
  create,
  findById,
  findActiveByEmployee,
  findApprovedCoveringDate,
  findAll,
  count,
  update,
};
