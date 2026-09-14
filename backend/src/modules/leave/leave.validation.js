import { z } from 'zod';

export const createLeaveRequestSchema = z
  .object({
    leaveTypeId: z.string().uuid().meta({ example: '5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7b' }),
    startDate: z.coerce.date().meta({ example: '2026-10-05' }),
    endDate: z.coerce.date().meta({ example: '2026-10-09' }),
    reason: z.string().trim().min(1).optional().meta({ example: 'Family function' }),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: 'startDate cannot be after endDate',
    path: ['endDate'],
  })
  .meta({ id: 'CreateLeaveRequestRequest' });

export const rejectLeaveRequestSchema = z
  .object({
    reason: z.string().trim().min(1).optional().meta({ example: 'Insufficient coverage that week' }),
  })
  .meta({ id: 'RejectLeaveRequestRequest' });

const LEAVE_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const LEAVE_REQUEST_SORTABLE_FIELDS = ['startDate', 'endDate', 'status', 'createdAt'];

export const listLeaveRequestsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    // Only honored when the caller holds leaveRequest:read:any - a caller
    // scoped to :read:own has this silently overridden to their own
    // Employee id in the service layer (see leave.service.js's
    // listLeaveRequests).
    employeeId: z.string().uuid().optional().meta({ example: null }),
    leaveTypeId: z.string().uuid().optional().meta({ example: null }),
    status: z.enum(LEAVE_REQUEST_STATUSES).optional().meta({ example: null }),
    dateFrom: z.coerce.date().optional().meta({ example: null }),
    dateTo: z.coerce.date().optional().meta({ example: null }),
    sortBy: z.enum(LEAVE_REQUEST_SORTABLE_FIELDS).default('startDate'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListLeaveRequestsQuery' });

const LEAVE_BALANCE_SORTABLE_FIELDS = ['year', 'entitlement', 'consumed', 'createdAt'];

export const listLeaveBalancesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    employeeId: z.string().uuid().optional().meta({ example: null }),
    leaveTypeId: z.string().uuid().optional().meta({ example: null }),
    year: z.coerce.number().int().optional().meta({ example: null }),
    sortBy: z.enum(LEAVE_BALANCE_SORTABLE_FIELDS).default('year'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListLeaveBalancesQuery' });

// ADMIN-only manual override (docs/domain-leave.md §10's named escape
// hatch for the strict no-negative-balance default) - both optional so a
// caller can adjust just one field; at least one must be present.
export const adjustLeaveBalanceSchema = z
  .object({
    entitlement: z.number().min(0).optional().meta({ example: 20 }),
    consumed: z.number().min(0).optional().meta({ example: 5 }),
  })
  .refine((data) => data.entitlement !== undefined || data.consumed !== undefined, {
    message: 'At least one of entitlement or consumed must be provided',
  })
  .meta({ id: 'AdjustLeaveBalanceRequest' });
