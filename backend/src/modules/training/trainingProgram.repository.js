import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.trainingProgram.create({ data });
};

const findById = (id, client = prisma) => {
  return client.trainingProgram.findUnique({ where: { id } });
};

// Case-insensitive on name, same uniqueness convention as every prior
// domain in this review.
const findByName = (name) => {
  return prisma.trainingProgram.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.trainingProgram.findMany({ where, orderBy, skip, take });
};

// Every mandatory, ACTIVE program - the input set for the bulk compliance
// report (enrollment.service.js's getComplianceReportForEmployee).
const findAllMandatoryActive = () => {
  return prisma.trainingProgram.findMany({ where: { mandatory: true, status: 'ACTIVE' } });
};

const count = (where = {}) => {
  return prisma.trainingProgram.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.trainingProgram.update({ where: { id }, data });
};

// Deliberately counts every Enrollment row referencing this program,
// including terminal-status ones - domain-training.md §4's "never
// hard-deleted while referenced" is a hard invariant, and onDelete:
// Restrict enforces this at the DB level regardless of Enrollment status.
const countEnrollmentsForProgram = (trainingProgramId) => {
  return prisma.enrollment.count({ where: { trainingProgramId } });
};

const remove = (id, client = prisma) => {
  return client.trainingProgram.delete({ where: { id } });
};

export default {
  create,
  findById,
  findByName,
  findAll,
  findAllMandatoryActive,
  count,
  update,
  countEnrollmentsForProgram,
  remove,
};
