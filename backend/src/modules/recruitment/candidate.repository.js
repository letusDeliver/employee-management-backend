import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.candidate.create({ data });
};

const findById = (id, client = prisma) => {
  return client.candidate.findUnique({ where: { id } });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.candidate.findMany({ where, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.candidate.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.candidate.update({ where: { id }, data });
};

// Zero-reference delete guard, same convention as Shift/ReviewCycle/
// JobRequisition - Candidate.applications is Restrict.
const countApplicationsForCandidate = (candidateId) => {
  return prisma.application.count({ where: { candidateId } });
};

// A real hard delete, unlike Employee's soft-delete - Candidate carries no
// HR-record retention value of its own the way Employee does, and this is
// the minimal, honest escape hatch for a legitimate erasure request on a
// candidate with zero Applications (docs/domain-recruitment.md ADR-RC04
// remains genuinely deferred for a candidate who DID go through a pipeline
// - not resolved here, since that requires the still-pending legal/
// compliance input the domain doc names, not a unilateral engineering call).
const remove = (id, client = prisma) => {
  return client.candidate.delete({ where: { id } });
};

export default { create, findById, findAll, count, update, countApplicationsForCandidate, remove };
