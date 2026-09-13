import holidayCalendarService from './holidayCalendar.service.js';

const create = async (req, res) => {
  const holidayCalendar = await holidayCalendarService.createHolidayCalendar(req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(201).json({ holidayCalendar });
};

const list = async (req, res) => {
  const { holidayCalendars, pagination } = await holidayCalendarService.listHolidayCalendars(
    req.validatedQuery,
  );
  res.status(200).json({ holidayCalendars, pagination });
};

const getById = async (req, res) => {
  const holidayCalendar = await holidayCalendarService.getHolidayCalendarById(req.params.id);
  res.status(200).json({ holidayCalendar });
};

const update = async (req, res) => {
  const holidayCalendar = await holidayCalendarService.updateHolidayCalendar(
    req.params.id,
    req.body,
    { id: req.user.id, ipAddress: req.ip },
  );
  res.status(200).json({ holidayCalendar });
};

const remove = async (req, res) => {
  await holidayCalendarService.deleteHolidayCalendar(req.params.id, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ message: 'Holiday calendar deleted successfully' });
};

const addHoliday = async (req, res) => {
  const holiday = await holidayCalendarService.addHoliday(req.params.id, req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(201).json({ holiday });
};

const listHolidays = async (req, res) => {
  const holidays = await holidayCalendarService.listHolidays(req.params.id);
  res.status(200).json({ holidays });
};

const updateHoliday = async (req, res) => {
  const holiday = await holidayCalendarService.updateHoliday(
    req.params.id,
    req.params.holidayId,
    req.body,
    { id: req.user.id, ipAddress: req.ip },
  );
  res.status(200).json({ holiday });
};

const removeHoliday = async (req, res) => {
  await holidayCalendarService.removeHoliday(req.params.id, req.params.holidayId, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ message: 'Holiday deleted successfully' });
};

export default {
  create,
  list,
  getById,
  update,
  remove,
  addHoliday,
  listHolidays,
  updateHoliday,
  removeHoliday,
};
