import { LeaveBalanceDto, LeaveRequestDto } from './leave.dto';
import { toLeaveBalance, toLeaveRequest } from './leave.mapper';

const requestDto = (overrides: Partial<LeaveRequestDto> = {}): LeaveRequestDto => ({
  id: 'r-1',
  employeeId: 'e-1',
  leaveTypeId: 't-1',
  startDate: '2026-11-02T00:00:00.000Z',
  endDate: '2026-11-06T00:00:00.000Z',
  reason: 'Family',
  status: 'APPROVED',
  durationDays: '4',
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-02T09:00:00.000Z',
  ...overrides,
});

describe('toLeaveRequest', () => {
  it('turns the Decimal duration string into a number and leaves the dates as the API sent them', () => {
    const request = toLeaveRequest(requestDto({ durationDays: '4' }));

    expect(request.durationDays).toBe(4);
    expect(request.startDate).toBe('2026-11-02T00:00:00.000Z');
    expect(request.endDate).toBe('2026-11-06T00:00:00.000Z');
  });

  it('keeps a missing duration null - it must not become 0 (a pending request has no duration yet)', () => {
    expect(toLeaveRequest(requestDto({ status: 'PENDING', durationDays: null })).durationDays).toBeNull();
  });

  it('keeps a fractional duration', () => {
    expect(toLeaveRequest(requestDto({ durationDays: '2.5' })).durationDays).toBe(2.5);
  });

  it('passes every other field through unchanged', () => {
    const dto = requestDto({ reason: null, status: 'REJECTED', durationDays: null });

    expect(toLeaveRequest(dto)).toEqual({ ...dto });
  });
});

describe('toLeaveBalance', () => {
  const dto: LeaveBalanceDto = {
    id: 'b-1',
    employeeId: 'e-1',
    leaveTypeId: 't-1',
    year: 2026,
    entitlement: '9.07',
    consumed: '4',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-02T09:00:00.000Z',
  };

  it('turns both Decimal strings into numbers, fractions included', () => {
    const balance = toLeaveBalance(dto);

    expect(balance.entitlement).toBe(9.07);
    expect(balance.consumed).toBe(4);
    expect(typeof balance.entitlement).toBe('number');
  });

  it('keeps the year a number and the ids as they were', () => {
    const balance = toLeaveBalance(dto);

    expect(balance.year).toBe(2026);
    expect(balance.leaveTypeId).toBe('t-1');
  });
});
