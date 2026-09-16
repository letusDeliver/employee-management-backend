import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.enrollment.create({ data });
};

const findById = (id, client = prisma) => {
  return client.enrollment.findUnique({ where: { id }, include: { trainingProgram: true } });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.enrollment.findMany({
    where,
    orderBy,
    skip,
    take,
    include: { trainingProgram: true },
  });
};

const count = (where = {}) => {
  return prisma.enrollment.count({ where });
};

// The compliance calculation's core read (enrollment.service.js's
// getComplianceStatus, docs/domain-training.md ADR-TR02): the most recent
// COMPLETED enrollment for this employee/program pair, or null if the
// employee has never completed it.
const findMostRecentCompleted = (employeeId, trainingProgramId) => {
  return prisma.enrollment.findFirst({
    where: { employeeId, trainingProgramId, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
  });
};

const update = (id, data, client = prisma) => {
  return client.enrollment.update({ where: { id }, data });
};

const remove = (id, client = prisma) => {
  return client.enrollment.delete({ where: { id } });
};

export default { create, findById, findAll, count, findMostRecentCompleted, update, remove };
