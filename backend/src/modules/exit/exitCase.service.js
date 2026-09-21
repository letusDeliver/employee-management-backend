import prisma from '../../config/database.js';
import exitCaseRepository from './exitCase.repository.js';
import clearanceItemRepository from './clearanceItem.repository.js';
import employeeRepository from '../employees/employee.repository.js';
import employeeService from '../employees/employee.service.js';
import assetAssignmentService from '../assets/assetAssignment.service.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import logger from '../../config/logger.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import NotFoundError from '../../errors/NotFoundError.js';
import ConflictError from '../../errors/ConflictError.js';
import ForbiddenError from '../../errors/ForbiddenError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const CREATE_ANY_PERMISSION = 'exitCase:create:any';
const CREATE_OWN_PERMISSION = 'exitCase:create:own';
const READ_ANY_PERMISSION = 'exitCase:read:any';
const MANAGE_ANY_PERMISSION = 'exitCase:manage:any';
const WITHDRAW_OWN_PERMISSION = 'exitCase:withdraw:own';

const OPEN_CASE_MESSAGE = 'This employee already has an open exit case';
const NOT_INITIATED_FOR_SEPARATION_MESSAGE = 'Only an INITIATED exit case can be separated';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

// lastWorkingDay is a calendar date interpreted in UTC (documented in the
// schema comment) - no time-of-day, no per-branch timezone.
const toUtcDate = (isoDate) => new Date(`${isoDate}T00:00:00.000Z`);

const startOfUtcDay = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const todayUtc = () => startOfUtcDay(new Date());

const formatDate = (date) => date.toISOString().slice(0, 10);

const writeAudit = (tx, actor, action, entityType, entityId, beforeData, afterData) => {
  return auditLogRepository.create(
    {
      actorId: actor.id,
      action,
      entityType,
      entityId,
      beforeData: beforeData ? normalizeForAudit(beforeData) : null,
      afterData: afterData ? normalizeForAudit(afterData) : null,
      ipAddress: actor.ipAddress ?? null,
    },
    tx,
  );
};

// A self-initiating caller (create:own) always initiates their own
// RESIGNATION, resolved from their own linked Employee record - any
// employeeId they supply is ignored, mirroring the "never trust a
// client-supplied identity for a self-service action" precedent
// (Enrollment/Leave). TERMINATION, and initiating for anyone else, requires
// create:any (ADMIN) - the narrowest scope this project's role model can
// express, since no HR role exists (ADR-EM06).
const resolveInitiation = async (data, actor) => {
  if (actor.grantedPermissions.includes(CREATE_ANY_PERMISSION)) {
    if (!data.employeeId) {
      throw new BadRequestError(
        'employeeId: required when initiating an exit case on behalf of an employee',
      );
    }

    return { employeeId: data.employeeId, type: data.type };
  }

  if (actor.grantedPermissions.includes(CREATE_OWN_PERMISSION)) {
    if (data.type !== 'RESIGNATION') {
      throw new ForbiddenError('You do not have permission to initiate a termination');
    }

    const ownEmployee = await employeeRepository.findByUserId(actor.id);

    if (!ownEmployee) {
      throw new BadRequestError('No employee record linked to this account');
    }

    return { employeeId: ownEmployee.id, type: 'RESIGNATION' };
  }

  throw new ForbiddenError('You do not have permission to initiate an exit case');
};

// Every case starts with the same checklist (§3): one ASSET_RETURN item per
// asset the employee currently holds (read from Asset Management's exposed
// query, never re-querying its ledger), plus knowledge transfer, final
// settlement and the system-access item the offboarding primitive resolves.
const buildDefaultItems = (activeAssignments) => [
  ...activeAssignments.map((assignment) => ({
    type: 'ASSET_RETURN',
    title: `Return asset ${assignment.asset.assetTag}`,
    assetId: assignment.assetId,
  })),
  { type: 'KNOWLEDGE_TRANSFER', title: 'Knowledge transfer' },
  { type: 'FINAL_SETTLEMENT', title: 'Final settlement' },
  { type: 'ACCESS_REVOCATION', title: 'System access revocation' },
];

const createExitCase = async (data, actor) => {
  const { employeeId, type } = await resolveInitiation(data, actor);

  const employee = await employeeRepository.findById(employeeId);

  if (!employee) {
    throw new BadRequestError('employeeId: references a record that does not exist');
  }

  const lastWorkingDay = toUtcDate(data.lastWorkingDay);

  if (lastWorkingDay < todayUtc()) {
    throw new BadRequestError(
      'lastWorkingDay: cannot be before the date the exit case is initiated',
    );
  }

  if (await exitCaseRepository.findOpenByEmployeeId(employeeId)) {
    throw new ConflictError(OPEN_CASE_MESSAGE);
  }

  const held = await assetAssignmentService.getActiveAssignmentsForEmployee(employeeId);

  try {
    return await prisma.$transaction(async (tx) => {
      const exitCase = await exitCaseRepository.create(
        {
          employeeId,
          type,
          lastWorkingDay,
          reason: data.reason ?? null,
          initiatedBy: actor.id,
          clearanceItems: { create: buildDefaultItems(held) },
        },
        tx,
      );

      await writeAudit(
        tx,
        actor,
        AUDIT_ACTIONS.CREATE,
        AUDIT_ENTITY_TYPES.EXIT_CASE,
        exitCase.id,
        null,
        exitCase,
      );

      return exitCase;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(OPEN_CASE_MESSAGE);
    }

    throw error;
  }
};

const assertOwnershipOrAny = async (employeeId, requester) => {
  if (requester.grantedPermissions.includes(READ_ANY_PERMISSION)) {
    return;
  }

  const ownEmployee = await employeeRepository.findByUserId(requester.id);

  if (!ownEmployee || ownEmployee.id !== employeeId) {
    throw new ForbiddenError('You do not have permission to view this exit case');
  }
};

const getExitCaseById = async (id, requester) => {
  const exitCase = await exitCaseRepository.findById(id);

  if (!exitCase) {
    throw new NotFoundError('Exit case not found');
  }

  await assertOwnershipOrAny(exitCase.employeeId, requester);

  return exitCase;
};

const buildExitCaseWhere = ({ employeeId, type, status }) => {
  const where = {};

  if (employeeId) where.employeeId = employeeId;
  if (type) where.type = type;
  if (status) where.status = status;

  return where;
};

// A caller without :read:any is auto-scoped to their own employeeId rather
// than refused - the same self-service list pattern Leave/Performance/
// Training/Asset Management established.
const listExitCases = async (query, requester) => {
  const { page, limit, sortBy, order, ...filters } = query;

  if (!requester.grantedPermissions.includes(READ_ANY_PERMISSION)) {
    const ownEmployee = await employeeRepository.findByUserId(requester.id);

    if (!ownEmployee) {
      return { exitCases: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }

    filters.employeeId = ownEmployee.id;
  }

  const where = buildExitCaseWhere(filters);

  const [exitCases, total] = await Promise.all([
    exitCaseRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    exitCaseRepository.count(where),
  ]);

  return {
    exitCases,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const REHIRE_FIELDS = ['eligibleForRehire', 'rehireNote'];

// A WITHDRAWN case is closed. A COMPLETED case is closed too, except for the
// rehire fields (ADR-EM04): a case can auto-complete inside `separate`, or be
// separated by the sweep with no body, and eligibleForRehire would otherwise
// become impossible to record.
const assertEditable = (status, data) => {
  if (status === 'WITHDRAWN') {
    throw new ConflictError('A WITHDRAWN exit case can no longer be edited');
  }

  if (status === 'COMPLETED') {
    const touchesOther = Object.keys(data).some((key) => !REHIRE_FIELDS.includes(key));

    if (touchesOther) {
      throw new ConflictError(
        'A COMPLETED exit case can no longer be edited, except its rehire fields',
      );
    }
  }
};

const updateExitCase = async (id, data, actor) => {
  const exitCase = await exitCaseRepository.findById(id);

  if (!exitCase) {
    throw new NotFoundError('Exit case not found');
  }

  assertEditable(exitCase.status, data);

  const updateData = {};

  if (data.lastWorkingDay !== undefined) {
    if (exitCase.status !== 'INITIATED') {
      throw new ConflictError(
        'lastWorkingDay can only be changed while the exit case is INITIATED',
      );
    }

    const lastWorkingDay = toUtcDate(data.lastWorkingDay);

    if (lastWorkingDay < startOfUtcDay(exitCase.initiatedAt)) {
      throw new BadRequestError(
        'lastWorkingDay: cannot be before the date the exit case was initiated',
      );
    }

    updateData.lastWorkingDay = lastWorkingDay;
  }

  if (data.reason !== undefined) updateData.reason = data.reason;
  if (data.eligibleForRehire !== undefined) updateData.eligibleForRehire = data.eligibleForRehire;
  if (data.rehireNote !== undefined) updateData.rehireNote = data.rehireNote;

  return prisma.$transaction(async (tx) => {
    // Re-validate against the row-locked, current status: a concurrent
    // separation/withdrawal/completion may have landed since the read above.
    const lockedStatus = await exitCaseRepository.lockStatusById(id, tx);

    assertEditable(lockedStatus, data);

    if (data.lastWorkingDay !== undefined && lockedStatus !== 'INITIATED') {
      throw new ConflictError(
        'lastWorkingDay can only be changed while the exit case is INITIATED',
      );
    }

    const updated = await exitCaseRepository.update(id, updateData, tx);

    await writeAudit(
      tx,
      actor,
      AUDIT_ACTIONS.UPDATE,
      AUDIT_ENTITY_TYPES.EXIT_CASE,
      id,
      exitCase,
      updated,
    );

    return updated;
  });
};

// ADMIN (manage:any) may withdraw either type while INITIATED. An employee
// (withdraw:own) may withdraw only their own RESIGNATION, and only before
// the last working day arrives (§2). After separation nothing here applies
// at all - reversal is Identity's existing rehire flow (ADR-EM03).
const withdrawExitCase = async (id, actor) => {
  const exitCase = await exitCaseRepository.findById(id);

  if (!exitCase) {
    throw new NotFoundError('Exit case not found');
  }

  const hasManageAny = actor.grantedPermissions.includes(MANAGE_ANY_PERMISSION);

  if (!hasManageAny) {
    const denied = new ForbiddenError('You do not have permission to withdraw this exit case');

    if (!actor.grantedPermissions.includes(WITHDRAW_OWN_PERMISSION)) {
      throw denied;
    }

    const ownEmployee = await employeeRepository.findByUserId(actor.id);

    if (
      !ownEmployee ||
      ownEmployee.id !== exitCase.employeeId ||
      exitCase.type !== 'RESIGNATION'
    ) {
      throw denied;
    }
  }

  const NOT_WITHDRAWABLE_MESSAGE =
    'Only an INITIATED exit case can be withdrawn - once separated, reversal is a rehire, not a withdrawal';

  if (exitCase.status !== 'INITIATED') {
    throw new ConflictError(NOT_WITHDRAWABLE_MESSAGE);
  }

  if (!hasManageAny && exitCase.lastWorkingDay <= todayUtc()) {
    throw new ConflictError(
      'The last working day has arrived - this resignation can no longer be withdrawn',
    );
  }

  return prisma.$transaction(async (tx) => {
    const changed = await exitCaseRepository.transitionStatus(id, 'INITIATED', 'WITHDRAWN', {}, tx);

    if (changed === 0) {
      throw new ConflictError(NOT_WITHDRAWABLE_MESSAGE);
    }

    const updated = await exitCaseRepository.findById(id, tx);

    await writeAudit(
      tx,
      actor,
      AUDIT_ACTIONS.UPDATE,
      AUDIT_ENTITY_TYPES.EXIT_CASE,
      id,
      exitCase,
      updated,
    );

    return updated;
  });
};

// Adds an ASSET_RETURN item for every currently-held asset that does not
// already have one - run again at separation so an asset handed out after
// the case was initiated is not missed.
const syncAssetReturnItems = async (exitCaseId, activeAssignments, tx) => {
  const existing = new Set(await clearanceItemRepository.findAssetIdsWithOpenOrWaivedItem(exitCaseId, tx));
  const missing = activeAssignments.filter((assignment) => !existing.has(assignment.assetId));

  if (missing.length === 0) {
    return;
  }

  await clearanceItemRepository.createMany(
    missing.map((assignment) => ({
      exitCaseId,
      type: 'ASSET_RETURN',
      title: `Return asset ${assignment.asset.assetTag}`,
      assetId: assignment.assetId,
    })),
    tx,
  );
};

// SEPARATED -> COMPLETED once no clearance item is still PENDING (§2).
const completeIfResolved = async (exitCaseId, tx, now = new Date()) => {
  if ((await clearanceItemRepository.countPending(exitCaseId, tx)) > 0) {
    return false;
  }

  const changed = await exitCaseRepository.transitionStatus(
    exitCaseId,
    'SEPARATED',
    'COMPLETED',
    { completedAt: now },
    tx,
  );

  return changed > 0;
};

// The Exit Orchestration Service's one boundary point into Identity
// (ADR-EM01/EM02): invokes the UNMODIFIED softDeleteEmployee - which also
// revokes the linked account's sessions/tokens (ADR-006) - exactly once per
// case, only when lastWorkingDay has arrived, never because clearance
// finished. Everything is one transaction: the compare-and-set on
// INITIATED -> SEPARATED is what makes "exactly once" hold under
// concurrency, and if any later step throws, nothing (including the
// offboarding itself) is committed.
const separateExitCase = async (id, data, actor) => {
  const exitCase = await exitCaseRepository.findById(id);

  if (!exitCase) {
    throw new NotFoundError('Exit case not found');
  }

  if (exitCase.status !== 'INITIATED') {
    throw new ConflictError(NOT_INITIATED_FOR_SEPARATION_MESSAGE);
  }

  if (exitCase.lastWorkingDay > todayUtc()) {
    throw new ConflictError(
      `The last working day (${formatDate(exitCase.lastWorkingDay)}) has not arrived yet`,
    );
  }

  // If the Employee was already offboarded through the direct
  // DELETE /employees/:id primitive while this case was open, that
  // offboarding has already happened once - the primitive is not called a
  // second time (it would 404); the case just records the separation.
  const employee = await employeeRepository.findById(exitCase.employeeId);
  const now = new Date();

  const extra = { separatedAt: now };
  if (data.eligibleForRehire !== undefined) extra.eligibleForRehire = data.eligibleForRehire;
  if (data.rehireNote !== undefined) extra.rehireNote = data.rehireNote;

  return prisma.$transaction(async (tx) => {
    const changed = await exitCaseRepository.transitionStatus(
      id,
      'INITIATED',
      'SEPARATED',
      extra,
      tx,
    );

    if (changed === 0) {
      throw new ConflictError(NOT_INITIATED_FOR_SEPARATION_MESSAGE);
    }

    // Read inside the transaction (after the compare-and-set) so an asset
    // handed out a moment ago is not missed, and the case cannot auto-complete
    // while one is still held.
    const held = await assetAssignmentService.getActiveAssignmentsForEmployee(
      exitCase.employeeId,
      tx,
    );
    await syncAssetReturnItems(id, held, tx);

    if (employee) {
      await employeeService.softDeleteEmployee(exitCase.employeeId, actor, tx);
    }

    await clearanceItemRepository.resolvePendingByType(
      id,
      'ACCESS_REVOCATION',
      { status: 'DONE', resolvedAt: now, resolvedBy: actor.id },
      tx,
    );

    await completeIfResolved(id, tx, now);

    const updated = await exitCaseRepository.findById(id, tx);

    await writeAudit(
      tx,
      actor,
      AUDIT_ACTIONS.UPDATE,
      AUDIT_ENTITY_TYPES.EXIT_CASE,
      id,
      exitCase,
      updated,
    );

    return updated;
  });
};

// There is no scheduler infrastructure anywhere in this project yet (Leave
// notes the same), so the time-based trigger (ADR-EM02) is exposed as an
// explicit sweep a future cron/scheduler - or an admin - can call. One
// case failing never blocks the others; each runs in its own transaction.
const processDueSeparations = async (actor) => {
  const due = await exitCaseRepository.findDueForSeparation(todayUtc());
  const separated = [];
  const failed = [];

  for (const exitCase of due) {
    try {
      await separateExitCase(exitCase.id, {}, actor);
      separated.push(exitCase.id);
    } catch (error) {
      // Only deliberate, user-safe (operational) messages are returned - the
      // same masking the global error handler applies to a single request.
      logger.error(`Exit case ${exitCase.id} could not be separated: ${error.message}`);
      failed.push({
        id: exitCase.id,
        message: error.isOperational ? error.message : 'Internal Server Error',
      });
    }
  }

  return { processed: due.length, separated, failed };
};

const OPEN_STATUSES = ['INITIATED', 'SEPARATED'];

const addClearanceItem = async (exitCaseId, data, actor) => {
  const exitCase = await exitCaseRepository.findById(exitCaseId);

  if (!exitCase) {
    throw new NotFoundError('Exit case not found');
  }

  if (!OPEN_STATUSES.includes(exitCase.status)) {
    throw new ConflictError(`Clearance items cannot be added to a ${exitCase.status} exit case`);
  }

  return prisma.$transaction(async (tx) => {
    const currentStatus = await exitCaseRepository.lockStatusById(exitCaseId, tx);

    if (!OPEN_STATUSES.includes(currentStatus)) {
      throw new ConflictError(`Clearance items cannot be added to a ${currentStatus} exit case`);
    }

    const item = await clearanceItemRepository.create(
      { exitCaseId, type: 'OTHER', title: data.title },
      tx,
    );

    await writeAudit(
      tx,
      actor,
      AUDIT_ACTIONS.CREATE,
      AUDIT_ENTITY_TYPES.CLEARANCE_ITEM,
      item.id,
      null,
      item,
    );

    return item;
  });
};

// DONE or explicitly WAIVED (with a reason, §4) - the escape hatch for a
// lost/unreturned asset that should not block closure forever. Marking an
// ASSET_RETURN item DONE is refused while Asset Management still shows the
// asset as held by this employee: Exit Management only ever reads that
// query, it never writes into the asset ledger.
const updateClearanceItem = async (exitCaseId, itemId, data, actor) => {
  const exitCase = await exitCaseRepository.findById(exitCaseId);

  if (!exitCase) {
    throw new NotFoundError('Exit case not found');
  }

  const item = await clearanceItemRepository.findById(itemId);

  if (!item || item.exitCaseId !== exitCaseId) {
    throw new NotFoundError('Clearance item not found');
  }

  if (!OPEN_STATUSES.includes(exitCase.status)) {
    throw new ConflictError(`A ${exitCase.status} exit case can no longer be edited`);
  }

  if (item.type === 'ACCESS_REVOCATION' && exitCase.status === 'INITIATED') {
    throw new ConflictError(
      'The system access revocation item is resolved automatically at separation',
    );
  }

  if (data.status === 'WAIVED' && !data.waivedReason) {
    throw new BadRequestError('waivedReason: required when waiving a clearance item');
  }

  if (data.status === 'DONE' && item.type === 'ASSET_RETURN' && item.assetId) {
    const holder = await assetAssignmentService.getCurrentHolder(item.assetId);

    if (holder && holder.employeeId === exitCase.employeeId) {
      throw new ConflictError(
        'This asset is still assigned to the employee - record its return in Asset Management, or waive this item',
      );
    }
  }

  const resolved = data.status !== 'PENDING';

  return prisma.$transaction(async (tx) => {
    // Row-lock the case: concurrent updates to its items serialize, so the
    // "is anything still PENDING?" check below always sees the other update
    // (no lost completion), and a case that just closed is refused.
    const currentStatus = await exitCaseRepository.lockStatusById(exitCaseId, tx);

    if (!OPEN_STATUSES.includes(currentStatus)) {
      throw new ConflictError(`A ${currentStatus} exit case can no longer be edited`);
    }

    const updated = await clearanceItemRepository.update(
      itemId,
      {
        status: data.status,
        waivedReason: data.status === 'WAIVED' ? data.waivedReason : null,
        resolvedAt: resolved ? new Date() : null,
        resolvedBy: resolved ? actor.id : null,
      },
      tx,
    );

    await writeAudit(
      tx,
      actor,
      AUDIT_ACTIONS.UPDATE,
      AUDIT_ENTITY_TYPES.CLEARANCE_ITEM,
      itemId,
      item,
      updated,
    );

    let exitCaseStatus = currentStatus;

    if (currentStatus === 'SEPARATED' && (await completeIfResolved(exitCaseId, tx))) {
      exitCaseStatus = 'COMPLETED';

      const completed = await exitCaseRepository.findById(exitCaseId, tx);

      await writeAudit(
        tx,
        actor,
        AUDIT_ACTIONS.UPDATE,
        AUDIT_ENTITY_TYPES.EXIT_CASE,
        exitCaseId,
        exitCase,
        completed,
      );
    }

    return { clearanceItem: updated, exitCaseStatus };
  });
};

export default {
  createExitCase,
  getExitCaseById,
  listExitCases,
  updateExitCase,
  withdrawExitCase,
  separateExitCase,
  processDueSeparations,
  addClearanceItem,
  updateClearanceItem,
};
