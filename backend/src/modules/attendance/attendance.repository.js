import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.attendanceRecord.create({ data });
};

const findById = (id, client = prisma) => {
  return client.attendanceRecord.findUnique({ where: { id } });
};

// Exact DateTime equality - callers always pass an already date-truncated
// value (see attendance.service.js's toDateOnly), the same convention
// holiday.repository.js's findByCalendarAndDate relies on.
const findByEmployeeAndDate = (employeeId, date, client = prisma) => {
  return client.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId, date } },
  });
};

const findAll = ({ where = {}, orderBy, skip, take }) => {
  return prisma.attendanceRecord.findMany({ where, orderBy, skip, take });
};

const count = (where = {}) => {
  return prisma.attendanceRecord.count({ where });
};

const update = (id, data, client = prisma) => {
  return client.attendanceRecord.update({ where: { id }, data });
};

const remove = (id, client = prisma) => {
  return client.attendanceRecord.delete({ where: { id } });
};

export default {
  create,
  findById,
  findByEmployeeAndDate,
  findAll,
  count,
  update,
  remove,
};
