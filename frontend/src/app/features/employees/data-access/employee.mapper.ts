import { CreateEmployeeRequestDto, EmployeeDto, UpdateEmployeeRequestDto } from './employee.dto';
import { CreateEmployeeRequest, Employee, UpdateEmployeeRequest } from './employee.model';

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
    department: dto.department,
    jobTitle: dto.jobTitle,
    salary: Number(dto.salary),
    dateOfJoining: new Date(dto.dateOfJoining),
    managerId: dto.managerId,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

/** Date-only (`YYYY-MM-DD`) - `dateOfJoining` has no time-of-day meaning, matching the backend's own example (`2024-01-15`). */
const toDateOnlyString = (date: Date): string => date.toISOString().slice(0, 10);

export function toCreateEmployeeRequestDto(request: CreateEmployeeRequest): CreateEmployeeRequestDto {
  return {
    userId: request.userId,
    department: request.department,
    jobTitle: request.jobTitle,
    salary: request.salary,
    dateOfJoining: toDateOnlyString(request.dateOfJoining),
    managerId: request.managerId,
  };
}

export function toUpdateEmployeeRequestDto(request: UpdateEmployeeRequest): UpdateEmployeeRequestDto {
  const { dateOfJoining, ...rest } = request;
  return {
    ...rest,
    ...(dateOfJoining ? { dateOfJoining: toDateOnlyString(dateOfJoining) } : {}),
  };
}
