import { z } from 'zod';

const RATINGS = [
  'OUTSTANDING',
  'EXCEEDS_EXPECTATIONS',
  'MEETS_EXPECTATIONS',
  'BELOW_EXPECTATIONS',
  'UNSATISFACTORY',
];

export const createPerformanceReviewSchema = z
  .object({
    employeeId: z.string().uuid().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    reviewCycleId: z.string().uuid().meta({ example: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6f' }),
    // Only honored for a caller with performanceReview:create:any, and only
    // when the target employee has no manager (Employee.managerId is
    // null) - a MANAGER acting via :create:reports always has this
    // resolved from Employee.managerId instead, and any value they supply
    // here is ignored. See performance.service.js's createPerformanceReview.
    reviewerId: z.string().uuid().optional().meta({ example: null }),
  })
  .meta({ id: 'CreatePerformanceReviewRequest' });

export const updatePerformanceReviewSchema = z
  .object({
    rating: z.enum(RATINGS).optional().meta({ example: 'MEETS_EXPECTATIONS' }),
    managerComments: z.string().trim().min(1).optional().meta({
      example: 'Consistently meets deadlines and collaborates well with the team.',
    }),
  })
  .refine((data) => data.rating !== undefined || data.managerComments !== undefined, {
    message: 'At least one of rating or managerComments must be provided',
  })
  .meta({ id: 'UpdatePerformanceReviewRequest' });

export const selfAssessmentSchema = z
  .object({
    selfComments: z.string().trim().min(1, 'selfComments is required').meta({
      example: 'I delivered the Q2 migration project ahead of schedule.',
    }),
  })
  .meta({ id: 'SelfAssessmentRequest' });

export const addAddendumSchema = z
  .object({
    comment: z.string().trim().min(1, 'comment is required').meta({
      example: 'Follow-up: employee completed the agreed training in July.',
    }),
  })
  .meta({ id: 'AddAddendumRequest' });

const STATUSES = ['DRAFT', 'SUBMITTED', 'ACKNOWLEDGED'];
const SORTABLE_FIELDS = ['createdAt', 'submittedAt', 'acknowledgedAt', 'status'];

export const listPerformanceReviewsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    // Only honored for a caller with performanceReview:read:any - silently
    // overridden to the caller's own scope(s) otherwise (see
    // performance.service.js's listPerformanceReviews).
    employeeId: z.string().uuid().optional().meta({ example: null }),
    reviewCycleId: z.string().uuid().optional().meta({ example: null }),
    status: z.enum(STATUSES).optional().meta({ example: null }),
    sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListPerformanceReviewsQuery' });
