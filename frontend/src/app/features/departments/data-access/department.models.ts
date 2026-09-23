import { Paginated } from '../../../shared/models/paginated.model';

/**
 * Single shared file, no DTO/Model/Mapper split - Department has zero
 * wire/domain divergence (no Decimal, no date reshaping any component
 * needs), the same reasoning `branch.models.ts` and `auth.models.ts` already
 * established. `createdAt`/`updatedAt` stay ISO strings straight off the
 * wire; Angular's `DatePipe` accepts them directly.
 */
export type DepartmentStatus = 'ACTIVE' | 'INACTIVE';

export interface Department {
  id: string;
  name: string;
  code: string | null;
  status: DepartmentStatus;
  createdAt: string;
  updatedAt: string;
}

export type DepartmentSortField = 'name' | 'code' | 'status' | 'createdAt';

export interface DepartmentListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: DepartmentStatus;
  sortBy: DepartmentSortField;
  order: 'asc' | 'desc';
}

export interface DepartmentsListResponse {
  departments: Department[];
  pagination: Paginated;
}

export interface DepartmentResponse {
  department: Department;
}

export interface CreateDepartmentRequest {
  name: string;
  code?: string;
}

export interface UpdateDepartmentRequest {
  name?: string;
  code?: string | null;
  status?: DepartmentStatus;
}
