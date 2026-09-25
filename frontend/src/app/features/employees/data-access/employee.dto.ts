import { EmploymentType } from './employment-type';

/**
 * Exact wire shape, verified against a live `GET /employees` - `salary` is a Decimal,
 * serializing as a JSON string. Department, designation, branch and shift arrive as bare
 * foreign keys: there are no nested objects (the repository's `include` exists only
 * for Payroll's own read), so names must be resolved by the caller.
 */
export interface EmployeeDto {
  id: string;
  userId: string | null;
  departmentId: string;
  designationId: string;
  employmentType: EmploymentType;
  salary: string;
  dateOfJoining: string;
  managerId: string | null;
  branchId: string | null;
  shiftId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeesListResponse {
  employees: EmployeeDto[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface EmployeeResponse {
  employee: EmployeeDto;
}

/** `salary` is a number on the way in - the opposite direction from the response. */
export interface CreateEmployeeRequestDto {
  userId?: string;
  departmentId: string;
  designationId: string;
  employmentType: EmploymentType;
  salary: number;
  dateOfJoining: string;
  managerId?: string;
  branchId?: string;
  shiftId?: string;
}

/**
 * Mirrors `UpdateEmployeeRequest`'s widened `userId`/`managerId`/`branchId`/`shiftId`
 * (`null` means "clear this link"; omitting the key means "leave it as-is").
 */
export interface UpdateEmployeeRequestDto {
  userId?: string | null;
  departmentId?: string;
  designationId?: string;
  employmentType?: EmploymentType;
  salary?: number;
  dateOfJoining?: string;
  managerId?: string | null;
  branchId?: string | null;
  shiftId?: string | null;
}
