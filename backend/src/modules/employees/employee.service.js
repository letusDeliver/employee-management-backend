import prisma from '../../config/database.js';
import employeeRepository from './employee.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import branchService from '../branches/branch.service.js';
import departmentService from '../departments/department.service.js';
import designationService from '../designations/designation.service.js';
import shiftService from '../shifts/shift.service.js';
import ConflictError from '../../errors/ConflictError.js';
import NotFoundError from '../../errors/NotFoundError.js';
import ForbiddenError from '../../errors/ForbiddenError.js';
import BadRequestError from '../../errors/BadRequestError.js';

const READ_ANY_PERMISSION = 'employee:read:any';
const DUPLICATE_USER_MESSAGE = 'This user already has an employee record';

const assertNotSelfManaged = (employeeId, managerId) => {
  if (managerId && managerId === employeeId) {
    throw new BadRequestError('An employee cannot be their own manager');
  }
};

// Raw Prisma records contain a Decimal (salary) and Date instances -
// neither is safe to pass directly into a Json column (verified live).
// This produces the same plain, JSON-safe shape the API's own responses
// already render (Decimal -> string, Date -> ISO string).
const normalizeForAudit = (record) => JSON.parse(JSON.stringify(record));

// Translates a Prisma foreign-key-violation (P2003) - e.g. a userId or
// managerId that doesn't reference any real row - into a client-safe 400
// instead of letting the raw driver error reach the generic 500 handler.
// The failing column name lives in the constraint name Postgres reports
// (e.g. "Employee_userId_fkey"), not in a dedicated field on the error.
const rethrowForeignKeyViolationAsBadRequest = (error) => {
  if (error.code !== 'P2003') {
    throw error;
  }

  const constraintName = error.meta?.driverAdapterError?.cause?.constraint?.index ?? '';
  const field = constraintName.includes('managerId')
    ? 'managerId'
    : constraintName.includes('branchId')
      ? 'branchId'
      : constraintName.includes('departmentId')
        ? 'departmentId'
        : constraintName.includes('designationId')
          ? 'designationId'
          : constraintName.includes('shiftId')
            ? 'shiftId'
            : 'userId';

  throw new BadRequestError(`${field}: references a record that does not exist`);
};

const createEmployee = async (data, actor) => {
  if (data.userId) {
    const existing = await employeeRepository.findByUserId(data.userId);

    if (existing) {
      throw new ConflictError(DUPLICATE_USER_MESSAGE);
    }
  }

  if (data.branchId) {
    await branchService.assertBranchAssignable(data.branchId);
  }

  // Same reasoning as branchId - shiftId is also optional (docs/domain-shift.md
  // ADR-SH02).
  if (data.shiftId) {
    await shiftService.assertShiftAssignable(data.shiftId);
  }

  // Unconditional, unlike branchId - departmentId is mandatory
  // (docs/domain-department.md ADR-D07), so validation guarantees it is
  // always present at this point.
  await departmentService.assertDepartmentAssignable(data.departmentId);

  // Same reasoning as departmentId above - designationId is mandatory
  // (docs/domain-designation.md ADR-DS07).
  await designationService.assertDesignationAssignable(data.designationId);

  try {
    return await prisma.$transaction(async (tx) => {
      const employee = await employeeRepository.create(data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType: AUDIT_ENTITY_TYPES.EMPLOYEE,
          entityId: employee.id,
          beforeData: null,
          afterData: normalizeForAudit(employee),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return employee;
    });
  } catch (error) {
    // A concurrent request could slip past the pre-check above between the
    // read and the write - the database's own unique constraint on userId
    // is the real guarantee, this just translates its race-condition
    // failure into the same ConflictError the pre-check produces.
    if (error.code === 'P2002') {
      throw new ConflictError(DUPLICATE_USER_MESSAGE);
    }

    rethrowForeignKeyViolationAsBadRequest(error);
  }
};

const getEmployeeById = async (id, requester) => {
  const employee = await employeeRepository.findById(id);

  if (!employee) {
    throw new NotFoundError('Employee not found');
  }

  const hasAnyAccess = requester.grantedPermissions.includes(READ_ANY_PERMISSION);

  if (!hasAnyAccess && employee.userId !== requester.id) {
    throw new ForbiddenError('You do not have permission to view this employee record');
  }

  return employee;
};

const buildEmployeeWhere = ({
  search,
  departmentId,
  designationId,
  employmentType,
  managerId,
  shiftId,
}) => {
  const where = {};

  if (search) {
    where.OR = [
      { department: { name: { contains: search, mode: 'insensitive' } } },
      { designation: { name: { contains: search, mode: 'insensitive' } } },
      { user: { name: { contains: search, mode: 'insensitive' } } },
      { user: { email: { contains: search, mode: 'insensitive' } } },
    ];
  }

  if (departmentId) {
    where.departmentId = departmentId;
  }

  if (designationId) {
    where.designationId = designationId;
  }

  // Exact match on a closed enum - no relation involved (unlike
  // departmentId/designationId), so this is a plain scalar filter.
  if (employmentType) {
    where.employmentType = employmentType;
  }

  if (managerId) {
    where.managerId = managerId;
  }

  if (shiftId) {
    where.shiftId = shiftId;
  }

  return where;
};

// 'department'/'designation'/'shift' are relations now, not scalar columns
// (docs/domain-department.md, docs/domain-designation.md, docs/domain-shift.md)
// - sorting by any of them means sorting by the linked record's name (a
// one-hop nested orderBy), not a direct column comparison like every other
// sortBy value.
const RELATION_SORT_FIELDS = new Set(['department', 'designation', 'shift']);

const buildEmployeeOrderBy = (sortBy, order) =>
  RELATION_SORT_FIELDS.has(sortBy) ? { [sortBy]: { name: order } } : { [sortBy]: order };

const listEmployees = async (query) => {
  const { page, limit, sortBy, order, ...filters } = query;
  const where = buildEmployeeWhere(filters);

  // A trailing `id` tiebreaker makes ordering deterministic across pages
  // and repeated calls whenever multiple rows share the same sortBy value
  // - unconditional, since id is always unique regardless of what sortBy is.
  const [employees, total] = await Promise.all([
    employeeRepository.findAll({
      where,
      orderBy: [buildEmployeeOrderBy(sortBy, order), { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    employeeRepository.count(where),
  ]);

  return {
    employees,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const updateEmployee = async (id, data, actor) => {
  const employee = await employeeRepository.findById(id);

  if (!employee) {
    throw new NotFoundError('Employee not found');
  }

  assertNotSelfManaged(id, data.managerId);

  // Only validated when a new branchId is actually being set - `null` means
  // "clear the branch" (no check needed) and `undefined` means "leave it
  // as-is" (already validated when it was originally assigned).
  if (data.branchId) {
    await branchService.assertBranchAssignable(data.branchId);
  }

  // Same reasoning as branchId above - shiftId is nullable, `null` clears
  // it (no check needed), `undefined` leaves it as-is.
  if (data.shiftId) {
    await shiftService.assertShiftAssignable(data.shiftId);
  }

  // departmentId is never nullable (unlike branchId) - the schema itself
  // rejects `null`, so only "present and being changed" vs. "omitted, leave
  // as-is" are real cases here.
  if (data.departmentId) {
    await departmentService.assertDepartmentAssignable(data.departmentId);
  }

  // Same reasoning as departmentId above - designationId is never nullable.
  if (data.designationId) {
    await designationService.assertDesignationAssignable(data.designationId);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await employeeRepository.update(id, data, tx);

      await auditLogRepository.create(
        {
          actorId: actor.id,
          action: AUDIT_ACTIONS.UPDATE,
          entityType: AUDIT_ENTITY_TYPES.EMPLOYEE,
          entityId: id,
          beforeData: normalizeForAudit(employee),
          afterData: normalizeForAudit(updated),
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );

      return updated;
    });
  } catch (error) {
    rethrowForeignKeyViolationAsBadRequest(error);
  }
};

const softDeleteEmployee = async (id, actor) => {
  const employee = await employeeRepository.findById(id);

  if (!employee) {
    throw new NotFoundError('Employee not found');
  }

  await prisma.$transaction(async (tx) => {
    await employeeRepository.softDelete(id, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DELETE,
        entityType: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entityId: id,
        beforeData: normalizeForAudit(employee),
        afterData: null,
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );
  });
};

export default {
  createEmployee,
  getEmployeeById,
  listEmployees,
  updateEmployee,
  softDeleteEmployee,
};
