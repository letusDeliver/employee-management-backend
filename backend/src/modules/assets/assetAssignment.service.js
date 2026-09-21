import prisma from '../../config/database.js';
import assetRepository from './asset.repository.js';
import assetService from './asset.service.js';
import assetAssignmentRepository from './assetAssignment.repository.js';
import employeeRepository from '../employees/employee.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import NotFoundError from '../../errors/NotFoundError.js';
import ConflictError from '../../errors/ConflictError.js';
import ForbiddenError from '../../errors/ForbiddenError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const READ_ANY_PERMISSION = 'assetAssignment:read:any';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

const ALREADY_ASSIGNED_MESSAGE = 'This asset already has an active assignment';

// Hands an AVAILABLE asset to an employee. The ledger insert, the
// AVAILABLE->ASSIGNED status change and both AuditLog rows are one
// transaction. Two independent guards make double-assignment impossible
// under concurrency (ADR-AM02): the compare-and-set on Asset.status, and
// the DB's partial unique index on active assignments (P2002 backstop).
const assignAsset = async (assetId, data, actor) => {
  const asset = await assetRepository.findById(assetId);

  if (!asset) {
    throw new NotFoundError('Asset not found');
  }

  await assetService.assertAssetAssignable(assetId);

  const employee = await employeeRepository.findById(data.employeeId);

  if (!employee) {
    throw new BadRequestError('employeeId: references a record that does not exist');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const changed = await assetRepository.transitionStatus(assetId, 'AVAILABLE', 'ASSIGNED', tx);

      if (changed === 0) {
        throw new ConflictError(ALREADY_ASSIGNED_MESSAGE);
      }

      const assignment = await assetAssignmentRepository.create(
        {
          assetId,
          employeeId: data.employeeId,
          assignedBy: actor.id,
          ...(data.assignedAt ? { assignedAt: data.assignedAt } : {}),
        },
        tx,
      );

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.ASSET_ASSIGNMENT,
          entityId: assignment.id,
          beforeData: null,
          afterData: normalizeForAudit(assignment),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.UPDATE,
          entityType: AUDIT_ENTITY_TYPES.ASSET,
          entityId: assetId,
          beforeData: normalizeForAudit(asset),
          afterData: normalizeForAudit({ ...asset, status: 'ASSIGNED' }),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return assignment;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(ALREADY_ASSIGNED_MESSAGE);
    }

    throw error;
  }
};

// Closes the asset's active assignment. `condition` decides the asset's
// next status (GOOD -> AVAILABLE, DAMAGED -> UNDER_REPAIR); the ledger row
// is updated in place only to record the return, never deleted.
const returnAsset = async (assetId, data, actor) => {
  const asset = await assetRepository.findById(assetId);

  if (!asset) {
    throw new NotFoundError('Asset not found');
  }

  const active = await assetAssignmentRepository.findActiveByAssetId(assetId);

  if (!active) {
    throw new ConflictError('This asset is not currently assigned');
  }

  const nextStatus = data.condition === 'DAMAGED' ? 'UNDER_REPAIR' : 'AVAILABLE';

  await prisma.$transaction(async (tx) => {
    const closed = await assetAssignmentRepository.closeActive(
      active.id,
      {
        returnedAt: new Date(),
        returnedBy: actor.id,
        returnCondition: data.condition,
        returnNotes: data.notes ?? null,
      },
      tx,
    );

    if (closed === 0) {
      throw new ConflictError('This asset is not currently assigned');
    }

    const changed = await assetRepository.transitionStatus(assetId, 'ASSIGNED', nextStatus, tx);

    if (changed === 0) {
      throw new ConflictError('This asset is not currently assigned');
    }

    const updated = await assetAssignmentRepository.findById(active.id, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.ASSET_ASSIGNMENT,
        entityId: active.id,
        beforeData: normalizeForAudit(active),
        afterData: normalizeForAudit(updated),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.ASSET,
        entityId: assetId,
        beforeData: normalizeForAudit(asset),
        afterData: normalizeForAudit({ ...asset, status: nextStatus }),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });

  return assetAssignmentRepository.findById(active.id);
};

// The two reusable queries domain-asset-management.md §5/§12 names for
// Exit Management (and any other consumer) to read instead of querying
// the ledger independently.
const getCurrentHolder = async (assetId) => {
  const asset = await assetRepository.findById(assetId);

  if (!asset) {
    throw new NotFoundError('Asset not found');
  }

  return assetAssignmentRepository.findActiveByAssetId(assetId);
};

const getActiveAssignmentsForEmployee = (employeeId) => {
  return assetAssignmentRepository.findAllActiveByEmployeeId(employeeId);
};

const listAssignmentHistory = async (assetId) => {
  const asset = await assetRepository.findById(assetId);

  if (!asset) {
    throw new NotFoundError('Asset not found');
  }

  return assetAssignmentRepository.findAllByAssetId(assetId);
};

const assertOwnershipOrAny = async (employeeId, requester) => {
  if (requester.grantedPermissions.includes(READ_ANY_PERMISSION)) {
    return;
  }

  const ownEmployee = await employeeRepository.findByUserId(requester.id);

  if (!ownEmployee || ownEmployee.id !== employeeId) {
    throw new ForbiddenError('You do not have permission to view this asset assignment');
  }
};

const getAssignmentById = async (id, requester) => {
  const assignment = await assetAssignmentRepository.findById(id);

  if (!assignment) {
    throw new NotFoundError('Asset assignment not found');
  }

  await assertOwnershipOrAny(assignment.employeeId, requester);

  return assignment;
};

const buildAssignmentWhere = ({ employeeId, assetId, active }) => {
  const where = {};

  if (employeeId) where.employeeId = employeeId;
  if (assetId) where.assetId = assetId;
  if (active === true) where.returnedAt = null;
  if (active === false) where.returnedAt = { not: null };

  return where;
};

// A caller without :read:any is auto-scoped to their own employeeId
// rather than refused - the same self-service list pattern Leave,
// Performance and Training established.
const listAssignments = async (query, requester) => {
  const { page, limit, sortBy, order, ...filters } = query;

  if (!requester.grantedPermissions.includes(READ_ANY_PERMISSION)) {
    const ownEmployee = await employeeRepository.findByUserId(requester.id);

    if (!ownEmployee) {
      return { assignments: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }

    filters.employeeId = ownEmployee.id;
  }

  const where = buildAssignmentWhere(filters);

  const [assignments, total] = await Promise.all([
    assetAssignmentRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    assetAssignmentRepository.count(where),
  ]);

  return {
    assignments,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export default {
  assignAsset,
  returnAsset,
  getCurrentHolder,
  getActiveAssignmentsForEmployee,
  listAssignmentHistory,
  getAssignmentById,
  listAssignments,
};
