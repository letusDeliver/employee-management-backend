import { z } from 'zod';

import registry from '../../docs/openapi.registry.js';
import { bearerAuth } from '../../docs/components/security.js';
import { errorResponse, jsonResponse } from '../../docs/components/responses.js';
import {
  ExitCaseSchema,
  ClearanceItemSchema,
  PaginationMetaSchema,
} from '../../docs/components/schemas.js';
import {
  createExitCaseSchema,
  updateExitCaseSchema,
  separateExitCaseSchema,
  addClearanceItemSchema,
  updateClearanceItemSchema,
  listExitCasesQuerySchema,
} from './exitCase.validation.js';

const TAG = ['Exit Cases'];
const idParam = z.object({
  id: z.uuid().meta({ example: 'b4c5d6e7-f8a9-4b0c-9d1e-2f3a4b5c6d7e' }),
});
const itemParams = z.object({
  id: z.uuid().meta({ example: 'b4c5d6e7-f8a9-4b0c-9d1e-2f3a4b5c6d7e' }),
  itemId: z.uuid().meta({ example: 'a3b4c5d6-e7f8-4a9b-8c0d-1e2f3a4b5c6d' }),
});
const unauthorized = errorResponse('Missing, invalid, or expired access token');
const notFound = errorResponse('No exit case with this id', {
  status: 'error',
  message: 'Exit case not found',
});
const security = [{ [bearerAuth.name]: [] }];

registry.registerPath({
  method: 'post',
  path: '/exit-cases',
  tags: TAG,
  summary: 'Initiate an Exit Case',
  description:
    "Requires 'exitCase:create:own' (an employee initiating their own RESIGNATION - employeeId is ignored) or 'exitCase:create:any' (ADMIN, any type for any employee - employeeId required; TERMINATION needs this). lastWorkingDay is a UTC calendar date that cannot precede today. Creates the default clearance checklist: one ASSET_RETURN item per asset the employee currently holds, plus knowledge transfer, final settlement and system access revocation. At most one open (INITIATED/SEPARATED) case per employee.",
  security,
  request: { body: { content: { 'application/json': { schema: createExitCaseSchema } } } },
  responses: {
    201: jsonResponse('Exit case created (INITIATED) with its clearance items', z.object({ exitCase: ExitCaseSchema })),
    400: errorResponse('Validation failed, employee not found, no linked employee record, or lastWorkingDay in the past'),
    401: unauthorized,
    403: errorResponse('Lacks the permission, or tried to initiate a TERMINATION without exitCase:create:any'),
    409: errorResponse('The employee already has an open exit case', {
      status: 'error',
      message: 'This employee already has an open exit case',
    }),
  },
});

registry.registerPath({
  method: 'get',
  path: '/exit-cases',
  tags: TAG,
  summary: 'List Exit Cases',
  description:
    "Requires 'exitCase:read:any' (ADMIN, all employees) or 'exitCase:read:own'. A caller with only :read:own is automatically scoped to their own employee record. Paginated, filterable (employeeId/type/status), sortable. Rows omit clearanceItems - read one case for its checklist.",
  security,
  request: { query: listExitCasesQuerySchema },
  responses: {
    200: jsonResponse('OK', z.object({ exitCases: z.array(ExitCaseSchema), pagination: PaginationMetaSchema })),
    400: errorResponse('A query parameter failed validation'),
    401: unauthorized,
    403: errorResponse('Caller lacks both exit case read permissions'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/exit-cases/process-due',
  tags: TAG,
  summary: 'Separate every Exit Case whose last working day has arrived',
  description:
    "Requires 'exitCase:manage:any' (ADMIN). There is no scheduler in this project, so the time-based separation trigger is an explicit sweep a future cron can call. Each due INITIATED case is separated in its own transaction; one failing never blocks the others.",
  security,
  responses: {
    200: jsonResponse(
      'Sweep result',
      z.object({
        processed: z.int().meta({ example: 2 }),
        separated: z.array(z.uuid()),
        failed: z.array(z.object({ id: z.uuid(), message: z.string() })),
      }),
    ),
    401: unauthorized,
    403: errorResponse("Caller lacks the 'exitCase:manage:any' permission"),
  },
});

registry.registerPath({
  method: 'get',
  path: '/exit-cases/{id}',
  tags: TAG,
  summary: 'Get one Exit Case with its clearance checklist',
  description:
    "Requires 'exitCase:read:any', or 'exitCase:read:own' and the case must belong to the caller's own employee record.",
  security,
  request: { params: idParam },
  responses: {
    200: jsonResponse('OK', z.object({ exitCase: ExitCaseSchema })),
    401: unauthorized,
    403: errorResponse('Not permitted to view this exit case'),
    404: notFound,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/exit-cases/{id}',
  tags: TAG,
  summary: 'Update an Exit Case',
  description:
    "Requires 'exitCase:manage:any' (ADMIN). Editable while INITIATED or SEPARATED; lastWorkingDay only while INITIATED. A COMPLETED case accepts only eligibleForRehire/rehireNote (a case can complete inside separation, before they were set); a WITHDRAWN case accepts nothing. eligibleForRehire/rehireNote are stored as data only - no hiring code enforces them yet.",
  security,
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: updateExitCaseSchema } } },
  },
  responses: {
    200: jsonResponse('Exit case updated', z.object({ exitCase: ExitCaseSchema })),
    400: errorResponse('Validation failed, or lastWorkingDay precedes the initiation date'),
    401: unauthorized,
    403: errorResponse("Caller lacks the 'exitCase:manage:any' permission"),
    404: notFound,
    409: errorResponse('The case is WITHDRAWN (or COMPLETED, for any field but the rehire fields), or lastWorkingDay changed after INITIATED', {
      status: 'error',
      message: 'lastWorkingDay can only be changed while the exit case is INITIATED',
    }),
  },
});

registry.registerPath({
  method: 'post',
  path: '/exit-cases/{id}/withdraw',
  tags: TAG,
  summary: 'Withdraw an Exit Case',
  description:
    "Requires 'exitCase:manage:any' (ADMIN, either type) or 'exitCase:withdraw:own' (the employee's own RESIGNATION, only before the last working day arrives). Only an INITIATED case can be withdrawn - after separation, reversal is a rehire, not a withdrawal.",
  security,
  request: { params: idParam },
  responses: {
    200: jsonResponse('Exit case withdrawn', z.object({ exitCase: ExitCaseSchema })),
    401: unauthorized,
    403: errorResponse('Not permitted to withdraw this exit case'),
    404: notFound,
    409: errorResponse('Not INITIATED, or the last working day has arrived (own withdrawal)', {
      status: 'error',
      message:
        'Only an INITIATED exit case can be withdrawn - once separated, reversal is a rehire, not a withdrawal',
    }),
  },
});

registry.registerPath({
  method: 'post',
  path: '/exit-cases/{id}/separate',
  tags: TAG,
  summary: 'Separate the employee (invoke Identity offboarding)',
  description:
    "Requires 'exitCase:manage:any' (ADMIN). Allowed only for an INITIATED case whose lastWorkingDay has arrived - never triggered by clearance completion. In one transaction: invokes Identity's unmodified offboarding primitive (soft-delete, plus revocation of the linked account's sessions and refresh tokens), moves the case to SEPARATED, resolves the access-revocation item, and adds ASSET_RETURN items for any newly held assets. Becomes COMPLETED immediately if every item is already resolved. Optional eligibleForRehire/rehireNote may be set now.",
  security,
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: separateExitCaseSchema } } },
  },
  responses: {
    200: jsonResponse('Employee separated', z.object({ exitCase: ExitCaseSchema })),
    400: errorResponse('Validation failed'),
    401: unauthorized,
    403: errorResponse("Caller lacks the 'exitCase:manage:any' permission"),
    404: notFound,
    409: errorResponse('Not INITIATED, or the last working day has not arrived', {
      status: 'error',
      message: 'The last working day (2026-10-31) has not arrived yet',
    }),
  },
});

registry.registerPath({
  method: 'post',
  path: '/exit-cases/{id}/clearance-items',
  tags: TAG,
  summary: 'Add a custom clearance item',
  description:
    "Requires 'exitCase:manage:any' (ADMIN). Adds an OTHER-type item to an INITIATED or SEPARATED case.",
  security,
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: addClearanceItemSchema } } },
  },
  responses: {
    201: jsonResponse('Clearance item created (PENDING)', z.object({ clearanceItem: ClearanceItemSchema })),
    400: errorResponse('Validation failed'),
    401: unauthorized,
    403: errorResponse("Caller lacks the 'exitCase:manage:any' permission"),
    404: notFound,
    409: errorResponse('The case is COMPLETED or WITHDRAWN', {
      status: 'error',
      message: 'Clearance items cannot be added to a COMPLETED exit case',
    }),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/exit-cases/{id}/clearance-items/{itemId}',
  tags: TAG,
  summary: 'Resolve a clearance item (DONE / WAIVED / reopen)',
  description:
    "Requires 'exitCase:manage:any' (ADMIN). WAIVED requires a waivedReason. An ASSET_RETURN item cannot be marked DONE while Asset Management still shows the asset as held by the employee - record the return there, or waive it. The access-revocation item is resolved automatically at separation. When the last item is resolved on a SEPARATED case, the case becomes COMPLETED (reflected in exitCaseStatus).",
  security,
  request: {
    params: itemParams,
    body: { content: { 'application/json': { schema: updateClearanceItemSchema } } },
  },
  responses: {
    200: jsonResponse(
      'Clearance item updated',
      z.object({
        clearanceItem: ClearanceItemSchema,
        exitCaseStatus: z.enum(['INITIATED', 'SEPARATED', 'COMPLETED']).meta({ example: 'SEPARATED' }),
      }),
    ),
    400: errorResponse('Validation failed, or WAIVED without a waivedReason'),
    401: unauthorized,
    403: errorResponse("Caller lacks the 'exitCase:manage:any' permission"),
    404: errorResponse('No such exit case, or the item does not belong to it', {
      status: 'error',
      message: 'Clearance item not found',
    }),
    409: errorResponse('The case is COMPLETED/WITHDRAWN (including one that closed concurrently), the asset is still held, or it is the access-revocation item on an INITIATED case', {
      status: 'error',
      message:
        'This asset is still assigned to the employee - record its return in Asset Management, or waive this item',
    }),
  },
});
