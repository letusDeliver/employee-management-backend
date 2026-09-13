import { z } from 'zod';

// A generous sanity ceiling, not a real business constraint - catches
// garbled/mistyped input (an extra digit, a pasted-in-error value), not
// intended to ever constrain a genuine salary.
const MAX_SALARY = 100_000_000;

// Closed, code-defined enum, not a managed aggregate like Branch/Department/
// Designation (docs/domain-employment-type.md, ADR-ET01) - kept here as the
// single source of truth for the valid value set, mirrored 1:1 against the
// Prisma EmploymentType enum, since there is no repository/service to own it.
const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];

export const createEmployeeSchema = z
  .object({
    userId: z.string().uuid().optional().meta({ example: '5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7b' }),
    // Mandatory, unlike branchId below - docs/domain-department.md ADR-D07:
    // the schema's original department column was itself always required,
    // so the FK that replaced it preserves that mandatoriness rather than
    // loosening it. Validated for existence+ACTIVE status in the service
    // (departmentService.assertDepartmentAssignable), not just FK-exists.
    departmentId: z.string().uuid().meta({ example: '5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7c' }),
    // Mandatory, same reasoning as departmentId above - docs/domain-designation.md
    // ADR-DS07: the schema's original jobTitle column was itself always
    // required, so the FK that replaced it preserves that mandatoriness.
    // Validated for existence+ACTIVE status in the service
    // (designationService.assertDesignationAssignable), not just FK-exists.
    designationId: z.string().uuid().meta({ example: '5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7d' }),
    // Mandatory, no @default at the schema level (docs/domain-employment-type.md
    // ADR-ET02: "no unknown state") - unlike departmentId/designationId, this
    // is a plain enum value, not an FK, so there is no existence/status check
    // to perform in the service; Zod's enum validation is the only guard needed.
    employmentType: z.enum(EMPLOYMENT_TYPES).meta({ example: 'FULL_TIME' }),
    salary: z
      .number()
      .positive('Salary must be a positive number')
      .max(MAX_SALARY, 'Salary seems unreasonably high')
      .meta({ example: 85000 }),
    dateOfJoining: z.coerce
      .date()
      .refine((date) => date <= new Date(), {
        message: 'Date of joining cannot be in the future',
      })
      .meta({ example: '2024-01-15' }),
    managerId: z.string().uuid().optional().meta({ example: null }),
    branchId: z.string().uuid().optional().meta({ example: null }),
  })
  .meta({ id: 'CreateEmployeeRequest' });

export const updateEmployeeSchema = createEmployeeSchema
  .partial()
  .extend({
    // Deliberately widened beyond createEmployeeSchema's own userId/managerId/
    // branchId (.optional() only, no .nullable()): a PATCH needs a way to
    // express "clear this link", which omitting the key can never do - the
    // key just wouldn't be present in the JSON body, which means "leave it
    // as-is", not "unset it". Explicit null is that signal.
    userId: z.string().uuid().nullable().optional().meta({ example: null }),
    managerId: z.string().uuid().nullable().optional().meta({ example: null }),
    branchId: z.string().uuid().nullable().optional().meta({ example: null }),
  })
  .meta({ id: 'UpdateEmployeeRequest' });

const SORTABLE_FIELDS = [
  'department',
  'designation',
  'employmentType',
  'salary',
  'dateOfJoining',
  'createdAt',
];

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
        description:
          "Matches the linked Department's name, the linked Designation's name, and the linked User's name/email",
      }),
    departmentId: z.string().uuid().optional().meta({ example: null }),
    designationId: z.string().uuid().optional().meta({ example: null }),
    employmentType: z.enum(EMPLOYMENT_TYPES).optional().meta({ example: null }),
    managerId: z.string().uuid().optional().meta({ example: null }),
    sortBy: z.enum(SORTABLE_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .meta({ id: 'ListEmployeesQuery' });
