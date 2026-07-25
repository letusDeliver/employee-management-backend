/** The shape components/stores actually work with - `salary: number`, real `Date`s. */
export interface Employee {
  id: string;
  userId: string | null;
  department: string;
  jobTitle: string;
  salary: number;
  dateOfJoining: Date;
  managerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type EmployeeSortField = 'department' | 'jobTitle' | 'salary' | 'dateOfJoining' | 'createdAt';

export interface EmployeeListQuery {
  page: number;
  limit: number;
  search?: string;
  department?: string;
  jobTitle?: string;
  managerId?: string;
  sortBy: EmployeeSortField;
  order: 'asc' | 'desc';
}

export interface CreateEmployeeRequest {
  userId?: string;
  department: string;
  jobTitle: string;
  salary: number;
  dateOfJoining: Date;
  managerId?: string;
}

export type UpdateEmployeeRequest = Partial<CreateEmployeeRequest>;
