import prisma from '../../config/database.js';
import payrollRunRepository from './payrollRun.repository.js';
import payslipRepository from './payslip.repository.js';
import employeeRepository from '../employees/employee.repository.js';
import attendanceService from '../attendance/attendance.service.js';
import leaveService from '../leave/leave.service.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import NotFoundError from '../../errors/NotFoundError.js';
import ConflictError from '../../errors/ConflictError.js';
import ForbiddenError from '../../errors/ForbiddenError.js';

const PAYSLIP_READ_ANY_PERMISSION = 'payslip:read:any';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

const round2 = (value) => Math.round(value * 100) / 100;

// A synthetic requester passed to attendanceService.getEffectiveStatus -
// Payroll always names an explicit employeeId, so the only branch of that
// function's own auth logic that matters here is "does the caller hold
// attendance:read:any" (skips the ownership lookup entirely). This is an
// internal, trusted service-to-service call gated by this module's own
// payrollRun:process permission, not a user-facing delegation of
// Attendance's access control.
const asAttendanceReader = (actor) => ({
  id: actor.id,
  grantedPermissions: ['attendance:read:any'],
});

const daysInMonth = (periodYear, periodMonth) =>
  new Date(Date.UTC(periodYear, periodMonth, 0)).getUTCDate();

// The core calculation (docs/domain-payroll.md §5): reuses Attendance's own
// coordinating service directly for each calendar day, rather than
// re-deriving Shift/Holiday-Calendar resolution a third time - Payroll is
// the third consumer of that read chain, this time via Attendance's own
// getEffectiveStatus() rather than the lower-level HC04 primitive.
// HOLIDAY/WEEK_OFF: excluded from the working-day denominator entirely.
// PRESENT/LATE: paid (no lateness-pay deduction rule exists anywhere in
// this project - inventing one would repeat the mistake Leave's own
// sign-off avoided with employment-type entitlement adjustment).
// HALF_DAY: half paid, half unpaid. ABSENT: fully unpaid.
// ON_LEAVE: paid or unpaid per that request's LeaveType.isPaid (ADR-LV09).
const summarizeAttendanceForPeriod = async (employee, periodMonth, periodYear, actor) => {
  const reader = asAttendanceReader(actor);
  const totalDays = daysInMonth(periodYear, periodMonth);

  let workingDays = 0;
  let paidDays = 0;
  let unpaidDays = 0;

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(Date.UTC(periodYear, periodMonth - 1, day));
    const { status } = await attendanceService.getEffectiveStatus(employee.id, date, reader);

    if (status === 'HOLIDAY' || status === 'WEEK_OFF') {
      continue;
    }

    workingDays += 1;

    if (status === 'HALF_DAY') {
      paidDays += 0.5;
      unpaidDays += 0.5;
    } else if (status === 'ABSENT') {
      unpaidDays += 1;
    } else if (status === 'ON_LEAVE') {
      // A second lookup of the same approved-leave row getEffectiveStatus
      // already resolved internally - accepted duplication rather than
      // changing that function's return shape, which every other
      // Attendance consumer/test already depends on.
      const approvedLeave = await leaveService.hasApprovedLeaveOnDate(employee.id, date);

      if (approvedLeave?.leaveType?.isPaid === false) {
        unpaidDays += 1;
      } else {
        paidDays += 1;
      }
    } else {
      paidDays += 1;
    }
  }

  return { workingDays, paidDays, unpaidDays };
};

// No overtime line item: AttendanceRecord has no overtime field or verified
// overtime-rate concept anywhere in this project (only checkIn/checkOut
// timestamps exist) - not something this domain invents despite
// docs/domain-payroll.md §3's passing mention of "overtime".
const buildPayslipForEmployee = async (employee, payrollRunId, periodMonth, periodYear, actor) => {
  const { workingDays, paidDays, unpaidDays } = await summarizeAttendanceForPeriod(
    employee,
    periodMonth,
    periodYear,
    actor,
  );

  const baseSalary = employee.salary.toNumber();
  const perDayRate = workingDays > 0 ? baseSalary / workingDays : 0;
  const deduction = round2(perDayRate * unpaidDays);
  const netPay = round2(baseSalary - deduction);

  const lineItems = [{ type: 'EARNING', label: 'Base Salary', amount: baseSalary }];

  if (deduction > 0) {
    const dayLabel = unpaidDays === 1 ? 'day' : 'days';
    lineItems.push({
      type: 'DEDUCTION',
      label: `Unpaid Absence (${unpaidDays} ${dayLabel})`,
      amount: deduction,
    });
  }

  const payslipData = {
    payrollRunId,
    employeeId: employee.id,
    periodMonth,
    periodYear,
    employeeName: employee.user?.name ?? null,
    departmentName: employee.department.name,
    designationName: employee.designation.name,
    branchName: employee.branch?.name ?? null,
    employmentType: employee.employmentType,
    baseSalary,
    workingDaysInPeriod: workingDays,
    paidDays,
    unpaidDays,
    grossPay: baseSalary,
    totalDeductions: deduction,
    netPay,
  };

  return { payslipData, lineItems };
};

const DUPLICATE_PERIOD_MESSAGE = 'A payroll run already exists for this period';

const createPayrollRun = async (data, actor) => {
  const existing = await payrollRunRepository.findByPeriod(data.periodMonth, data.periodYear);

  if (existing) {
    throw new ConflictError(DUPLICATE_PERIOD_MESSAGE);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const run = await payrollRunRepository.create(data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.PAYROLL_RUN,
          entityId: run.id,
          beforeData: null,
          afterData: normalizeForAudit(run),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return run;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_PERIOD_MESSAGE);
    }

    throw error;
  }
};

const getPayrollRunById = async (id) => {
  const run = await payrollRunRepository.findById(id);

  if (!run) {
    throw new NotFoundError('Payroll run not found');
  }

  const payslipCount = await payrollRunRepository.countPayslips(id);

  return { ...run, payslipCount };
};

const buildPayrollRunWhere = ({ status, periodYear }) => {
  const where = {};

  if (status) where.status = status;
  if (periodYear) where.periodYear = periodYear;

  return where;
};

const listPayrollRuns = async (query) => {
  const { page, limit, sortBy, order, ...filters } = query;
  const where = buildPayrollRunWhere(filters);

  const [runs, total] = await Promise.all([
    payrollRunRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    payrollRunRepository.count(where),
  ]);

  return {
    runs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// "Processing" a run generates every active Employee's Payslip in the same
// step (docs/domain-payroll.md §2's own wording), then flips DRAFT ->
// PROCESSING. The slow, cross-domain-read part (one attendanceService call
// per employee per calendar day) deliberately runs BEFORE the database
// transaction opens - only the actual writes (run status, Payslips, line
// items, audit logs) are transactional. Computing all of that inside one
// long-held $transaction risked exceeding Prisma's interactive-transaction
// timeout for any realistic employee count, which would have been a real
// bug, not just a performance nicety.
const processPayrollRun = async (id, actor) => {
  const run = await payrollRunRepository.findById(id);

  if (!run) {
    throw new NotFoundError('Payroll run not found');
  }

  if (run.status !== 'DRAFT') {
    throw new ConflictError('Only a DRAFT payroll run can be processed');
  }

  const employees = await employeeRepository.findAllActiveWithOrgContext();

  // Employees are snapshotted once, then processed one at a time via
  // several slow, awaited cross-domain reads each - a real window in which
  // an employee could be offboarded (soft-deleted) between the snapshot
  // and their own turn. Skipping a since-deleted employee rather than
  // failing the entire run is the correct behavior for that race, not a
  // workaround for anything else.
  const built = [];

  for (const employee of employees) {
    try {
      built.push(
        await buildPayslipForEmployee(employee, run.id, run.periodMonth, run.periodYear, actor),
      );
    } catch (error) {
      if (!(error instanceof NotFoundError)) {
        throw error;
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    const updatedRun = await payrollRunRepository.update(id, { status: 'PROCESSING' }, tx);

    for (const { payslipData, lineItems } of built) {
      const payslip = await payslipRepository.create(payslipData, tx);

      await payslipRepository.createLineItems(
        lineItems.map((item) => ({ ...item, payslipId: payslip.id })),
        tx,
      );

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.PAYSLIP,
          entityId: payslip.id,
          beforeData: null,
          afterData: normalizeForAudit(payslip),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );
    }

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.PAYROLL_RUN,
        entityId: id,
        beforeData: normalizeForAudit(run),
        afterData: normalizeForAudit(updatedRun),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return updatedRun;
  });
};

const finalizePayrollRun = async (id, actor) => {
  const run = await payrollRunRepository.findById(id);

  if (!run) {
    throw new NotFoundError('Payroll run not found');
  }

  if (run.status !== 'PROCESSING') {
    throw new ConflictError('Only a PROCESSING payroll run can be finalized');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await payrollRunRepository.update(id, { status: 'FINALIZED' }, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.PAYROLL_RUN,
        entityId: id,
        beforeData: normalizeForAudit(run),
        afterData: normalizeForAudit(updated),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return updated;
  });
};

// A pure status transition, not a recalculation (docs/domain-payroll.md §2).
const markPayrollRunPaid = async (id, actor) => {
  const run = await payrollRunRepository.findById(id);

  if (!run) {
    throw new NotFoundError('Payroll run not found');
  }

  if (run.status !== 'FINALIZED') {
    throw new ConflictError('Only a FINALIZED payroll run can be marked as paid');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await payrollRunRepository.update(id, { status: 'PAID' }, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.PAYROLL_RUN,
        entityId: id,
        beforeData: normalizeForAudit(run),
        afterData: normalizeForAudit(updated),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return updated;
  });
};

// Only a DRAFT run can be deleted - by construction it has zero Payslips
// (they are only ever created by processPayrollRun), so there is nothing
// financial to protect yet. Mirrors every prior master-data domain's
// "never destroy a referenced/immutable record" invariant, just expressed
// through the lifecycle status instead of a reference count.
const deletePayrollRun = async (id, actor) => {
  const run = await payrollRunRepository.findById(id);

  if (!run) {
    throw new NotFoundError('Payroll run not found');
  }

  if (run.status !== 'DRAFT') {
    throw new ConflictError('Only a DRAFT payroll run can be deleted');
  }

  await prisma.$transaction(async (tx) => {
    await payrollRunRepository.remove(id, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.PAYROLL_RUN,
        entityId: id,
        beforeData: normalizeForAudit(run),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });
};

const assertOwnershipOrAny = async (employeeId, requester) => {
  if (requester.grantedPermissions.includes(PAYSLIP_READ_ANY_PERMISSION)) {
    return;
  }

  const ownEmployee = await employeeRepository.findByUserId(requester.id);

  if (!ownEmployee || ownEmployee.id !== employeeId) {
    throw new ForbiddenError('You do not have permission to view this payslip');
  }
};

const getPayslipById = async (id, requester) => {
  const payslip = await payslipRepository.findById(id);

  if (!payslip) {
    throw new NotFoundError('Payslip not found');
  }

  await assertOwnershipOrAny(payslip.employeeId, requester);

  return payslip;
};

const buildPayslipWhere = ({ employeeId, payrollRunId }) => {
  const where = {};

  if (employeeId) where.employeeId = employeeId;
  if (payrollRunId) where.payrollRunId = payrollRunId;

  return where;
};

// Same auto-scoping shape as Leave's list endpoints: a caller without
// payslip:read:any sees only their own Payslips rather than being refused
// list access outright - viewing one's own pay history is a core
// self-service need (docs/domain-payroll.md §2: "who consumes: the
// employee").
const listPayslips = async (query, requester) => {
  const { page, limit, sortBy, order, ...filters } = query;

  if (!requester.grantedPermissions.includes(PAYSLIP_READ_ANY_PERMISSION)) {
    const ownEmployee = await employeeRepository.findByUserId(requester.id);

    if (!ownEmployee) {
      return { payslips: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }

    filters.employeeId = ownEmployee.id;
  }

  const where = buildPayslipWhere(filters);

  const [payslips, total] = await Promise.all([
    payslipRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    payslipRepository.count(where),
  ]);

  return {
    payslips,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export default {
  createPayrollRun,
  getPayrollRunById,
  listPayrollRuns,
  processPayrollRun,
  finalizePayrollRun,
  markPayrollRunPaid,
  deletePayrollRun,
  getPayslipById,
  listPayslips,
};
