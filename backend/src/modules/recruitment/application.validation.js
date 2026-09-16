import { z } from 'zod';

const APPLICATION_STATUSES = [
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
];
const RECOMMENDATIONS = ['STRONG_YES', 'YES', 'NO', 'STRONG_NO'];

export const createApplicationSchema = z
  .object({
    candidateId: z.string().uuid().meta({ example: '5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a70' }),
    jobRequisitionId: z.string().uuid().meta({ example: '5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a71' }),
  })
  .meta({ id: 'CreateApplicationRequest' });

// HIRED is deliberately excluded - only reachable through
// POST /applications/:id/hire, so its onboarding side-effect always fires.
export const updateApplicationStatusSchema = z
  .object({
    status: z
      .enum(['SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'])
      .meta({ example: 'SCREENING' }),
  })
  .meta({ id: 'UpdateApplicationStatusRequest' });

const SORTABLE_FIELDS = ['status', 'createdAt'];

export const listApplicationsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    candidateId: z.string().uuid().optional().meta({ example: null }),
    jobRequisitionId: z.string().uuid().optional().meta({ example: null }),
    status: z.enum(APPLICATION_STATUSES).optional().meta({ example: null }),
    sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListApplicationsQuery' });

export const createInterviewSchema = z
  .object({
    interviewerId: z.string().uuid().meta({ example: '5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a72' }),
    scheduledAt: z.coerce.date().meta({ example: '2026-10-01T14:00:00.000Z' }),
  })
  .meta({ id: 'CreateInterviewRequest' });

export const updateInterviewSchema = z
  .object({
    feedback: z.string().trim().min(1).optional().meta({ example: 'Strong technical fundamentals' }),
    recommendation: z.enum(RECOMMENDATIONS).optional().meta({ example: 'YES' }),
    scheduledAt: z.coerce.date().optional().meta({ example: '2026-10-01T14:00:00.000Z' }),
  })
  .meta({ id: 'UpdateInterviewRequest' });

const MAX_SALARY = 100_000_000;

export const createOfferSchema = z
  .object({
    salary: z.number().positive('Salary must be a positive number').max(MAX_SALARY).meta({
      example: 95000,
    }),
    startDate: z.coerce.date().meta({ example: '2026-11-01' }),
  })
  .meta({ id: 'CreateOfferRequest' });

// dateOfJoining is deliberately not accepted here - it's derived from the
// Application's Accepted Offer's own startDate, avoiding a second value
// that could disagree with the offer the candidate actually accepted.
export const hireApplicationSchema = z
  .object({
    managerId: z.string().uuid().optional().meta({ example: null }),
    shiftId: z.string().uuid().optional().meta({ example: null }),
    provisionAccess: z.boolean().default(false).meta({
      example: false,
      description: 'Explicit opt-in to create/link a User for this hire (default: no access)',
    }),
    initialPassword: z
      .string()
      .min(8, 'initialPassword must be at least 8 characters')
      .optional()
      .meta({
        example: null,
        description: 'Required only when provisionAccess is true and no User exists for the candidate’s email yet',
      }),
  })
  .meta({ id: 'HireApplicationRequest' });
