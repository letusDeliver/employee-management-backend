import employeeRepository from './employee.repository.js';
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
  const field = constraintName.includes('managerId') ? 'managerId' : 'userId';

  throw new BadRequestError(`${field}: references a record that does not exist`);
};

const createEmployee = async (data) => {
  if (data.userId) {
    const existing = await employeeRepository.findByUserId(data.userId);

    if (existing) {
      throw new ConflictError(DUPLICATE_USER_MESSAGE);
    }
  }

  try {
    return await employeeRepository.create(data);
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

const listEmployees = async () => {
  return employeeRepository.findAll();
};

const updateEmployee = async (id, data) => {
  const employee = await employeeRepository.findById(id);

  if (!employee) {
    throw new NotFoundError('Employee not found');
  }

  assertNotSelfManaged(id, data.managerId);

  try {
    return await employeeRepository.update(id, data);
  } catch (error) {
    rethrowForeignKeyViolationAsBadRequest(error);
  }
};

const softDeleteEmployee = async (id) => {
  const employee = await employeeRepository.findById(id);

  if (!employee) {
    throw new NotFoundError('Employee not found');
  }

  await employeeRepository.softDelete(id);
};

export default {
  createEmployee,
  getEmployeeById,
  listEmployees,
  updateEmployee,
  softDeleteEmployee,
};
