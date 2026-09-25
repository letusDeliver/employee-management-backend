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
  // The branch's holiday calendar (ADR-HC03), chosen in the Branch form; `null` = "no holidays applied".
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
