import prisma from '../../config/database.js';

// Every single-case read includes its clearance items, oldest first, so a
// caller never needs a second query to see the whole checklist.
// Ordered by type (enum declaration order: asset returns first, access
// revocation last), then creation time - default items are written in one
// statement and share a createdAt, so createdAt alone would leave the order
// to random ids.
const include = {
  clearanceItems: { orderBy: [{ type: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] },
};

const create = (data, client = prisma) => {
  return client.exitCase.create({ data, include });
};

const findById = (id, client = prisma) => {
  return client.exitCase.findUnique({ where: { id }, include });
};

// The partial unique index in the migration guarantees at most one of
// these per employee; this read is the friendly pre-check in front of it.
const findOpenByEmployeeId = (employeeId, client = prisma) => {
  return client.exitCase.findFirst({
    where: { employeeId, status: { in: ['INITIATED', 'SEPARATED'] } },
  });
};

// Row-locks the case for the rest of the caller's transaction and returns
// its CURRENT status (or null). Every status-guarded write that is not
// already a compare-and-set takes this first, so a concurrent separation/
// withdrawal/completion cannot slip between the check and the write, and two
// concurrent clearance updates serialize (each then sees the other's item).
const lockStatusById = async (id, client) => {
  const rows = await client.$queryRaw`SELECT "status" FROM "ExitCase" WHERE "id" = ${id} FOR UPDATE`;

  return rows.length > 0 ? rows[0].status : null;
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.exitCase.findMany({ where, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.exitCase.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.exitCase.update({ where: { id }, data, include });
};

// Compare-and-set status change: only writes while the case is still in
// `fromStatus`. Returns the affected row count (0 means another request
// already moved it), which is what makes "the offboarding primitive runs
// exactly once per case" hold under concurrency (ADR-EM02).
const transitionStatus = async (id, fromStatus, toStatus, extra = {}, client = prisma) => {
  const result = await client.exitCase.updateMany({
    where: { id, status: fromStatus },
    data: { status: toStatus, ...extra },
  });

  return result.count;
};

// INITIATED cases whose last working day has arrived - the input set for
// the time-based separation sweep.
const findDueForSeparation = (today) => {
  return prisma.exitCase.findMany({
    where: { status: 'INITIATED', lastWorkingDay: { lte: today } },
    orderBy: [{ lastWorkingDay: 'asc' }, { id: 'asc' }],
  });
};

export default {
  create,
  findById,
  findOpenByEmployeeId,
  lockStatusById,
  findAll,
  count,
  update,
  transitionStatus,
  findDueForSeparation,
};
