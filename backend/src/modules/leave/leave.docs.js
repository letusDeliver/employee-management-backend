import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import {
  LeaveRequestSchema,
  LeaveBalanceSchema,
  PaginationMetaSchema,
} from '../../docs/components/schemas.js';
import {
  createLeaveRequestSchema,
  rejectLeaveRequestSchema,
  listLeaveRequestsQuerySchema,
  listLeaveBalancesQuerySchema,
  adjustLeaveBalanceSchema,
} from './leave.validation.js';

const REQUEST_TAG = ['Leave Requests'];
const BALANCE_TAG = ['Leave Balances'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6f7a' }),
});

registry.registerPath({
  method: 'post',
  path: '/leave-requests',
  tags: REQUEST_TAG,
  summary: "Apply for leave against the caller's own Employee record",
  description:
    "Requires the 'leaveRequest:create:own' permission (every role). Always resolves to the caller's own Employee record - there is no administrative on-behalf-of creation in this domain. Rejects an overlapping Pending/Approved request for the same employee (docs/domain-leave.md §4).",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createLeaveRequestSchema } } } },
  responses: {
    201: jsonResponse('Leave request created (PENDING)', z.object({ request: LeaveRequestSchema })),
    400: errorResponse('Validation failed, or leaveTypeId is not ACTIVE/does not exist'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'leaveRequest:create:own' permission"),
    409: errorResponse('An overlapping Pending or Approved leave request already exists', {
      status: 'error',
      message: 'This employee already has a pending or approved leave request overlapping these dates',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/leave-requests',
  tags: REQUEST_TAG,
  summary: 'List Leave Requests',
  description:
    "Requires 'leaveRequest:read:any' or 'leaveRequest:read:own'. Diverges from GET /attendance's any-only shape: a caller without ':any' is auto-scoped to their own Employee's requests rather than refused, since viewing your own leave history is a core self-service need. Paginated, filterable (employeeId [':any' only], leaveTypeId, status, dateFrom/dateTo), sortable.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listLeaveRequestsQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ requests: z.array(LeaveRequestSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks both 'leaveRequest:read:any' and 'leaveRequest:read:own'"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/leave-requests/{id}',
  tags: REQUEST_TAG,
  summary: 'Get one Leave Request',
  description:
    "Requires 'leaveRequest:read:any' or 'leaveRequest:read:own' (own record only, mirrors GET /employees/:id's ownership check).",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ request: LeaveRequestSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller lacks permission to view this request'),
    404: errorResponse('No Leave Request with this id', {
      status: 'error',
      message: 'Leave request not found',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/leave-requests/{id}/approve',
  tags: REQUEST_TAG,
  summary: 'Approve a Pending Leave Request',
  description:
    "Requires 'leaveRequest:decide:any' (ADMIN - may decide any request unconditionally) or 'leaveRequest:decide:reports' (MANAGER - only their own direct reports, checked via Employee.managerId). Computes holiday/week-off-excluded duration (ADR-LV04), lazily creates the LeaveBalance if needed (proration on hire year), and rejects if it would drive the balance negative (ADR-LV05, strict no-negative-balance default).",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('Leave request approved', z.object({ request: LeaveRequestSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller cannot decide this request (not the assigned manager, no ADMIN override)'),
    404: errorResponse('No Leave Request with this id', {
      status: 'error',
      message: 'Leave request not found',
    }),
    409: errorResponse('Request is not Pending, or insufficient leave balance', {
      status: 'error',
      message: 'Only a pending leave request can be approved',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/leave-requests/{id}/reject',
  tags: REQUEST_TAG,
  summary: 'Reject a Pending Leave Request',
  description:
    "Requires 'leaveRequest:decide:any' or 'leaveRequest:decide:reports' - same authorization as approve. No balance change.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: rejectLeaveRequestSchema } } },
  },
  responses: {
    200: jsonResponse('Leave request rejected', z.object({ request: LeaveRequestSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller cannot decide this request'),
    404: errorResponse('No Leave Request with this id', {
      status: 'error',
      message: 'Leave request not found',
    }),
    409: errorResponse('Request is not Pending', {
      status: 'error',
      message: 'Only a pending leave request can be rejected',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/leave-requests/{id}/cancel',
  tags: REQUEST_TAG,
  summary: 'Cancel a Pending or future-dated Approved Leave Request',
  description:
    "Requires 'leaveRequest:cancel:own' (the request's own employee) or 'leaveRequest:cancel:any' (ADMIN override). A Pending request cancels with no balance effect. A future-dated Approved request restores the deducted balance. An Approved request that has already started cannot be cancelled retroactively (docs/domain-leave.md §2).",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('Leave request cancelled', z.object({ request: LeaveRequestSchema })),
    400: errorResponse('An approved leave that has already started cannot be cancelled retroactively', {
      status: 'error',
      message: 'An approved leave that has already started cannot be cancelled retroactively',
    }),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller lacks permission to cancel this request'),
    404: errorResponse('No Leave Request with this id', {
      status: 'error',
      message: 'Leave request not found',
    }),
    409: errorResponse('Request is already Rejected or Cancelled', {
      status: 'error',
      message: 'Only a pending or future-dated approved leave request can be cancelled',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/leave-balances',
  tags: BALANCE_TAG,
  summary: 'List Leave Balances',
  description:
    "Requires 'leaveBalance:read:any' or 'leaveBalance:read:own'. Same own-vs-any auto-scoping shape as GET /leave-requests. Paginated, filterable (employeeId [':any' only], leaveTypeId, year), sortable. `remaining` is not stored - compute it client-side as `entitlement - consumed`.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: listLeaveBalancesQuerySchema },
  responses: {
    200: jsonResponse(
      'OK',
      z.object({ balances: z.array(LeaveBalanceSchema), pagination: PaginationMetaSchema }),
    ),
    400: errorResponse('A query parameter failed validation'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks both 'leaveBalance:read:any' and 'leaveBalance:read:own'"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/leave-balances/{id}',
  tags: BALANCE_TAG,
  summary: 'Get one Leave Balance',
  description:
    "Requires 'leaveBalance:read:any' or 'leaveBalance:read:own' (own record only). LeaveBalance rows are created lazily on first need (e.g. on request approval) - there is no way to \"pre-list\" a balance that has never yet been touched.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ balance: LeaveBalanceSchema })),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse('Caller lacks permission to view this balance'),
    404: errorResponse('No Leave Balance with this id', {
      status: 'error',
      message: 'Leave balance not found',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/leave-balances/{id}',
  tags: BALANCE_TAG,
  summary: 'Manually adjust a Leave Balance',
  description:
    "Requires the 'leaveBalance:adjust:any' permission (ADMIN only). The accepted escape hatch (docs/domain-leave.md §10) for the strict no-negative-balance default - directly overrides entitlement and/or consumed. Always audit-logged.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: adjustLeaveBalanceSchema } } },
  },
  responses: {
    200: jsonResponse('Leave balance adjusted', z.object({ balance: LeaveBalanceSchema })),
    400: errorResponse('Validation failed'),
    401: errorResponse('Missing, invalid, or expired access token'),
    403: errorResponse("Caller lacks the 'leaveBalance:adjust:any' permission"),
    404: errorResponse('No Leave Balance with this id', {
      status: 'error',
      message: 'Leave balance not found',
    }),
  },
});
