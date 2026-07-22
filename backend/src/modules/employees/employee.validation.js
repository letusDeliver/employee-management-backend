import { z } from 'zod';

export const createEmployeeSchema = z
  .object({
    userId: z.string().uuid().optional().meta({ example: '5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7b' }),
    department: z.string().min(1, 'Department is required').meta({ example: 'Engineering' }),
    jobTitle: z.string().min(1, 'Job title is required').meta({ example: 'Backend Engineer' }),
    salary: z.number().positive('Salary must be a positive number').meta({ example: 85000 }),
    dateOfJoining: z.coerce
      .date()
      .refine((date) => date <= new Date(), {
        message: 'Date of joining cannot be in the future',
      })
      .meta({ example: '2024-01-15' }),
    managerId: z.string().uuid().optional().meta({ example: null }),
  })
  .meta({ id: 'CreateEmployeeRequest' });

export const updateEmployeeSchema = createEmployeeSchema
  .partial()
  .meta({ id: 'UpdateEmployeeRequest' });

const SORTABLE_FIELDS = ['department', 'jobTitle', 'salary', 'dateOfJoining', 'createdAt'];

export const listEmployeesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).default(10).meta({ example: 10 }),
    search: z
      .string()
      .optional()
      .transform((value) => (value === '' ? undefined : value))
      .meta({
        example: 'jane',
        description: "Matches department, jobTitle, and the linked User's name/email",
      }),
    department: z.string().optional().meta({ example: 'Engineering' }),
    jobTitle: z.string().optional().meta({ example: 'Backend Engineer' }),
    managerId: z.string().uuid().optional().meta({ example: null }),
    sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListEmployeesQuery' });
