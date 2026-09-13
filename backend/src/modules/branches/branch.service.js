import prisma from '../../config/database.js';
import branchRepository from './branch.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import ConflictError from '../../errors/ConflictError.js';
import NotFoundError from '../../errors/NotFoundError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const DUPLICATE_BRANCH_MESSAGE = 'A branch with this name or code already exists';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

const createBranch = async (data, actor) => {
  const existing = await branchRepository.findByNameOrCode(data.name, data.code);

  if (existing) {
    throw new ConflictError(DUPLICATE_BRANCH_MESSAGE);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const branch = await branchRepository.create(data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.BRANCH,
          entityId: branch.id,
          beforeData: null,
          afterData: normalizeForAudit(branch),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return branch;
    });
  } catch (error) {
    // Same race-condition translation as employee.service.js's createEmployee:
    // the pre-check above can be beaten by a concurrent request, so the
    // database's own unique constraint (name, code) is the real guarantee.
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_BRANCH_MESSAGE);
    }

    throw error;
  }
};

const getBranchById = async (id) => {
  const branch = await branchRepository.findById(id);

  if (!branch) {
    throw new NotFoundError('Branch not found');
  }

  return branch;
};

const buildBranchWhere = ({ search, status }) => {
  const where = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (status) {
    where.status = status;
  }

  return where;
};

const listBranches = async (query) => {
  const { page, limit, sortBy, order, ...filters } = query;
  const where = buildBranchWhere(filters);

  const [branches, total] = await Promise.all([
    branchRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    branchRepository.count(where),
  ]);

  return {
    branches,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const updateBranch = async (id, data, actor) => {
  const branch = await branchRepository.findById(id);

  if (!branch) {
    throw new NotFoundError('Branch not found');
  }

  if (data.name || data.code) {
    const existing = await branchRepository.findByNameOrCode(data.name ?? branch.name, data.code);

    if (existing && existing.id !== id) {
      throw new ConflictError(DUPLICATE_BRANCH_MESSAGE);
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await branchRepository.update(id, data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.UPDATE,
          entityType: AUDIT_ENTITY_TYPES.BRANCH,
          entityId: id,
          beforeData: normalizeForAudit(branch),
          afterData: normalizeForAudit(updated),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return updated;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_BRANCH_MESSAGE);
    }

    throw error;
  }
};

const deleteBranch = async (id, actor) => {
  const branch = await branchRepository.findById(id);

  if (!branch) {
    throw new NotFoundError('Branch not found');
  }

  // Mirrors the workflow decided in domain-branch.md §4: a Branch referenced
  // by any Employee (including soft-deleted ones - see the repository's own
  // comment) is never hard-deleted; deactivate it instead. The schema's
  // onDelete: Restrict is the DB-level backstop for this same rule - this
  // check exists so the caller gets a clean 409, not a raw FK-violation 500.
  const referenceCount = await branchRepository.countEmployeesForBranch(id);

  if (referenceCount > 0) {
    throw new ConflictError(
      'This branch has Employee records referencing it and cannot be deleted - deactivate it instead',
    );
  }

  await prisma.$transaction(async (tx) => {
    await branchRepository.remove(id, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.BRANCH,
        entityId: id,
        beforeData: normalizeForAudit(branch),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });
};

// Consumed by employee.service.js (createEmployee/updateEmployee) - the
// synchronous cross-domain read decided in ADR-B06. Enforces the positive
// allowlist rule from domain-branch.md §2: assignable means status ===
// ACTIVE, never the inverse (status !== INACTIVE), so a future third status
// value defaults to not-assignable rather than silently becoming assignable.
const assertBranchAssignable = async (branchId) => {
  const branch = await branchRepository.findById(branchId);

  if (!branch) {
    throw new BadRequestError('branchId: references a record that does not exist');
  }

  if (branch.status !== 'ACTIVE') {
    throw new BadRequestError('branchId: this branch is not active and cannot be assigned');
  }
};

export default {
  createBranch,
  getBranchById,
  listBranches,
  updateBranch,
  deleteBranch,
  assertBranchAssignable,
};
