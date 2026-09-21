import { z } from 'zod';

const TYPES = ['RESIGNATION', 'TERMINATION'];
const STATUSES = ['INITIATED', 'SEPARATED', 'COMPLETED', 'WITHDRAWN'];

// employeeId is optional here on purpose - required in the body only for a
// caller initiating on behalf of someone else (exitCase:create:any); ignored
// for a self-initiating caller (exitCase:create:own), whose own linked
// Employee is resolved server-side instead. See exitCase.service.js's
// resolveEmployeeId.
export const createExitCaseSchema = z
  .object({
    employeeId: z.string().uuid().optional().meta({ example: null }),
    type: z.enum(TYPES).meta({
      example: 'RESIGNATION',
      description: 'TERMINATION requires exitCase:create:any (ADMIN)',
    }),
    lastWorkingDay: z.iso.date().meta({
      example: '2026-10-31',
      description: 'A calendar date (UTC), set explicitly per case; cannot precede the initiation date',
    }),
    reason: z.string().trim().min(1).optional().meta({ example: 'Relocating to another city' }),
  })
  .meta({ id: 'CreateExitCaseRequest' });

export const updateExitCaseSchema = z
  .object({
    lastWorkingDay: z.iso.date().optional().meta({
      example: '2026-11-15',
      description: 'Only changeable while the case is INITIATED',
    }),
    reason: z.string().trim().min(1).nullable().optional().meta({ example: null }),
    eligibleForRehire: z.boolean().nullable().optional().meta({ example: true }),
    rehireNote: z.string().trim().min(1).nullable().optional().meta({ example: null }),
  })
  .meta({ id: 'UpdateExitCaseRequest' });

// The body is optional in practice (separating needs nothing), so it
// defaults to {} instead of failing when a client sends no body at all.
export const separateExitCaseSchema = z
  .object({
    eligibleForRehire: z.boolean().optional().meta({ example: true }),
    rehireNote: z.string().trim().min(1).optional().meta({ example: null }),
  })
  .prefault({})
  .meta({ id: 'SeparateExitCaseRequest' });

export const addClearanceItemSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').meta({ example: 'Return company ID card' }),
  })
  .meta({ id: 'AddClearanceItemRequest' });

export const updateClearanceItemSchema = z
  .object({
    status: z.enum(['PENDING', 'DONE', 'WAIVED']).meta({ example: 'DONE' }),
    waivedReason: z.string().trim().min(1).optional().meta({
      example: 'Laptop reported lost',
      description: 'Required when status is WAIVED; ignored otherwise',
    }),
  })
  .meta({ id: 'UpdateClearanceItemRequest' });

const SORTABLE_FIELDS = ['lastWorkingDay', 'initiatedAt', 'status', 'createdAt'];

export const listExitCasesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    employeeId: z.string().uuid().optional().meta({ example: null }),
    type: z.enum(TYPES).optional().meta({ example: null }),
    status: z.enum(STATUSES).optional().meta({ example: null }),
    sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListExitCasesQuery' });
