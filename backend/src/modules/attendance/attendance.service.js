import prisma from '../../config/database.js';
import attendanceRepository from './attendance.repository.js';
import employeeRepository from '../employees/employee.repository.js';
import branchRepository from '../branches/branch.repository.js';
import shiftRepository from '../shifts/shift.repository.js';
import shiftService from '../shifts/shift.service.js';
import holidayCalendarService from '../holidayCalendars/holidayCalendar.service.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import NotFoundError from '../../errors/NotFoundError.js';
import ConflictError from '../../errors/ConflictError.js';
import ForbiddenError from '../../errors/ForbiddenError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const READ_ANY_PERMISSION = 'attendance:read:any';

// Date.getUTCDay(): 0 = Sunday ... 6 = Saturday, mirrored 1:1 against the
// Prisma Weekday enum's labels so Shift.workingDays can be checked directly.
const WEEKDAY_NAMES = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

// Truncates to a calendar day (UTC midnight) - enforces ADR-AT02's "one
// record per (employeeId, date)" regardless of what time of day a request
// arrives or what time-of-day component an ISO input string carried.
const toDateOnly = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const formatUTCHHmm = (date) => {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

// Resolves "my own Employee record" from the caller's User id - the same
// lookup employee.service.js's createEmployee uses to detect an existing
// link, reused here since self-check-in/check-out has no :id in the URL to
// resolve ownership from.
const resolveOwnEmployee = async (userId) => {
  const employee = await employeeRepository.findByUserId(userId);

  if (!employee) {
    throw new BadRequestError('No employee record linked to this account');
  }

  return employee;
};

const checkIn = async (actor) => {
  const employee = await resolveOwnEmployee(actor.id);
  const date = toDateOnly(new Date());
  const existing = await attendanceRepository.findByEmployeeAndDate(employee.id, date);

  if (existing?.checkIn) {
    throw new ConflictError('Already checked in for today');
  }

  return prisma.$transaction(async (tx) => {
    const record = existing
      ? await attendanceRepository.update(existing.id, { checkIn: new Date() }, tx)
      : await attendanceRepository.create(
          { employeeId: employee.id, date, checkIn: new Date() },
          tx,
        );

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: existing ? AUDIT_ACTIONS.UPDATE : AUDIT_ACTIONS.CREATE,
        entityType: AUDIT_ENTITY_TYPES.ATTENDANCE_RECORD,
        entityId: record.id,
        beforeData: existing ? normalizeForAudit(existing) : null,
        afterData: normalizeForAudit(record),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return record;
  });
};

const checkOut = async (actor) => {
  const employee = await resolveOwnEmployee(actor.id);
  const date = toDateOnly(new Date());
  const existing = await attendanceRepository.findByEmployeeAndDate(employee.id, date);

  if (!existing?.checkIn) {
    throw new BadRequestError('Cannot check out before checking in today');
  }

  if (existing.checkOut) {
    throw new ConflictError('Already checked out for today');
  }

  return prisma.$transaction(async (tx) => {
    const record = await attendanceRepository.update(existing.id, { checkOut: new Date() }, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.ATTENDANCE_RECORD,
        entityId: record.id,
        beforeData: normalizeForAudit(existing),
        afterData: normalizeForAudit(record),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return record;
  });
};

const createAttendanceRecord = async (data, actor) => {
  const employee = await employeeRepository.findById(data.employeeId);

  if (!employee) {
    throw new BadRequestError('employeeId: references a record that does not exist');
  }

  const date = toDateOnly(data.date);

  try {
    return await prisma.$transaction(async (tx) => {
      const record = await attendanceRepository.create({ ...data, date }, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.ATTENDANCE_RECORD,
          entityId: record.id,
          beforeData: null,
          afterData: normalizeForAudit(record),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return record;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError('An attendance record already exists for this employee and date');
    }

    throw error;
  }
};

const assertOwnershipOrAny = async (record, requester) => {
  if (requester.grantedPermissions.includes(READ_ANY_PERMISSION)) {
    return;
  }

  const ownEmployee = await employeeRepository.findByUserId(requester.id);

  if (!ownEmployee || ownEmployee.id !== record.employeeId) {
    throw new ForbiddenError('You do not have permission to view this attendance record');
  }
};

const getAttendanceRecordById = async (id, requester) => {
  const record = await attendanceRepository.findById(id);

  if (!record) {
    throw new NotFoundError('Attendance record not found');
  }

  await assertOwnershipOrAny(record, requester);

  return record;
};

const buildAttendanceWhere = ({ employeeId, dateFrom, dateTo }) => {
  const where = {};

  if (employeeId) {
    where.employeeId = employeeId;
  }

  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = toDateOnly(dateFrom);
    if (dateTo) where.date.lte = toDateOnly(dateTo);
  }

  return where;
};

// list is :any-only at the route level (no auto-scoped :own listing) -
// mirrors GET /employees's existing shape rather than inventing a new one.
const listAttendanceRecords = async (query) => {
  const { page, limit, sortBy, order, ...filters } = query;
  const where = buildAttendanceWhere(filters);

  const [records, total] = await Promise.all([
    attendanceRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    attendanceRepository.count(where),
  ]);

  return {
    records,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const updateAttendanceRecord = async (id, data, actor) => {
  const record = await attendanceRepository.findById(id);

  if (!record) {
    throw new NotFoundError('Attendance record not found');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await attendanceRepository.update(id, data, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.ATTENDANCE_RECORD,
        entityId: id,
        beforeData: normalizeForAudit(record),
        afterData: normalizeForAudit(updated),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return updated;
  });
};

// No reference-count check, unlike Branch/Department/Designation/Shift's
// delete - nothing holds a FK onto AttendanceRecord (docs/domain-attendance.md
// §2). Rare and audit-logged, not a routine lifecycle step.
const deleteAttendanceRecord = async (id, actor) => {
  const record = await attendanceRepository.findById(id);

  if (!record) {
    throw new NotFoundError('Attendance record not found');
  }

  await prisma.$transaction(async (tx) => {
    await attendanceRepository.remove(id, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.ATTENDANCE_RECORD,
        entityId: id,
        beforeData: normalizeForAudit(record),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });
};

// The "Attendance Calculation Service" domain-attendance.md §3/§5 names -
// the one place that reads Shift + Holiday Calendar + raw AttendanceRecord
// to produce an effective daily status. Computed on every call, never
// persisted (ADR-AT03). Does NOT yet resolve "On Leave" - the Leave domain
// this would require doesn't exist yet; that branch is a named future
// extension point, not a silent gap (docs/domain-attendance.md §12).
const getEffectiveStatus = async (employeeIdInput, dateInput, requester) => {
  let employeeId = employeeIdInput;

  if (!employeeId) {
    const ownEmployee = await resolveOwnEmployee(requester.id);
    employeeId = ownEmployee.id;
  } else if (!requester.grantedPermissions.includes(READ_ANY_PERMISSION)) {
    const ownEmployee = await employeeRepository.findByUserId(requester.id);

    if (!ownEmployee || ownEmployee.id !== employeeId) {
      throw new ForbiddenError('You do not have permission to view this attendance record');
    }
  }

  const employee = await employeeRepository.findById(employeeId);

  if (!employee) {
    throw new NotFoundError('Employee not found');
  }

  const date = toDateOnly(dateInput);

  if (employee.branchId) {
    const branch = await branchRepository.findById(employee.branchId);

    if (branch?.holidayCalendarId) {
      const isHoliday = await holidayCalendarService.isDateHolidayInCalendar(
        branch.holidayCalendarId,
        date,
      );

      if (isHoliday) {
        return { employeeId, date, status: 'HOLIDAY', record: null };
      }
    }
  }

  let shift = null;

  if (employee.shiftId) {
    shift = await shiftRepository.findById(employee.shiftId);
    const weekday = WEEKDAY_NAMES[date.getUTCDay()];

    if (shift && !shift.workingDays.includes(weekday)) {
      return { employeeId, date, status: 'WEEK_OFF', record: null };
    }
  }

  const record = await attendanceRepository.findByEmployeeAndDate(employeeId, date);

  if (!record) {
    return { employeeId, date, status: 'ABSENT', record: null };
  }

  if (record.isHalfDay) {
    return { employeeId, date, status: 'HALF_DAY', record };
  }

  if (!record.checkIn) {
    return { employeeId, date, status: 'ABSENT', record };
  }

  // Lateness is only computed for non-overnight shifts - a documented
  // limitation (see docs/domain-shift.md's own ADR-SH03 risk row), not an
  // oversight. Comparing a real check-in timestamp's HH:mm against an
  // overnight shift's startTime string is ambiguous once the calendar day
  // rolls over, and no verified requirement forces solving that now.
  if (shift && !shiftService.isOvernightShift(shift)) {
    const checkInHHmm = formatUTCHHmm(record.checkIn);

    if (checkInHHmm > shift.startTime) {
      return { employeeId, date, status: 'LATE', record };
    }
  }

  return { employeeId, date, status: 'PRESENT', record };
};

export default {
  checkIn,
  checkOut,
  createAttendanceRecord,
  getAttendanceRecordById,
  listAttendanceRecords,
  updateAttendanceRecord,
  deleteAttendanceRecord,
  getEffectiveStatus,
};
