import { z } from 'zod';

const STATUSES = ['ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'WITHDRAWN'];

// employeeId is optional here on purpose - required in the body only for
// an ADMIN/HR caller (enrollment:create:any, enrolling someone else);
// ignored/forbidden for a self-enrolling caller (enrollment:create:own),
// whose own linked Employee is resolved server-side instead. See
// enrollment.service.js's resolveEmployeeId.
export const createEnrollmentSchema = z
  .object({
    employeeId: z.string().uuid().optional().meta({ example: null }),
    trainingProgramId: z.string().uuid().meta({ example: '5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7c' }),
  })
  .meta({ id: 'CreateEnrollmentRequest' });

// ENROLLED is excluded - it's the default starting value, not a settable
// target. WITHDRAWN is reachable by enrollment:withdraw:own as well as
// enrollment:manage:any; IN_PROGRESS/COMPLETED/FAILED require manage:any.
export const updateEnrollmentStatusSchema = z
  .object({
    status: z.enum(['IN_PROGRESS', 'COMPLETED', 'FAILED', 'WITHDRAWN']).meta({
      example: 'IN_PROGRESS',
    }),
    score: z.number().int().min(0).max(100).optional().meta({ example: 92 }),
  })
  .meta({ id: 'UpdateEnrollmentStatusRequest' });

const SORTABLE_FIELDS = ['status', 'completedAt', 'createdAt'];

export const listEnrollmentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    employeeId: z.string().uuid().optional().meta({ example: null }),
    trainingProgramId: z.string().uuid().optional().meta({ example: null }),
    status: z.enum(STATUSES).optional().meta({ example: null }),
    sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListEnrollmentsQuery' });

export const trainingComplianceQuerySchema = z
  .object({
    employeeId: z.string().uuid().meta({ example: '5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7d' }),
    trainingProgramId: z.string().uuid().optional().meta({
      example: null,
      description: 'Omit for a bulk report across every mandatory program',
    }),
  })
  .meta({ id: 'TrainingComplianceQuery' });
