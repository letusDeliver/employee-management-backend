import { toDateOnlyString } from './employee.mapper';
import { CreateEmployeeRequest, Employee, UpdateEmployeeRequest } from './employee.model';
import { EmploymentType } from './employment-type';

/** What the form holds. A blank id (`''`) means "none" for the optional links. */
export interface EmployeeFormValue {
  departmentId: string;
  designationId: string;
  employmentType: EmploymentType;
  salary: number;
  dateOfJoining: Date;
  branchId: string;
  shiftId: string;
  userId: string;
  managerId: string;
}

/** Create omits an empty optional link - there is nothing to unlink yet. */
export function buildEmployeeCreate(form: EmployeeFormValue): CreateEmployeeRequest {
  return {
    departmentId: form.departmentId,
    designationId: form.designationId,
    employmentType: form.employmentType,
    salary: form.salary,
    dateOfJoining: form.dateOfJoining,
    userId: form.userId || undefined,
    managerId: form.managerId || undefined,
    branchId: form.branchId || undefined,
    shiftId: form.shiftId || undefined,
  };
}

/**
 * A PATCH body with ONLY what actually changed.
 *
 * Why this matters (verified live against the real API): the backend re-validates
 * assignability whenever a foreign key is PRESENT in the body, even if it is
 * unchanged. So resending an employee's current `departmentId` after that department
 * was deactivated is a 400 - "not active and cannot be assigned" - on an edit that
 * never touched the department. Omitting the key leaves the existing assignment
 * alone, which is exactly the intent. The same rule applies to `designationId`,
 * `branchId` and `shiftId` (a shift assigned earlier and deactivated since must not fail
 * an unrelated edit).
 *
 * For the optional links a change is either a new id or `null` ("clear it"); omitting
 * means "leave as-is".
 *
 * An empty object means the user changed nothing, and the caller should not send a
 * request at all (a no-op PATCH still writes an audit row and bumps `updatedAt`).
 */
export function buildEmployeeUpdate(original: Employee, form: EmployeeFormValue): UpdateEmployeeRequest {
  const request: UpdateEmployeeRequest = {};

  if (form.departmentId !== original.departmentId) {
    request.departmentId = form.departmentId;
  }
  if (form.designationId !== original.designationId) {
    request.designationId = form.designationId;
  }
  if (form.employmentType !== original.employmentType) {
    request.employmentType = form.employmentType;
  }
  if (form.salary !== original.salary) {
    request.salary = form.salary;
  }
  // Compared as date-only strings so a Date at a different time-of-day is not "changed".
  if (toDateOnlyString(form.dateOfJoining) !== toDateOnlyString(original.dateOfJoining)) {
    request.dateOfJoining = form.dateOfJoining;
  }

  const link = (current: string | null, next: string): string | null | undefined => {
    const wanted = next || null;
    return wanted === current ? undefined : wanted;
  };

  const branchId = link(original.branchId, form.branchId);
  const shiftId = link(original.shiftId, form.shiftId);
  const userId = link(original.userId, form.userId);
  const managerId = link(original.managerId, form.managerId);

  if (branchId !== undefined) {
    request.branchId = branchId;
  }
  if (shiftId !== undefined) {
    request.shiftId = shiftId;
  }
  if (userId !== undefined) {
    request.userId = userId;
  }
  if (managerId !== undefined) {
    request.managerId = managerId;
  }

  return request;
}
