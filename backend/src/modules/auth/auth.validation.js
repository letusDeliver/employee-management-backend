import { z } from 'zod';

export const registerSchema = z
  .object({
    email: z.string().email().meta({ example: 'jane@example.com' }),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .meta({ example: 'supersecret123' }),
    name: z.string().min(1, 'Name is required').meta({ example: 'Jane Doe' }),
  })
  .meta({ id: 'RegisterRequest', description: 'New account registration payload' });

export const loginSchema = z
  .object({
    email: z.string().email().meta({ example: 'jane@example.com' }),
    password: z.string().min(1, 'Password is required').meta({ example: 'supersecret123' }),
  })
  .meta({ id: 'LoginRequest' });
