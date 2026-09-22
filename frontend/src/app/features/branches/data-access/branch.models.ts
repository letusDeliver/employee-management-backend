import { Paginated } from '../../../shared/models/paginated.model';

/**
 * Single shared file, no DTO/Model/Mapper split (unlike Employees) - Branch
 * has zero wire/domain divergence (no Decimal, no date reshaping any
 * component needs), the same reasoning `auth.models.ts` already established
 * for Auth. `createdAt`/`updatedAt` stay ISO strings straight off the wire;
 * Angular's `DatePipe` accepts them directly.
 */
export type BranchStatus = 'ACTIVE' | 'INACTIVE';

export interface Branch {
  id: string;
  name: string;
  code: string | null;
  status: BranchStatus;
  // Always present on the model even though Holiday Calendar (domain 7) has
  // no frontend yet - the form deliberately doesn't expose it, but the field
  // still round-trips from the real backend response.
  holidayCalendarId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BranchSortField = 'name' | 'code' | 'status' | 'createdAt';

export interface BranchListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: BranchStatus;
  sortBy: BranchSortField;
  order: 'asc' | 'desc';
}

export interface BranchesListResponse {
  branches: Branch[];
  pagination: Paginated;
}

export interface BranchResponse {
  branch: Branch;
}

export interface CreateBranchRequest {
  name: string;
  code?: string;
  holidayCalendarId?: string;
}

export interface UpdateBranchRequest {
  name?: string;
  code?: string | null;
  status?: BranchStatus;
  holidayCalendarId?: string | null;
}
