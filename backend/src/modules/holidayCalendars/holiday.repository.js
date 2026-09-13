import prisma from '../../config/database.js';

const create = (data, client = prisma) => {
  return client.holiday.create({ data });
};

const findAllByCalendarId = (holidayCalendarId) => {
  return prisma.holiday.findMany({
    where: { holidayCalendarId },
    orderBy: { date: 'asc' },
  });
};

const findById = (id, holidayCalendarId) => {
  return prisma.holiday.findFirst({ where: { id, holidayCalendarId } });
};

// The one reusable read operation this domain's own architecture (§5) asks
// for: "is date X a holiday for calendar Y." Consumed by
// holidayCalendar.service.js's isDateHolidayInCalendar, in turn intended for
// future Attendance/Leave consumption (ADR-HC04).
const findByCalendarAndDate = (holidayCalendarId, date) => {
  return prisma.holiday.findUnique({
    where: { holidayCalendarId_date: { holidayCalendarId, date } },
  });
};

const update = (id, data, client = prisma) => {
  return client.holiday.update({ where: { id }, data });
};

const remove = (id, client = prisma) => {
  return client.holiday.delete({ where: { id } });
};

export default {
  create,
  findAllByCalendarId,
  findById,
  findByCalendarAndDate,
  update,
  remove,
};
