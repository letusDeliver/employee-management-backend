import { z } from 'zod';

// Response-only schemas - this API has no Zod schema for its outputs, only
// its inputs (see planning/feature-13-swagger-api-docs.md, "Zod
// Integration"). Hand-written here to mirror the real Prisma models and
// the real sanitize/serialize behavior, not just the Prisma schema fields:
//
// - EmployeeSchema.salary is a string, not a number - Prisma's Decimal
//   serializes to a JSON string over the wire (the same fact
//   normalizeForAudit() in employee.service.js was built around).
// - UserPublicSchema includes `roles` - sanitizeUser() (user.service.js)
//   always attaches this array, it is not a raw Prisma User column.
// - `password` never appears - sanitizeUser() strips it before any
//   response is built.

export const UserPublicSchema = z
  .object({
    id: z.uuid().meta({ example: '5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7b' }),
    email: z.email().meta({ example: 'jane@example.com' }),
    name: z.string().meta({ example: 'Jane Doe' }),
    profileImageUrl: z.url().nullable().meta({ example: null }),
    profileImagePublicId: z.string().nullable().meta({ example: null }),
    roles: z.array(z.string()).meta({ example: ['EMPLOYEE'] }),
    createdAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
  })
  .meta({ id: 'User', description: 'A sanitized User record - password is never included' });

export const EmployeeSchema = z
  .object({
    id: z.uuid().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    userId: z.uuid().nullable().meta({ example: null }),
    department: z.string().meta({ example: 'Engineering' }),
    jobTitle: z.string().meta({ example: 'Backend Engineer' }),
    salary: z.string().meta({
      description: 'Prisma Decimal - serializes as a string, not a number',
      example: '85000.00',
    }),
    dateOfJoining: z.iso.datetime().meta({ example: '2024-01-15T00:00:00.000Z' }),
    managerId: z.uuid().nullable().meta({ example: null }),
    deletedAt: z.iso.datetime().nullable().meta({ example: null }),
    createdAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
  })
  .meta({ id: 'Employee' });

export const EmployeeDocumentSchema = z
  .object({
    id: z.uuid().meta({ example: 'f1e2d3c4-b5a6-4978-8f6e-5d4c3b2a1908' }),
    employeeId: z.uuid().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    url: z
      .url()
      .meta({
        example: 'https://res.cloudinary.com/dhfxv7gdp/raw/upload/v1/emp-mgmt/documents/f1e2.pdf',
      }),
    publicId: z.string().meta({ example: 'emp-mgmt/production/employees/a1b2/documents/f1e2' }),
    resourceType: z
      .string()
      .meta({
        description: "Cloudinary's own classification (e.g. 'image', 'raw')",
        example: 'raw',
      }),
    fileName: z.string().meta({ example: 'resume.pdf' }),
    mimeType: z.string().meta({ example: 'application/pdf' }),
    size: z.int().meta({ example: 245678 }),
    uploadedBy: z.uuid().nullable().meta({ example: null }),
    createdAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
  })
  .meta({ id: 'EmployeeDocument' });

export const PaginationMetaSchema = z
  .object({
    page: z.int().meta({ example: 1 }),
    limit: z.int().meta({ example: 10 }),
    total: z.int().meta({ example: 42 }),
    totalPages: z.int().meta({ example: 5 }),
  })
  .meta({ id: 'PaginationMeta' });
