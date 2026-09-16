import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.jobRequisition.create({ data });
};

const findById = (id, client = prisma) => {
  return client.jobRequisition.findUnique({
    where: { id },
    include: { department: true, designation: true, branch: true },
  });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.jobRequisition.findMany({
    where,
    orderBy,
    skip,
    take,
    include: { department: true, designation: true, branch: true },
  });
};

const count = (where = {}) => {
  return prisma.jobRequisition.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.jobRequisition.update({ where: { id }, data });
};

// Same zero-reference convenience-delete guard as Shift/ReviewCycle/
// LeaveType - counts every Application referencing this requisition, since
// Application.jobRequisitionId is Restrict (never hard-deleted while
// referenced).
const countApplicationsForRequisition = (jobRequisitionId) => {
  return prisma.application.count({ where: { jobRequisitionId } });
};

const remove = (id, client = prisma) => {
  return client.jobRequisition.delete({ where: { id } });
};

// A single guarded UPDATE, atomic at the DB level (Postgres row-level
// locking serializes concurrent decrements against the same row) - the
// WHERE clause enforces §4's mandatory invariant ("still OPEN AND has
// remaining openings") as the actual guard, not a separate read-then-write
// check that a race could slip between. Returns {count: 0} when the guard
// fails (not OPEN, or no openings left), letting the caller distinguish
// "decremented" from "rejected" without a second query.
const decrementRemainingOpenings = (id, client = prisma) => {
  return client.jobRequisition.updateMany({
    where: { id, status: 'OPEN', remainingOpenings: { gt: 0 } },
    data: { remainingOpenings: { decrement: 1 } },
  });
};

// Auto-closes a requisition once its openings are exhausted (§4). A second,
// separate guarded UPDATE rather than folded into decrementRemainingOpenings
// above - Prisma's updateMany can't read back the post-decrement value to
// branch on in the same call. Idempotent: two concurrent hires racing at the
// last opening may both attempt this, harmlessly.
const closeIfExhausted = (id, client = prisma) => {
  return client.jobRequisition.updateMany({
    where: { id, remainingOpenings: { lte: 0 }, status: 'OPEN' },
    data: { status: 'CLOSED' },
  });
};

export default {
  create,
  findById,
  findAll,
  count,
  update,
  countApplicationsForRequisition,
  remove,
  decrementRemainingOpenings,
  closeIfExhausted,
};
