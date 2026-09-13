import prisma from '../../config/database.js';
import holidayCalendarRepository from './holidayCalendar.repository.js';
import holidayRepository from './holiday.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import ConflictError from '../../errors/ConflictError.js';
import NotFoundError from '../../errors/NotFoundError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const DUPLICATE_CALENDAR_MESSAGE = 'A holiday calendar with this name already exists';
const DUPLICATE_HOLIDAY_MESSAGE = 'A holiday already exists on this date in this calendar';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

const createHolidayCalendar = async (data, actor) => {
  const existing = await holidayCalendarRepository.findByName(data.name);

  if (existing) {
    throw new ConflictError(DUPLICATE_CALENDAR_MESSAGE);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const calendar = await holidayCalendarRepository.create(data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.HOLIDAY_CALENDAR,
          entityId: calendar.id,
          beforeData: null,
          afterData: normalizeForAudit(calendar),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return calendar;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_CALENDAR_MESSAGE);
    }

    throw error;
  }
};

const getHolidayCalendarById = async (id) => {
  const calendar = await holidayCalendarRepository.findById(id);

  if (!calendar) {
    throw new NotFoundError('Holiday calendar not found');
  }

  return calendar;
};

const buildHolidayCalendarWhere = ({ search, status }) => {
  const where = {};

  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  if (status) {
    where.status = status;
  }

  return where;
};

const listHolidayCalendars = async (query) => {
  const { page, limit, sortBy, order, ...filters } = query;
  const where = buildHolidayCalendarWhere(filters);

  const [holidayCalendars, total] = await Promise.all([
    holidayCalendarRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    holidayCalendarRepository.count(where),
  ]);

  return {
    holidayCalendars,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const updateHolidayCalendar = async (id, data, actor) => {
  const calendar = await holidayCalendarRepository.findById(id);

  if (!calendar) {
    throw new NotFoundError('Holiday calendar not found');
  }

  if (data.name) {
    const existing = await holidayCalendarRepository.findByName(data.name);

    if (existing && existing.id !== id) {
      throw new ConflictError(DUPLICATE_CALENDAR_MESSAGE);
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await holidayCalendarRepository.update(id, data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.UPDATE,
          entityType: AUDIT_ENTITY_TYPES.HOLIDAY_CALENDAR,
          entityId: id,
          beforeData: normalizeForAudit(calendar),
          afterData: normalizeForAudit(updated),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return updated;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_CALENDAR_MESSAGE);
    }

    throw error;
  }
};

const deleteHolidayCalendar = async (id, actor) => {
  const calendar = await holidayCalendarRepository.findById(id);

  if (!calendar) {
    throw new NotFoundError('Holiday calendar not found');
  }

  const referenceCount = await holidayCalendarRepository.countBranchesForHolidayCalendar(id);

  if (referenceCount > 0) {
    throw new ConflictError(
      'This holiday calendar has Branch records referencing it and cannot be deleted - deactivate it instead',
    );
  }

  await prisma.$transaction(async (tx) => {
    // Holiday entries cascade at the DB level (onDelete: Cascade) - no
    // explicit deleteMany needed here, but the audit trail for the calendar
    // itself is still recorded the same way every other domain's delete is.
    await holidayCalendarRepository.remove(id, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.HOLIDAY_CALENDAR,
        entityId: id,
        beforeData: normalizeForAudit(calendar),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });
};

// Consumed by branch.service.js - the same synchronous cross-domain read
// shape as every prior assignability check (ADR-B06/D06/DS06's pattern),
// just consumed by Branch this time instead of Employee. Positive allowlist:
// assignable means status === ACTIVE, never the inverse.
const assertHolidayCalendarAssignable = async (holidayCalendarId) => {
  const calendar = await holidayCalendarRepository.findById(holidayCalendarId);

  if (!calendar) {
    throw new BadRequestError('holidayCalendarId: references a record that does not exist');
  }

  if (calendar.status !== 'ACTIVE') {
    throw new BadRequestError(
      'holidayCalendarId: this holiday calendar is not active and cannot be assigned',
    );
  }
};

const addHoliday = async (holidayCalendarId, data, actor) => {
  const calendar = await holidayCalendarRepository.findById(holidayCalendarId);

  if (!calendar) {
    throw new NotFoundError('Holiday calendar not found');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const holiday = await holidayRepository.create({ ...data, holidayCalendarId }, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.HOLIDAY,
          entityId: holiday.id,
          beforeData: null,
          afterData: normalizeForAudit(holiday),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return holiday;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_HOLIDAY_MESSAGE);
    }

    throw error;
  }
};

const listHolidays = async (holidayCalendarId) => {
  const calendar = await holidayCalendarRepository.findById(holidayCalendarId);

  if (!calendar) {
    throw new NotFoundError('Holiday calendar not found');
  }

  return holidayRepository.findAllByCalendarId(holidayCalendarId);
};

const updateHoliday = async (holidayCalendarId, holidayId, data, actor) => {
  const calendar = await holidayCalendarRepository.findById(holidayCalendarId);

  if (!calendar) {
    throw new NotFoundError('Holiday calendar not found');
  }

  const holiday = await holidayRepository.findById(holidayId, holidayCalendarId);

  if (!holiday) {
    throw new NotFoundError('Holiday not found');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await holidayRepository.update(holidayId, data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.UPDATE,
          entityType: AUDIT_ENTITY_TYPES.HOLIDAY,
          entityId: holidayId,
          beforeData: normalizeForAudit(holiday),
          afterData: normalizeForAudit(updated),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return updated;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_HOLIDAY_MESSAGE);
    }

    throw error;
  }
};

const removeHoliday = async (holidayCalendarId, holidayId, actor) => {
  const calendar = await holidayCalendarRepository.findById(holidayCalendarId);

  if (!calendar) {
    throw new NotFoundError('Holiday calendar not found');
  }

  const holiday = await holidayRepository.findById(holidayId, holidayCalendarId);

  if (!holiday) {
    throw new NotFoundError('Holiday not found');
  }

  await prisma.$transaction(async (tx) => {
    await holidayRepository.remove(holidayId, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.HOLIDAY,
        entityId: holidayId,
        beforeData: normalizeForAudit(holiday),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });
};

// The one reusable query this domain's own architecture (§5) asks for:
// "is date X a holiday for calendar Y" (ADR-HC04). Deliberately stops here -
// the fuller Employee -> Branch -> HolidayCalendar resolution chain is
// explicitly left to whichever of Attendance/Leave is designed next (§5),
// not built speculatively here with no consumer yet.
const isDateHolidayInCalendar = async (holidayCalendarId, date) => {
  const holiday = await holidayRepository.findByCalendarAndDate(holidayCalendarId, date);
  return holiday !== null;
};

export default {
  createHolidayCalendar,
  getHolidayCalendarById,
  listHolidayCalendars,
  updateHolidayCalendar,
  deleteHolidayCalendar,
  assertHolidayCalendarAssignable,
  addHoliday,
  listHolidays,
  updateHoliday,
  removeHoliday,
  isDateHolidayInCalendar,
};
