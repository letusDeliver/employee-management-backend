import { z } from 'zod';

export const createEmployeeSchema = z.object({
  userId: z.string().uuid().optional(),
  department: z.string().min(1, 'Department is required'),
  jobTitle: z.string().min(1, 'Job title is required'),
  salary: z.number().positive('Salary must be a positive number'),
  dateOfJoining: z.coerce.date().refine((date) => date <= new Date(), {
    message: 'Date of joining cannot be in the future',
  }),
  managerId: z.string().uuid().optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

const SORTABLE_FIELDS = ['department', 'jobTitle', 'salary', 'dateOfJoining', 'createdAt'];

export const listEmployeesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z
    .string()
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  department: z.string().optional(),
  jobTitle: z.string().optional(),
  managerId: z.string().uuid().optional(),
  sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
