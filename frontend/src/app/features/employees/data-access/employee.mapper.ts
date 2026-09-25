import { CreateEmployeeRequestDto, EmployeeDto, UpdateEmployeeRequestDto } from './employee.dto';
import { CreateEmployeeRequest, Employee, UpdateEmployeeRequest } from './employee.model';
import { formatDateOnly, parseDateOnly } from '../../../shared/utils/date-only.util';

/**
 * The one place `salary` (string <-> number) and `dateOfJoining`/
 * `createdAt`/`updatedAt` (ISO string <-> `Date`) conversions happen -
 * mirrors the backend's own `normalizeForAudit()` isolation of the same
 * Decimal/Date serialization quirk (blueprint §8).
 */
export function toEmployeeModel(dto: EmployeeDto): Employee {
  return {
    id: dto.id,
    userId: dto.userId,
    departmentId: dto.departmentId,
    designationId: dto.designationId,
    employmentType: dto.employmentType,
    salary: Number(dto.salary),
    dateOfJoining: parseDateOnly(dto.dateOfJoining),
    managerId: dto.managerId,
    branchId: dto.branchId,
    shiftId: dto.shiftId,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

/**
 * Date-only (`YYYY-MM-DD`) from local date parts - see `shared/utils/date-only.util.ts` for why
 * never `toISOString()`. Kept under this name because Employees' update diff and specs use it.
 */
export const toDateOnlyString = formatDateOnly;

export function toCreateEmployeeRequestDto(request: CreateEmployeeRequest): CreateEmployeeRequestDto {
  return {
    userId: request.userId,
    departmentId: request.departmentId,
    designationId: request.designationId,
    employmentType: request.employmentType,
    salary: request.salary,
    dateOfJoining: toDateOnlyString(request.dateOfJoining),
    managerId: request.managerId,
    branchId: request.branchId,
    shiftId: request.shiftId,
  };
}

export function toUpdateEmployeeRequestDto(request: UpdateEmployeeRequest): UpdateEmployeeRequestDto {
  const { dateOfJoining, ...rest } = request;
  return {
    ...rest,
    ...(dateOfJoining ? { dateOfJoining: toDateOnlyString(dateOfJoining) } : {}),
  };
}
