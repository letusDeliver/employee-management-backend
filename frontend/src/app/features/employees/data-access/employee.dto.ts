/** Exact wire shape - `salary` is a Decimal, serializing as a JSON string. */
export interface EmployeeDto {
  id: string;
  userId: string | null;
  department: string;
  jobTitle: string;
  salary: string;
  dateOfJoining: string;
  managerId: string | null;
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
  department: string;
  jobTitle: string;
  salary: number;
  dateOfJoining: string;
  managerId?: string;
}

export type UpdateEmployeeRequestDto = Partial<CreateEmployeeRequestDto>;
