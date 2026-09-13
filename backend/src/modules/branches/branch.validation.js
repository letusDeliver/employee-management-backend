import { z } from 'zod';

export const createBranchSchema = z
  .object({
    name: z.string().trim().min(1, 'Branch name is required').meta({ example: 'Bengaluru HQ' }),
    code: z
      .string()
      .trim()
      .min(1)
      .optional()
      .meta({ example: 'BLR-01', description: 'Optional, but unique when provided' }),
    // Optional (docs/domain-holiday-calendar.md, ADR-HC03) - validated for
    // existence+ACTIVE status in the service
    // (holidayCalendarService.assertHolidayCalendarAssignable), same pattern
    // as branchId/departmentId/designationId on Employee.
    holidayCalendarId: z.string().uuid().optional().meta({ example: null }),
  })
  .meta({ id: 'CreateBranchRequest' });

export const updateBranchSchema = z
  .object({
    name: z.string().trim().min(1, 'Branch name is required').optional().meta({
      example: 'Bengaluru HQ',
    }),
    code: z.string().trim().min(1).nullable().optional().meta({ example: 'BLR-01' }),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().meta({ example: 'INACTIVE' }),
    // Nullable, unlike createBranchSchema's own .optional() only - a PATCH
    // needs a way to express "unassign this calendar", same widening
    // Employee's userId/managerId/branchId already get.
    holidayCalendarId: z.string().uuid().nullable().optional().meta({ example: null }),
  })
  .meta({ id: 'UpdateBranchRequest' });

const SORTABLE_FIELDS = ['name', 'code', 'status', 'createdAt'];

export const listBranchesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    search: z
      .string()
      .optional()
      .transform((value) => (value === '' ? undefined : value))
      .meta({ example: 'bengaluru', description: 'Matches name and code' }),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().meta({ example: 'ACTIVE' }),
    sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListBranchesQuery' });
