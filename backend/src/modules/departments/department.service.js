import prisma from '../../config/database.js';
import departmentRepository from './department.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import ConflictError from '../../errors/ConflictError.js';
import NotFoundError from '../../errors/NotFoundError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const DUPLICATE_DEPARTMENT_MESSAGE = 'A department with this name or code already exists';

const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

const createDepartment = async (data, actor) => {
  const existing = await departmentRepository.findByNameOrCode(data.name, data.code);

  if (existing) {
    throw new ConflictError(DUPLICATE_DEPARTMENT_MESSAGE);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const department = await departmentRepository.create(data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.DEPARTMENT,
          entityId: department.id,
          beforeData: null,
          afterData: normalizeForAudit(department),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return department;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_DEPARTMENT_MESSAGE);
    }

    throw error;
  }
};

const getDepartmentById = async (id) => {
  const department = await departmentRepository.findById(id);

  if (!department) {
    throw new NotFoundError('Department not found');
  }

  return department;
};

const buildDepartmentWhere = ({ search, status }) => {
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

const listDepartments = async (query) => {
  const { page, limit, sortBy, order, ...filters } = query;
  const where = buildDepartmentWhere(filters);

  const [departments, total] = await Promise.all([
    departmentRepository.findAll({
      where,
      orderBy: [{ [sortBy]: order }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    departmentRepository.count(where),
  ]);

  return {
    departments,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const updateDepartment = async (id, data, actor) => {
  const department = await departmentRepository.findById(id);

  if (!department) {
    throw new NotFoundError('Department not found');
  }

  if (data.name || data.code) {
    const existing = await departmentRepository.findByNameOrCode(
      data.name ?? department.name,
      data.code,
    );

    if (existing && existing.id !== id) {
      throw new ConflictError(DUPLICATE_DEPARTMENT_MESSAGE);
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await departmentRepository.update(id, data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.UPDATE,
          entityType: AUDIT_ENTITY_TYPES.DEPARTMENT,
          entityId: id,
          beforeData: normalizeForAudit(department),
          afterData: normalizeForAudit(updated),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return updated;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_DEPARTMENT_MESSAGE);
    }

    throw error;
  }
};

const deleteDepartment = async (id, actor) => {
  const department = await departmentRepository.findById(id);

  if (!department) {
    throw new NotFoundError('Department not found');
  }

  const referenceCount = await departmentRepository.countEmployeesForDepartment(id);

  if (referenceCount > 0) {
    throw new ConflictError(
      'This department has Employee records referencing it and cannot be deleted - deactivate it instead',
    );
  }

  await prisma.$transaction(async (tx) => {
    await departmentRepository.remove(id, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.DEPARTMENT,
        entityId: id,
        beforeData: normalizeForAudit(department),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });
};

// Consumed by employee.service.js - the synchronous cross-domain read
// decided in ADR-D06 (same shape as Branch's ADR-B06). Enforces the
// positive allowlist rule from domain-department.md §2: assignable means
// status === ACTIVE, never the inverse.
const assertDepartmentAssignable = async (departmentId) => {
  const department = await departmentRepository.findById(departmentId);

  if (!department) {
    throw new BadRequestError('departmentId: references a record that does not exist');
  }

  if (department.status !== 'ACTIVE') {
    throw new BadRequestError('departmentId: this department is not active and cannot be assigned');
  }
};

export default {
  createDepartment,
  getDepartmentById,
  listDepartments,
  updateDepartment,
  deleteDepartment,
  assertDepartmentAssignable,
};
