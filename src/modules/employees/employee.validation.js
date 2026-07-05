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
