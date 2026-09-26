import { Paginated } from '../../../shared/models/paginated.model';

export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/**
 * Exact wire shape of a leave request, verified against `backend/src/modules/leave` and the Prisma
 * `LeaveRequest` model. `startDate`/`endDate` are CALENDAR DATES returned as ISO instants at UTC
 * midnight. `durationDays` is a Decimal (a JSON string) and is `null` until the request is approved -
 * the holiday- and week-off-excluding count is computed only at approval (ADR-LV04).
 */
export interface LeaveRequestDto {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: LeaveRequestStatus;
  durationDays: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `entitlement` and `consumed` are Decimals (fractional days in a hire year), so JSON strings. */
export interface LeaveBalanceDto {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  entitlement: string;
  consumed: string;
  createdAt: string;
  updatedAt: string;
}

// Each endpoint returns its own key, never a generic envelope (blueprint §0).
export interface LeaveRequestsListResponse {
  requests: LeaveRequestDto[];
  pagination: Paginated;
}

export interface LeaveRequestResponse {
  request: LeaveRequestDto;
}

export interface LeaveBalancesListResponse {
  balances: LeaveBalanceDto[];
  pagination: Paginated;
}

export interface LeaveBalanceResponse {
  balance: LeaveBalanceDto;
}
