import prisma from '../../config/database.js';
import leaveRequestRepository from './leaveRequest.repository.js';
import leaveBalanceRepository from './leaveBalance.repository.js';
import leaveTypeRepository from '../leaveTypes/leaveType.repository.js';
import leaveTypeService from '../leaveTypes/leaveType.service.js';
import employeeRepository from '../employees/employee.repository.js';
import branchRepository from '../branches/branch.repository.js';
import shiftRepository from '../shifts/shift.repository.js';
import holidayCalendarService from '../holidayCalendars/holidayCalendar.service.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import NotFoundError from '../../errors/NotFoundError.js';
import ConflictError from '../../errors/ConflictError.js';
import ForbiddenError from '../../errors/ForbiddenError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const READ_ANY_PERMISSION = 'leaveRequest:read:any';
const BALANCE_READ_ANY_PERMISSION = 'leaveBalance:read:any';
const DECIDE_ANY_PERMISSION = 'leaveRequest:decide:any';
const DECIDE_REPORTS_PERMISSION = 'leaveRequest:decide:reports';
const CANCEL_ANY_PERMISSION = 'leaveRequest:cancel:any';

const WEEKDAY_NAMES = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

// Truncates to a calendar day (UTC midnight) - same convention as
// attendance.service.js's toDateOnly, applied here to startDate/endDate/
// year-boundary arithmetic for the identical reason (date-only comparisons
// must ignore whatever time-of-day component an input string carried).
const toDateOnly = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

const resolveOwnEmployee = async (userId) => {
  const employee = await employeeRepository.findByUserId(userId);

  if (!employee) {
    throw new BadRequestError('No employee record linked to this account');
  }

  return employee;
};

// ADR-LV04: reuses Holiday Calendar's isDateHolidayInCalendar (the same
// primitive attendance.service.js consumes) plus Shift's workingDays -
// Leave is the second consumer of both, exactly as those domains'
// sign-offs anticipated. Branch/Shift are looked up once, outside the
// per-day loop, since they don't vary by date within one request.
const computeLeaveDuration = async (employee, startDate, endDate) => {
  let holidayCalendarId = null;

  if (employee.branchId) {
    const branch = await branchRepository.findById(employee.branchId);
    holidayCalendarId = branch?.holidayCalendarId ?? null;
  }

  let shift = null;

  if (employee.shiftId) {
    shift = await shiftRepository.findById(employee.shiftId);
  }

  let count = 0;

  for (let cursor = new Date(startDate); cursor <= endDate; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const current = new Date(cursor);

    if (holidayCalendarId) {
      const isHoliday = await holidayCalendarService.isDateHolidayInCalendar(
        holidayCalendarId,
        current,
      );
      if (isHoliday) continue;
    }

    if (shift) {
      const weekday = WEEKDAY_NAMES[current.getUTCDay()];
      if (!shift.workingDays.includes(weekday)) continue;
    }

    count += 1;
  }

  return count;
};

// Hire-year proration (docs/domain-leave.md §4's own recommendation, made
// concrete): full defaultAnnualEntitlement every year after the hire year,
// zero before it, and a day-based fraction of it during the hire year
// itself. No employment-type-based adjustment - the domain doc explicitly
// flags that formula as unverified and warns against hard-coding it
// (§3), so only the hire-date leg of its recommendation is implemented.
const computeEntitlement = (employee, leaveType, year) => {
  const hireDate = toDateOnly(employee.dateOfJoining);
  const hireYear = hireDate.getUTCFullYear();

  if (year < hireYear) {
    return 0;
  }

  if (year > hireYear) {
    return leaveType.defaultAnnualEntitlement;
  }

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const msPerDay = 24 * 60 * 60 * 1000;
  const totalDaysInYear = Math.round((yearEnd - yearStart) / msPerDay) + 1;
  const daysRemaining = Math.round((yearEnd - hireDate) / msPerDay) + 1;

  return Math.round(((leaveType.defaultAnnualEntitlement * daysRemaining) / totalDaysInYear) * 100) / 100;
};

// Computed lazily, on first need, rather than by a scheduled annual grant
// job - this project has no scheduler/cron infrastructure yet, so this is
// the pragmatic implementation of §4's "annual lump sum" recommendation
// without introducing new cross-cutting infrastructure for one domain.
const getOrCreateLeaveBalance = async (employee, leaveTypeId, year, actor) => {
  const existing = await leaveBalanceRepository.findByKey(employee.id, leaveTypeId, year);

  if (existing) {
    return existing;
  }

  const leaveType = await leaveTypeRepository.findById(leaveTypeId);

  if (!leaveType) {
    throw new NotFoundError('Leave type not found');
  }

  const entitlement = computeEntitlement(employee, leaveType, year);

  return prisma.$transaction(async (tx) => {
    const balance = await leaveBalanceRepository.create(
      { employeeId: employee.id, leaveTypeId, year, entitlement, consumed: 0 },
      tx,
    );

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: AUDIT_ENTITY_TYPES.LEAVE_BALANCE,
        entityId: balance.id,
        beforeData: null,
        afterData: normalizeForAudit(balance),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return balance;
  });
};

// The date-range overlap invariant (§4) - checked in the service layer,
// not a DB exclusion constraint (see schema.prisma's LeaveRequest comment).
const hasOverlap = (existingRequests, startDate, endDate) =>
  existingRequests.some((request) => !(endDate < request.startDate || startDate > request.endDate));

const createLeaveRequest = async (data, actor) => {
  const employee = await resolveOwnEmployee(actor.id);
  await leaveTypeService.assertLeaveTypeAssignable(data.leaveTypeId);

  const startDate = toDateOnly(data.startDate);
  const endDate = toDateOnly(data.endDate);

  const activeRequests = await leaveRequestRepository.findActiveByEmployee(employee.id);

  if (hasOverlap(activeRequests, startDate, endDate)) {
    throw new ConflictError(
      'This employee already has a pending or approved leave request overlapping these dates',
    );
  }

  return prisma.$transaction(async (tx) => {
    const request = await leaveRequestRepository.create(
      {
        employeeId: employee.id,
        leaveTypeId: data.leaveTypeId,
        startDate,
        endDate,
        reason: data.reason,
      },
      tx,
    );

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: AUDIT_ENTITY_TYPES.LEAVE_REQUEST,
        entityId: request.id,
        beforeData: null,
        afterData: normalizeForAudit(request),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return request;
  });
};

// ADMIN (leaveRequest:decide:any) may decide any request unconditionally.
// MANAGER (leaveRequest:decide:reports) may only decide requests from
// their own direct reports (Employee.managerId) - a deliberately narrower
// authority than this app's usual ":any" meaning, so it gets its own
// permission key rather than overloading ":any" for two different actors.
const assertCanDecide = async (request, actor) => {
  if (actor.grantedPermissions.includes(DECIDE_ANY_PERMISSION)) {
    return;
  }

  if (actor.grantedPermissions.includes(DECIDE_REPORTS_PERMISSION)) {
    const managerEmployee = await employeeRepository.findByUserId(actor.id);
    const requestEmployee = await employeeRepository.findById(request.employeeId);

    if (managerEmployee && requestEmployee?.managerId === managerEmployee.id) {
      return;
    }
  }

  throw new ForbiddenError('You do not have permission to decide this leave request');
};

const approveLeaveRequest = async (id, actor) => {
  const request = await leaveRequestRepository.findById(id);

  if (!request) {
    throw new NotFoundError('Leave request not found');
  }

  if (request.status !== 'PENDING') {
    throw new ConflictError('Only a pending leave request can be approved');
  }

  await assertCanDecide(request, actor);

  const employee = await employeeRepository.findById(request.employeeId);
  const duration = await computeLeaveDuration(employee, request.startDate, request.endDate);
  const year = request.startDate.getUTCFullYear();
  const balance = await getOrCreateLeaveBalance(employee, request.leaveTypeId, year, actor);

  const remaining = balance.entitlement.toNumber() - balance.consumed.toNumber();

  if (duration > remaining) {
    throw new ConflictError(
      `Insufficient leave balance: ${duration} day(s) requested, ${remaining} remaining`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const updatedBalance = await leaveBalanceRepository.update(
      balance.id,
      { consumed: balance.consumed.toNumber() + duration },
      tx,
    );
    const updatedRequest = await leaveRequestRepository.update(
      id,
      { status: 'APPROVED', durationDays: duration },
      tx,
    );

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.LEAVE_REQUEST,
        entityId: id,
        beforeData: normalizeForAudit(request),
        afterData: normalizeForAudit(updatedRequest),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.LEAVE_BALANCE,
        entityId: balance.id,
        beforeData: normalizeForAudit(balance),
        afterData: normalizeForAudit(updatedBalance),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return updatedRequest;
  });
};

const rejectLeaveRequest = async (id, data, actor) => {
  const request = await leaveRequestRepository.findById(id);

  if (!request) {
    throw new NotFoundError('Leave request not found');
  }

  if (request.status !== 'PENDING') {
    throw new ConflictError('Only a pending leave request can be rejected');
  }

  await assertCanDecide(request, actor);

  return prisma.$transaction(async (tx) => {
    const updated = await leaveRequestRepository.update(id, { status: 'REJECTED' }, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.LEAVE_REQUEST,
        entityId: id,
        beforeData: normalizeForAudit(request),
        afterData: normalizeForAudit({ ...updated, reason: data?.reason ?? updated.reason }),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return updated;
  });
};

const assertCanCancel = async (request, actor) => {
  if (actor.grantedPermissions.includes(CANCEL_ANY_PERMISSION)) {
    return;
  }

  const ownEmployee = await employeeRepository.findByUserId(actor.id);

  if (!ownEmployee || ownEmployee.id !== request.employeeId) {
    throw new ForbiddenError('You do not have permission to cancel this leave request');
  }
};

const cancelLeaveRequest = async (id, actor) => {
  const request = await leaveRequestRepository.findById(id);

  if (!request) {
    throw new NotFoundError('Leave request not found');
  }

  await assertCanCancel(request, actor);

  if (request.status === 'PENDING') {
    return prisma.$transaction(async (tx) => {
      const updated = await leaveRequestRepository.update(id, { status: 'CANCELLED' }, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.UPDATE,
          entityType: AUDIT_ENTITY_TYPES.LEAVE_REQUEST,
          entityId: id,
          beforeData: normalizeForAudit(request),
          afterData: normalizeForAudit(updated),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return updated;
    });
  }

  if (request.status === 'APPROVED') {
    const today = toDateOnly(new Date());

    if (request.startDate <= today) {
      throw new BadRequestError(
        'An approved leave that has already started cannot be cancelled retroactively',
      );
    }

    const year = request.startDate.getUTCFullYear();
    const balance = await leaveBalanceRepository.findByKey(
      request.employeeId,
      request.leaveTypeId,
      year,
    );

    return prisma.$transaction(async (tx) => {
      const updatedRequest = await leaveRequestRepository.update(id, { status: 'CANCELLED' }, tx);

      let updatedBalance = balance;

      if (balance && request.durationDays) {
        updatedBalance = await leaveBalanceRepository.update(
          balance.id,
          { consumed: Math.max(0, balance.consumed.toNumber() - request.durationDays.toNumber()) },
          tx,
        );
      }

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.UPDATE,
          entityType: AUDIT_ENTITY_TYPES.LEAVE_REQUEST,
          entityId: id,
          beforeData: normalizeForAudit(request),
          afterData: normalizeForAudit(updatedRequest),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      if (balance) {
        await auditLogRepository.create(
          {
            actorId: actor.id,
            action: AUDIT_ACTIONS.UPDATE,
            entityType: AUDIT_ENTITY_TYPES.LEAVE_BALANCE,
            entityId: balance.id,
            beforeData: normalizeForAudit(balance),
            afterData: normalizeForAudit(updatedBalance),
            ipAddress: actor.ipAddress ?? null,
          },
          tx,
        );
      }

      return updatedRequest;
    });
  }

  throw new ConflictError('Only a pending or future-dated approved leave request can be cancelled');
};

const assertOwnershipOrAny = async (employeeId, requester, permission) => {
  if (requester.grantedPermissions.includes(permission)) {
    return;
  }

  const ownEmployee = await employeeRepository.findByUserId(requester.id);

  if (!ownEmployee || ownEmployee.id !== employeeId) {
    throw new ForbiddenError('You do not have permission to view this record');
  }
};

const getLeaveRequestById = async (id, requester) => {
  const request = await leaveRequestRepository.findById(id);

  if (!request) {
    throw new NotFoundError('Leave request not found');
  }

  await assertOwnershipOrAny(request.employeeId, requester, READ_ANY_PERMISSION);

  return request;
};

const buildLeaveRequestWhere = ({ employeeId, leaveTypeId, status, dateFrom, dateTo }) => {
  const where = {};

  if (employeeId) where.employeeId = employeeId;
  if (leaveTypeId) where.leaveTypeId = leaveTypeId;
  if (status) where.status = status;

  if (dateFrom || dateTo) {
    where.startDate = {};
    if (dateFrom) where.startDate.gte = toDateOnly(dateFrom);
    if (dateTo) where.startDate.lte = toDateOnly(dateTo);
  }

  return where;
};

// Diverges from Attendance's any-only list precedent: an employee needs to
// see their own leave-request history, a core self-service need rather
// than a nice-to-have, so a caller without :read:any is auto-scoped to
// their own employeeId instead of being refused list access outright.
const listLeaveRequests = async (query, requester) => {
  const { page, limit, sortBy, order, ...filters } = query;

  if (!requester.grantedPermissions.includes(READ_ANY_PERMISSION)) {
    const ownEmployee = await employeeRepository.findByUserId(requester.id);

    if (!ownEmployee) {
      return { requests: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }

    filters.employeeId = ownEmployee.id;
  }

  const where = buildLeaveRequestWhere(filters);

  const [requests, total] = await Promise.all([
    leaveRequestRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    leaveRequestRepository.count(where),
  ]);

  return {
    requests,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getLeaveBalanceById = async (id, requester) => {
  const balance = await leaveBalanceRepository.findById(id);

  if (!balance) {
    throw new NotFoundError('Leave balance not found');
  }

  await assertOwnershipOrAny(balance.employeeId, requester, BALANCE_READ_ANY_PERMISSION);

  return balance;
};

const buildLeaveBalanceWhere = ({ employeeId, leaveTypeId, year }) => {
  const where = {};

  if (employeeId) where.employeeId = employeeId;
  if (leaveTypeId) where.leaveTypeId = leaveTypeId;
  if (year) where.year = year;

  return where;
};

const listLeaveBalances = async (query, requester) => {
  const { page, limit, sortBy, order, ...filters } = query;

  if (!requester.grantedPermissions.includes(BALANCE_READ_ANY_PERMISSION)) {
    const ownEmployee = await employeeRepository.findByUserId(requester.id);

    if (!ownEmployee) {
      return { balances: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }

    filters.employeeId = ownEmployee.id;
  }

  const where = buildLeaveBalanceWhere(filters);

  const [balances, total] = await Promise.all([
    leaveBalanceRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    leaveBalanceRepository.count(where),
  ]);

  return {
    balances,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ADMIN-only manual override (docs/domain-leave.md §10) - the accepted
// escape hatch for the strict no-negative-balance default (ADR-LV05).
const adjustLeaveBalance = async (id, data, actor) => {
  const balance = await leaveBalanceRepository.findById(id);

  if (!balance) {
    throw new NotFoundError('Leave balance not found');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await leaveBalanceRepository.update(id, data, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.LEAVE_BALANCE,
        entityId: id,
        beforeData: normalizeForAudit(balance),
        afterData: normalizeForAudit(updated),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return updated;
  });
};

// The query docs/domain-attendance.md §3/§12 names as a requirement for
// Leave to expose - consumed by attendance.service.js's getEffectiveStatus
// to resolve the ON_LEAVE branch. Pure read, never a write into Attendance
// (ADR-AT03, reaffirmed from Leave's own side by ADR-LV's §12 note above).
const hasApprovedLeaveOnDate = async (employeeId, date) => {
  const normalizedDate = toDateOnly(date);
  return leaveRequestRepository.findApprovedCoveringDate(employeeId, normalizedDate);
};

export default {
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
  getLeaveRequestById,
  listLeaveRequests,
  getOrCreateLeaveBalance,
  getLeaveBalanceById,
  listLeaveBalances,
  adjustLeaveBalance,
  hasApprovedLeaveOnDate,
};
