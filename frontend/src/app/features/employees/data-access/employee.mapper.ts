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

/**
 * Date-only (`YYYY-MM-DD`) - `dateOfJoining` has no time-of-day meaning,
 * matching the backend's own example (`2024-01-15`). Deliberately reads
 * local date parts, not `toISOString()`: `MatDatepicker` produces a `Date`
 * at local midnight, and `toISOString()` converts to UTC first - for any
 * timezone ahead of UTC, local midnight is still the *previous* day in
 * UTC, silently shifting a freshly-picked date back by one.
 */
const toDateOnlyString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
