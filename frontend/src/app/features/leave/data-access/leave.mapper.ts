import { LeaveBalanceDto, LeaveRequestDto } from './leave.dto';
import { LeaveBalance, LeaveRequest } from './leave.models';

/**
 * The one place a Decimal string becomes a number (mirrors the backend's `normalizeForAudit`
 * isolation of the same serialization quirk, and `employee.mapper.ts`'s treatment of `salary`).
 * A request that has not been approved has no duration: `null` must stay `null`, not become `0`.
 */
export function toLeaveRequest(dto: LeaveRequestDto): LeaveRequest {
  return {
    id: dto.id,
    employeeId: dto.employeeId,
    leaveTypeId: dto.leaveTypeId,
    startDate: dto.startDate,
    endDate: dto.endDate,
    reason: dto.reason,
    status: dto.status,
    durationDays: dto.durationDays === null ? null : Number(dto.durationDays),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function toLeaveBalance(dto: LeaveBalanceDto): LeaveBalance {
  return {
    id: dto.id,
    employeeId: dto.employeeId,
    leaveTypeId: dto.leaveTypeId,
    year: dto.year,
    entitlement: Number(dto.entitlement),
    consumed: Number(dto.consumed),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}
