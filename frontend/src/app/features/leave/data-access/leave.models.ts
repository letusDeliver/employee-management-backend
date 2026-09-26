import { MasterDataBase, MasterDataQueryBase, MasterDataStatus } from '../../../shared/master-data/master-data.models';
import { LeaveRequestStatus } from './leave.dto';

export type { LeaveRequestStatus } from './leave.dto';

/**
 * What components and stores work with. Unlike Attendance there IS a DTO -> model split here: the
 * wire carries `durationDays`, `entitlement` and `consumed` as Decimal strings, which are numbers to
 * everything that shows or compares them (see `leave.mapper.ts`). Dates stay ISO strings and are
 * read only through `shared/utils/date-only.util.ts`.
 */
export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  /** A CALENDAR DATE, as the API returns it (an ISO instant at UTC midnight). */
  startDate: string;
  endDate: string;
  reason: string | null;
  status: LeaveRequestStatus;
  /** Holiday- and week-off-excluding days; `null` until approved. */
  durationDays: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  entitlement: number;
  consumed: number;
  createdAt: string;
  updatedAt: string;
}

/** The backend's own sort whitelists (`leave.validation.js`). */
export type LeaveRequestSortField = 'startDate' | 'endDate' | 'status' | 'createdAt';
export type LeaveBalanceSortField = 'year' | 'entitlement' | 'consumed' | 'createdAt';

export interface LeaveRequestListQuery {
  page: number;
  limit: number;
  /** Honoured only for a caller with `leaveRequest:read:any`; otherwise the server scopes to their own. */
  employeeId?: string;
  leaveTypeId?: string;
  status?: LeaveRequestStatus;
  /** `YYYY-MM-DD`, compared against the request's START date, inclusive. */
  dateFrom?: string;
  dateTo?: string;
  sortBy: LeaveRequestSortField;
  order: 'asc' | 'desc';
}

export interface LeaveBalanceListQuery {
  page: number;
  limit: number;
  employeeId?: string;
  leaveTypeId?: string;
  year?: number;
  sortBy: LeaveBalanceSortField;
  order: 'asc' | 'desc';
}

export interface CreateLeaveRequestRequest {
  leaveTypeId: string;
  /** `YYYY-MM-DD`. */
  startDate: string;
  endDate: string;
  reason?: string;
}

/** The reason is recorded in the audit log only - the request row does not store it. */
export interface RejectLeaveRequestRequest {
  reason?: string;
}

/** ADMIN-only manual override; at least one field, each >= 0. */
export interface AdjustLeaveBalanceRequest {
  entitlement?: number;
  consumed?: number;
}

// ---- Leave types (master data, no `code`) -------------------------------------------------------

export interface LeaveType extends MasterDataBase {
  defaultAnnualEntitlement: number;
  isPaid: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The backend's own sort whitelist (`leaveType.validation.js`). */
export type LeaveTypeSortField = 'name' | 'defaultAnnualEntitlement' | 'status' | 'createdAt';

export interface LeaveTypeListQuery extends MasterDataQueryBase {
  sortBy: LeaveTypeSortField;
}

export interface CreateLeaveTypeRequest {
  name: string;
  defaultAnnualEntitlement: number;
  isPaid: boolean;
}

export interface UpdateLeaveTypeRequest {
  name?: string;
  defaultAnnualEntitlement?: number;
  isPaid?: boolean;
  status?: MasterDataStatus;
}
