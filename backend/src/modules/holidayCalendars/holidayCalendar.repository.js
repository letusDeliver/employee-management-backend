import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.holidayCalendar.create({ data });
};

const findById = (id, client = prisma) => {
  return client.holidayCalendar.findUnique({ where: { id } });
};

// Case-sensitive, no `code` field - unlike Department/Designation, this
// domain's own sign-off never names a case-insensitivity requirement or a
// code field for HolidayCalendar (docs/domain-holiday-calendar.md).
const findByName = (name) => {
  return prisma.holidayCalendar.findFirst({ where: { name } });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.holidayCalendar.findMany({ where, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.holidayCalendar.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.holidayCalendar.update({ where: { id }, data });
};

// Counts every Branch referencing this calendar - the hard-delete guard
// (docs/domain-holiday-calendar.md §4: "can never be hard-deleted while
// referenced by any Branch"). Branch has no soft-delete concept of its own,
// unlike Employee, so there is no deletedAt distinction to make here.
const countBranchesForHolidayCalendar = (holidayCalendarId) => {
  return prisma.branch.count({ where: { holidayCalendarId } });
};

const remove = (id, client = prisma) => {
  return client.holidayCalendar.delete({ where: { id } });
};

export default {
  create,
  findById,
  findByName,
  findAll,
  count,
  update,
  countBranchesForHolidayCalendar,
  remove,
};
