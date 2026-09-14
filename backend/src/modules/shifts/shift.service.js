import prisma from '../../config/database.js';
import shiftRepository from './shift.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import ConflictError from '../../errors/ConflictError.js';
import NotFoundError from '../../errors/NotFoundError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const DUPLICATE_SHIFT_MESSAGE = 'A shift with this name already exists';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

const createShift = async (data, actor) => {
  const existing = await shiftRepository.findByName(data.name);

  if (existing) {
    throw new ConflictError(DUPLICATE_SHIFT_MESSAGE);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const shift = await shiftRepository.create(data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.SHIFT,
          entityId: shift.id,
          beforeData: null,
          afterData: normalizeForAudit(shift),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return shift;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_SHIFT_MESSAGE);
    }

    throw error;
  }
};

const getShiftById = async (id) => {
  const shift = await shiftRepository.findById(id);

  if (!shift) {
    throw new NotFoundError('Shift not found');
  }

  return shift;
};

const buildShiftWhere = ({ search, status }) => {
  const where = {};

  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  if (status) {
    where.status = status;
  }

  return where;
};

const listShifts = async (query) => {
  const { page, limit, sortBy, order, ...filters } = query;
  const where = buildShiftWhere(filters);

  const [shifts, total] = await Promise.all([
    shiftRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    shiftRepository.count(where),
  ]);

  return {
    shifts,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const updateShift = async (id, data, actor) => {
  const shift = await shiftRepository.findById(id);

  if (!shift) {
    throw new NotFoundError('Shift not found');
  }

  if (data.name) {
    const existing = await shiftRepository.findByName(data.name);

    if (existing && existing.id !== id) {
      throw new ConflictError(DUPLICATE_SHIFT_MESSAGE);
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await shiftRepository.update(id, data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.UPDATE,
          entityType: AUDIT_ENTITY_TYPES.SHIFT,
          entityId: id,
          beforeData: normalizeForAudit(shift),
          afterData: normalizeForAudit(updated),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return updated;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_SHIFT_MESSAGE);
    }

    throw error;
  }
};

const deleteShift = async (id, actor) => {
  const shift = await shiftRepository.findById(id);

  if (!shift) {
    throw new NotFoundError('Shift not found');
  }

  const referenceCount = await shiftRepository.countEmployeesForShift(id);

  if (referenceCount > 0) {
    throw new ConflictError(
      'This shift has Employee records referencing it and cannot be deleted - deactivate it instead',
    );
  }

  await prisma.$transaction(async (tx) => {
    await shiftRepository.remove(id, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.SHIFT,
        entityId: id,
        beforeData: normalizeForAudit(shift),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });
};

// Consumed by employee.service.js - the synchronous cross-domain read
// pattern established by ADR-B06/ADR-D06/ADR-DS-equivalent, now extended to
// Shift. Enforces the positive allowlist rule from domain-shift.md §4:
// assignable means status === ACTIVE, never the inverse. Unlike
// departmentId/designationId's callers, shiftId is optional on Employee, so
// callers only invoke this when a shiftId is actually present.
const assertShiftAssignable = async (shiftId) => {
  const shift = await shiftRepository.findById(shiftId);

  if (!shift) {
    throw new BadRequestError('shiftId: references a record that does not exist');
  }

  if (shift.status !== 'ACTIVE') {
    throw new BadRequestError('shiftId: this shift is not active and cannot be assigned');
  }
};

// The single reusable primitive ADR-SH03 asks be "encoded once, here,
// rather than reimplemented ad hoc inside Attendance" - a pure string
// comparison, safe because startTime/endTime are always validated "HH:mm"
// (zero-padded, so lexicographic and chronological order agree). Deliberately
// just this primitive, not a full day-attribution resolver: no consumer
// (Attendance) exists yet, mirroring how Holiday Calendar's ADR-HC04 scoped
// itself to isDateHolidayInCalendar only.
const isOvernightShift = (shift) => shift.endTime < shift.startTime;

export default {
  createShift,
  getShiftById,
  listShifts,
  updateShift,
  deleteShift,
  assertShiftAssignable,
  isOvernightShift,
};
