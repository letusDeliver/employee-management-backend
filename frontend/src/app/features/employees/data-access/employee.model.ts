import { EmploymentType } from './employment-type';

/** The shape components/stores actually work with - `salary: number`, real `Date`s. */
export interface Employee {
  id: string;
  userId: string | null;
  departmentId: string;
  designationId: string;
  employmentType: EmploymentType;
  salary: number;
  dateOfJoining: Date;
  managerId: string | null;
  branchId: string | null;
  shiftId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The backend's own sort whitelist (`employee.validation.js`): `department`,
 * `designation` and `shift` are relation sorts by the related record's NAME, so
 * these keys are not column names on the Employee row. There is no `jobTitle` -
 * sending one is a 400.
 */
export type EmployeeSortField = 'department' | 'designation' | 'employmentType' | 'salary' | 'dateOfJoining' | 'createdAt';

export interface EmployeeListQuery {
  page: number;
  limit: number;
  search?: string;
  departmentId?: string;
  designationId?: string;
  employmentType?: EmploymentType;
  managerId?: string;
  sortBy: EmployeeSortField;
  order: 'asc' | 'desc';
}

export interface CreateEmployeeRequest {
  userId?: string;
  departmentId: string;
  designationId: string;
  employmentType: EmploymentType;
  salary: number;
  dateOfJoining: Date;
  managerId?: string;
  branchId?: string;
  shiftId?: string;
}

/**
 * Not `Partial<CreateEmployeeRequest>` - `userId`/`managerId`/`branchId`/`shiftId` are widened to
 * `string | null` (not just `string | undefined`), since an update needs to express
 * "clear this link" explicitly. Omitting the key means "leave it as-is" (PATCH
 * semantics); `null` means "unset it" - the backend's `updateEmployeeSchema`
 * distinguishes the two the same way.
 */
export interface UpdateEmployeeRequest {
  userId?: string | null;
  departmentId?: string;
  designationId?: string;
  employmentType?: EmploymentType;
  salary?: number;
  dateOfJoining?: Date;
  managerId?: string | null;
  branchId?: string | null;
  shiftId?: string | null;
}
