import { EmployeeDto } from './employee.dto';
import { Employee } from './employee.model';

/**
 * Pure fixtures for the Employee specs (no test-framework imports, so it is safe in the
 * app's type-check). Shaped like a REAL `GET /employees` row: bare foreign keys, a
 * string salary, and an ISO instant at UTC midnight for the date-only `dateOfJoining`.
 */
export const makeEmployeeDto = (overrides: Partial<EmployeeDto> = {}): EmployeeDto => ({
  id: 'emp-1',
  userId: null,
  departmentId: 'dep-1',
  designationId: 'des-1',
  employmentType: 'FULL_TIME',
  salary: '1000',
  dateOfJoining: '2024-01-01T00:00:00.000Z',
  managerId: null,
  branchId: null,
  shiftId: null,
  deletedAt: null,
  createdAt: '2026-09-23T00:00:00.000Z',
  updatedAt: '2026-09-23T00:00:00.000Z',
  ...overrides,
});

export const makeEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  id: 'emp-1',
  userId: null,
  departmentId: 'dep-1',
  designationId: 'des-1',
  employmentType: 'FULL_TIME',
  salary: 1000,
  dateOfJoining: new Date(2024, 0, 1),
  managerId: null,
  branchId: null,
  shiftId: null,
  createdAt: new Date('2026-09-23T00:00:00.000Z'),
  updatedAt: new Date('2026-09-23T00:00:00.000Z'),
  ...overrides,
});
