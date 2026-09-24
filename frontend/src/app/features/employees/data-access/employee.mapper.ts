import { CreateEmployeeRequestDto, EmployeeDto, UpdateEmployeeRequestDto } from './employee.dto';
import { CreateEmployeeRequest, Employee, UpdateEmployeeRequest } from './employee.model';

/**
 * Parses a date-only value as a LOCAL calendar date. The API returns
 * `dateOfJoining` as an ISO instant at UTC midnight (`2024-01-01T00:00:00.000Z`),
 * and `new Date(thatString)` in a timezone BEHIND UTC is the previous evening
 * locally - so the UI showed the day before, and because an edit re-sent the
 * displayed date, each save drifted it a further day earlier (verified:
 * `America/New_York` and `America/Los_Angeles` gave 2023-12-31 for 2024-01-01;
 * `Asia/Kolkata` and `UTC` happened to be fine). A date of joining has no
 * time-of-day meaning, so only its `YYYY-MM-DD` part is read.
 */
const fromDateOnlyString = (value: string): Date => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
};

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
    dateOfJoining: fromDateOnlyString(dto.dateOfJoining),
    managerId: dto.managerId,
    branchId: dto.branchId,
    shiftId: dto.shiftId,
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
export const toDateOnlyString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
  };
}

export function toUpdateEmployeeRequestDto(request: UpdateEmployeeRequest): UpdateEmployeeRequestDto {
  const { dateOfJoining, ...rest } = request;
  return {
    ...rest,
    ...(dateOfJoining ? { dateOfJoining: toDateOnlyString(dateOfJoining) } : {}),
  };
}
