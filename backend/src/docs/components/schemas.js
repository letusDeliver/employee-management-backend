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
// - AuthenticatedUserSchema additionally includes `permissions` -
//   attachPermissions() (user.service.js) attaches this only for the
//   three endpoints that authenticate the caller (register, login,
//   /auth/me), NOT for GET /users or the profile-picture endpoints,
//   which use the plain UserPublicSchema without it. Keeping these as
//   two schemas (rather than adding `permissions` to UserPublicSchema
//   itself) is deliberate - the field genuinely isn't present on every
//   response that shape backs, and this API's docs commit to only
//   documenting real, observed behavior.

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

export const AuthenticatedUserSchema = UserPublicSchema.extend({
  permissions: z.array(z.string()).meta({ example: ['employee:read:own'] }),
}).meta({
  id: 'AuthenticatedUser',
  description:
    'A sanitized User record with resolved permission keys - only returned by endpoints that authenticate the caller (register, login, /auth/me).',
});

export const EmployeeSchema = z
  .object({
    id: z.uuid().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    userId: z.uuid().nullable().meta({ example: null }),
    departmentId: z.uuid().meta({ example: 'b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e' }),
    designationId: z.uuid().meta({ example: 'e1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5f' }),
    employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']).meta({
      example: 'FULL_TIME',
    }),
    salary: z.string().meta({
      description: 'Prisma Decimal - serializes as a string, not a number',
      example: '85000.00',
    }),
    dateOfJoining: z.iso.datetime().meta({ example: '2024-01-15T00:00:00.000Z' }),
    managerId: z.uuid().nullable().meta({ example: null }),
    branchId: z.uuid().nullable().meta({ example: null }),
    shiftId: z.uuid().nullable().meta({ example: null }),
    deletedAt: z.iso.datetime().nullable().meta({ example: null }),
    createdAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
  })
  .meta({ id: 'Employee' });

export const BranchSchema = z
  .object({
    id: z.uuid().meta({ example: 'b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    name: z.string().meta({ example: 'Bengaluru HQ' }),
    code: z.string().nullable().meta({ example: 'BLR-01' }),
    status: z.enum(['ACTIVE', 'INACTIVE']).meta({ example: 'ACTIVE' }),
    holidayCalendarId: z.uuid().nullable().meta({ example: null }),
    createdAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
  })
  .meta({ id: 'Branch' });

export const DepartmentSchema = z
  .object({
    id: z.uuid().meta({ example: 'd1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    name: z.string().meta({ example: 'Engineering' }),
    code: z.string().nullable().meta({ example: 'ENG' }),
    status: z.enum(['ACTIVE', 'INACTIVE']).meta({ example: 'ACTIVE' }),
    createdAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
  })
  .meta({ id: 'Department' });

export const DesignationSchema = z
  .object({
    id: z.uuid().meta({ example: 'e1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    name: z.string().meta({ example: 'Backend Engineer' }),
    code: z.string().nullable().meta({ example: 'SWE' }),
    status: z.enum(['ACTIVE', 'INACTIVE']).meta({ example: 'ACTIVE' }),
    createdAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
  })
  .meta({ id: 'Designation' });

export const HolidayCalendarSchema = z
  .object({
    id: z.uuid().meta({ example: 'f1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    name: z.string().meta({ example: 'India Public Holidays' }),
    status: z.enum(['ACTIVE', 'INACTIVE']).meta({ example: 'ACTIVE' }),
    createdAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
  })
  .meta({ id: 'HolidayCalendar' });

export const HolidaySchema = z
  .object({
    id: z.uuid().meta({ example: 'a9b8c7d6-e5f4-4a3b-8c1d-0e9f8a7b6c5d' }),
    holidayCalendarId: z.uuid().meta({ example: 'f1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    date: z.iso.datetime().meta({ example: '2026-08-15T00:00:00.000Z' }),
    name: z.string().meta({ example: 'Independence Day' }),
    isOptional: z.boolean().meta({ example: false }),
    createdAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
  })
  .meta({ id: 'Holiday' });

export const ShiftSchema = z
  .object({
    id: z.uuid().meta({ example: 'a9b8c7d6-e5f4-4a3b-8c1d-0e9f8a7b6c5e' }),
    name: z.string().meta({ example: 'Day Shift 9-6' }),
    startTime: z.string().meta({ description: '24-hour "HH:mm"', example: '09:00' }),
    endTime: z.string().meta({ description: '24-hour "HH:mm"', example: '18:00' }),
    workingDays: z
      .array(z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']))
      .meta({ example: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] }),
    status: z.enum(['ACTIVE', 'INACTIVE']).meta({ example: 'ACTIVE' }),
    createdAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
  })
  .meta({ id: 'Shift' });

export const AttendanceRecordSchema = z
  .object({
    id: z.uuid().meta({ example: 'c9b8a7d6-e5f4-4a3b-8c1d-0e9f8a7b6c5f' }),
    employeeId: z.uuid().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    date: z.iso.datetime().meta({ example: '2026-09-15T00:00:00.000Z' }),
    checkIn: z.iso.datetime().nullable().meta({ example: '2026-09-15T09:05:00.000Z' }),
    checkOut: z.iso.datetime().nullable().meta({ example: '2026-09-15T18:02:00.000Z' }),
    isHalfDay: z.boolean().meta({ example: false }),
    createdAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
  })
  .meta({ id: 'AttendanceRecord' });

export const EffectiveStatusSchema = z
  .object({
    employeeId: z.uuid().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    date: z.iso.datetime().meta({ example: '2026-09-15T00:00:00.000Z' }),
    status: z.enum(['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'HOLIDAY', 'WEEK_OFF', 'ON_LEAVE']).meta({
      description: 'Computed on read (ADR-AT03), never stored',
      example: 'PRESENT',
    }),
    record: AttendanceRecordSchema.nullable().meta({
      description: 'The raw AttendanceRecord this status was derived from, if one exists',
      example: null,
    }),
  })
  .meta({ id: 'EffectiveStatus' });

export const LeaveTypeSchema = z
  .object({
    id: z.uuid().meta({ example: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6f' }),
    name: z.string().meta({ example: 'Annual Leave' }),
    defaultAnnualEntitlement: z.int().meta({ example: 18 }),
    isPaid: z.boolean().meta({ example: true }),
    status: z.enum(['ACTIVE', 'INACTIVE']).meta({ example: 'ACTIVE' }),
    createdAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
  })
  .meta({ id: 'LeaveType' });

export const LeaveRequestSchema = z
  .object({
    id: z.uuid().meta({ example: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6f7a' }),
    employeeId: z.uuid().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    leaveTypeId: z.uuid().meta({ example: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6f' }),
    startDate: z.iso.datetime().meta({ example: '2026-10-05T00:00:00.000Z' }),
    endDate: z.iso.datetime().meta({ example: '2026-10-09T00:00:00.000Z' }),
    reason: z.string().nullable().meta({ example: 'Family function' }),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).meta({ example: 'PENDING' }),
    durationDays: z.string().nullable().meta({
      description: 'Prisma Decimal - serializes as a string. Set only once APPROVED.',
      example: null,
    }),
    createdAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
  })
  .meta({ id: 'LeaveRequest' });

export const LeaveBalanceSchema = z
  .object({
    id: z.uuid().meta({ example: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6f7a8b' }),
    employeeId: z.uuid().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    leaveTypeId: z.uuid().meta({ example: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6f' }),
    year: z.int().meta({ example: 2026 }),
    entitlement: z.string().meta({ description: 'Prisma Decimal - serializes as a string', example: '18' }),
    consumed: z.string().meta({ description: 'Prisma Decimal - serializes as a string', example: '5' }),
    createdAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-07-01T10:00:00.000Z' }),
  })
  .meta({ id: 'LeaveBalance' });

export const PayrollRunSchema = z
  .object({
    id: z.uuid().meta({ example: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6f7a8b9c' }),
    periodMonth: z.int().meta({ example: 9 }),
    periodYear: z.int().meta({ example: 2026 }),
    status: z.enum(['DRAFT', 'PROCESSING', 'FINALIZED', 'PAID']).meta({ example: 'DRAFT' }),
    payslipCount: z.int().optional().meta({
      description: 'Only present on GET /payroll-runs/:id - the number of Payslips generated so far',
      example: 30,
    }),
    createdAt: z.iso.datetime().meta({ example: '2026-09-15T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-09-15T10:00:00.000Z' }),
  })
  .meta({ id: 'PayrollRun' });

export const PayslipLineItemSchema = z
  .object({
    id: z.uuid().meta({ example: 'f6a7b8c9-d0e1-4f2a-3b4c-5d6f7a8b9c0d' }),
    type: z.enum(['EARNING', 'DEDUCTION']).meta({ example: 'EARNING' }),
    label: z.string().meta({ example: 'Base Salary' }),
    amount: z.string().meta({ description: 'Prisma Decimal - serializes as a string', example: '50000' }),
    createdAt: z.iso.datetime().meta({ example: '2026-09-15T10:00:00.000Z' }),
  })
  .meta({ id: 'PayslipLineItem' });

export const PayslipSchema = z
  .object({
    id: z.uuid().meta({ example: 'a7b8c9d0-e1f2-4a3b-4c5d-6f7a8b9c0d1e' }),
    payrollRunId: z.uuid().meta({ example: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6f7a8b9c' }),
    employeeId: z.uuid().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    periodMonth: z.int().meta({ example: 9 }),
    periodYear: z.int().meta({ example: 2026 }),
    employeeName: z.string().nullable().meta({
      description: 'Snapshot of Employee.user.name at generation time - null if no User is linked',
      example: 'Priya Sharma',
    }),
    departmentName: z.string().meta({ example: 'Engineering' }),
    designationName: z.string().meta({ example: 'Senior Software Engineer' }),
    branchName: z.string().nullable().meta({ example: 'Bengaluru HQ' }),
    employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']).meta({
      example: 'FULL_TIME',
    }),
    baseSalary: z.string().meta({ description: 'Prisma Decimal - serializes as a string', example: '50000' }),
    workingDaysInPeriod: z.string().meta({
      description: 'Prisma Decimal - serializes as a string',
      example: '22',
    }),
    paidDays: z.string().meta({ description: 'Prisma Decimal - serializes as a string', example: '21' }),
    unpaidDays: z.string().meta({ description: 'Prisma Decimal - serializes as a string', example: '1' }),
    grossPay: z.string().meta({ description: 'Prisma Decimal - serializes as a string', example: '50000' }),
    totalDeductions: z.string().meta({
      description: 'Prisma Decimal - serializes as a string',
      example: '2272.73',
    }),
    netPay: z.string().meta({ description: 'Prisma Decimal - serializes as a string', example: '47727.27' }),
    lineItems: z.array(PayslipLineItemSchema).optional().meta({
      description: 'Only present on GET /payslips/:id, not the list endpoint',
    }),
    generatedAt: z.iso.datetime().meta({ example: '2026-09-15T10:00:00.000Z' }),
    createdAt: z.iso.datetime().meta({ example: '2026-09-15T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-09-15T10:00:00.000Z' }),
  })
  .meta({ id: 'Payslip' });

export const ReviewCycleSchema = z
  .object({
    id: z.uuid().meta({ example: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6f7a8b9c' }),
    name: z.string().meta({ example: 'H1 2026 Review' }),
    startDate: z.iso.datetime().meta({ example: '2026-01-01T00:00:00.000Z' }),
    endDate: z.iso.datetime().meta({ example: '2026-06-30T00:00:00.000Z' }),
    status: z.enum(['OPEN', 'CLOSED']).meta({ example: 'OPEN' }),
    createdAt: z.iso.datetime().meta({ example: '2026-09-15T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-09-15T10:00:00.000Z' }),
  })
  .meta({ id: 'ReviewCycle' });

export const ReviewAddendumSchema = z
  .object({
    id: z.uuid().meta({ example: 'f6a7b8c9-d0e1-4f2a-3b4c-5d6f7a8b9c0d' }),
    performanceReviewId: z.uuid().meta({ example: 'a7b8c9d0-e1f2-4a3b-4c5d-6f7a8b9c0d1e' }),
    authorId: z.uuid().nullable().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    comment: z.string().meta({ example: 'Follow-up: employee completed the agreed training in July.' }),
    createdAt: z.iso.datetime().meta({ example: '2026-09-15T10:00:00.000Z' }),
  })
  .meta({ id: 'ReviewAddendum' });

export const PerformanceReviewSchema = z
  .object({
    id: z.uuid().meta({ example: 'a7b8c9d0-e1f2-4a3b-4c5d-6f7a8b9c0d1e' }),
    employeeId: z.uuid().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    reviewerId: z.uuid().meta({ example: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6f' }),
    reviewCycleId: z.uuid().meta({ example: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6f7a8b9c' }),
    status: z.enum(['DRAFT', 'SUBMITTED', 'ACKNOWLEDGED']).meta({ example: 'DRAFT' }),
    rating: z
      .enum(['OUTSTANDING', 'EXCEEDS_EXPECTATIONS', 'MEETS_EXPECTATIONS', 'BELOW_EXPECTATIONS', 'UNSATISFACTORY'])
      .nullable()
      .meta({ example: null }),
    managerComments: z.string().nullable().meta({ example: null }),
    selfComments: z.string().nullable().meta({ example: null }),
    departmentName: z.string().nullable().meta({
      description: 'Snapshotted at submission time (ADR-PF03) - null while Draft',
      example: null,
    }),
    designationName: z.string().nullable().meta({ example: null }),
    branchName: z.string().nullable().meta({ example: null }),
    submittedAt: z.iso.datetime().nullable().meta({ example: null }),
    acknowledgedAt: z.iso.datetime().nullable().meta({ example: null }),
    addenda: z.array(ReviewAddendumSchema).optional().meta({
      description: 'Only present on GET /performance-reviews/:id, not the list endpoint',
    }),
    createdAt: z.iso.datetime().meta({ example: '2026-09-15T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-09-15T10:00:00.000Z' }),
  })
  .meta({ id: 'PerformanceReview' });

export const EmployeeDocumentSchema = z
  .object({
    id: z.uuid().meta({ example: 'f1e2d3c4-b5a6-4978-8f6e-5d4c3b2a1908' }),
    employeeId: z.uuid().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    url: z.url().meta({
      example: 'https://res.cloudinary.com/dhfxv7gdp/raw/upload/v1/emp-mgmt/documents/f1e2.pdf',
    }),
    publicId: z.string().meta({ example: 'emp-mgmt/production/employees/a1b2/documents/f1e2' }),
    resourceType: z.string().meta({
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

export const JobRequisitionSchema = z
  .object({
    id: z.uuid().meta({ example: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e' }),
    departmentId: z.uuid().meta({ example: '5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7c' }),
    designationId: z.uuid().meta({ example: '5e6f4b1a-9c2d-4e3f-8a1b-2c3d4e5f6a7d' }),
    branchId: z.uuid().nullable().meta({ example: null }),
    employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']).meta({
      example: 'FULL_TIME',
    }),
    numberOfOpenings: z.int().meta({ example: 2 }),
    remainingOpenings: z.int().meta({ example: 2 }),
    status: z.enum(['OPEN', 'ON_HOLD', 'CLOSED', 'CANCELLED']).meta({ example: 'OPEN' }),
    createdAt: z.iso.datetime().meta({ example: '2026-09-16T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-09-16T10:00:00.000Z' }),
  })
  .meta({ id: 'JobRequisition' });

export const CandidateDocumentSchema = z
  .object({
    id: z.uuid().meta({ example: 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f' }),
    candidateId: z.uuid().meta({ example: 'd3e4f5a6-b7c8-4d9e-0f1a-2b3c4d5e6f7a' }),
    url: z.url().meta({
      example: 'https://res.cloudinary.com/dhfxv7gdp/raw/upload/v1/emp-mgmt/candidates/c2d3.pdf',
    }),
    publicId: z.string().meta({ example: 'emp-mgmt/production/candidates/c2d3/documents/e4f5' }),
    resourceType: z.string().meta({ example: 'raw' }),
    fileName: z.string().meta({ example: 'resume.pdf' }),
    mimeType: z.string().meta({ example: 'application/pdf' }),
    size: z.int().meta({ example: 245678 }),
    uploadedBy: z.uuid().nullable().meta({ example: null }),
    createdAt: z.iso.datetime().meta({ example: '2026-09-16T10:00:00.000Z' }),
  })
  .meta({ id: 'CandidateDocument' });

export const CandidateSchema = z
  .object({
    id: z.uuid().meta({ example: 'd3e4f5a6-b7c8-4d9e-0f1a-2b3c4d5e6f7a' }),
    name: z.string().meta({ example: 'Jane Doe' }),
    email: z.email().meta({ example: 'jane.doe@example.com' }),
    phone: z.string().nullable().meta({ example: null }),
    createdAt: z.iso.datetime().meta({ example: '2026-09-16T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-09-16T10:00:00.000Z' }),
  })
  .meta({ id: 'Candidate' });

export const InterviewSchema = z
  .object({
    id: z.uuid().meta({ example: 'e4f5a6b7-c8d9-4e0f-1a2b-3c4d5e6f7a8b' }),
    applicationId: z.uuid().meta({ example: 'f5a6b7c8-d9e0-4f1a-2b3c-4d5e6f7a8b9c' }),
    interviewerId: z.uuid().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    scheduledAt: z.iso.datetime().meta({ example: '2026-10-01T14:00:00.000Z' }),
    feedback: z.string().nullable().meta({ example: null }),
    recommendation: z.enum(['STRONG_YES', 'YES', 'NO', 'STRONG_NO']).nullable().meta({
      example: null,
    }),
    createdAt: z.iso.datetime().meta({ example: '2026-09-16T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-09-16T10:00:00.000Z' }),
  })
  .meta({ id: 'Interview' });

export const OfferSchema = z
  .object({
    id: z.uuid().meta({ example: 'a6b7c8d9-e0f1-4a2b-3c4d-5e6f7a8b9c0d' }),
    applicationId: z.uuid().meta({ example: 'f5a6b7c8-d9e0-4f1a-2b3c-4d5e6f7a8b9c' }),
    salary: z.string().meta({ example: '95000', description: 'Decimal, serialized as a string' }),
    startDate: z.iso.datetime().meta({ example: '2026-11-01T00:00:00.000Z' }),
    status: z.enum(['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED']).meta({ example: 'PENDING' }),
    createdAt: z.iso.datetime().meta({ example: '2026-09-16T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-09-16T10:00:00.000Z' }),
  })
  .meta({ id: 'Offer' });

export const ApplicationSchema = z
  .object({
    id: z.uuid().meta({ example: 'f5a6b7c8-d9e0-4f1a-2b3c-4d5e6f7a8b9c' }),
    candidateId: z.uuid().meta({ example: 'd3e4f5a6-b7c8-4d9e-0f1a-2b3c4d5e6f7a' }),
    jobRequisitionId: z.uuid().meta({ example: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e' }),
    status: z
      .enum(['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN'])
      .meta({ example: 'APPLIED' }),
    hiredEmployeeId: z.uuid().nullable().meta({ example: null }),
    candidate: CandidateSchema.optional(),
    jobRequisition: JobRequisitionSchema.optional(),
    interviews: z.array(InterviewSchema).optional().meta({
      description: 'Only present on GET /applications/:id, not the list endpoint',
    }),
    offers: z.array(OfferSchema).optional().meta({
      description: 'Only present on GET /applications/:id, not the list endpoint',
    }),
    createdAt: z.iso.datetime().meta({ example: '2026-09-16T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-09-16T10:00:00.000Z' }),
  })
  .meta({ id: 'Application' });

export const TrainingProgramSchema = z
  .object({
    id: z.uuid().meta({ example: 'b7c8d9e0-f1a2-4b3c-4d5e-6f7a8b9c0d1e' }),
    name: z.string().meta({ example: 'Annual Security Awareness' }),
    description: z.string().nullable().meta({ example: null }),
    mandatory: z.boolean().meta({ example: true }),
    renewalPeriodDays: z.int().nullable().meta({ example: 365 }),
    status: z.enum(['ACTIVE', 'INACTIVE']).meta({ example: 'ACTIVE' }),
    createdAt: z.iso.datetime().meta({ example: '2026-09-16T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-09-16T10:00:00.000Z' }),
  })
  .meta({ id: 'TrainingProgram' });

export const EnrollmentDocumentSchema = z
  .object({
    id: z.uuid().meta({ example: 'c8d9e0f1-a2b3-4c4d-5e6f-7a8b9c0d1e2f' }),
    enrollmentId: z.uuid().meta({ example: 'd9e0f1a2-b3c4-4d5e-6f7a-8b9c0d1e2f3a' }),
    url: z.url().meta({
      example: 'https://res.cloudinary.com/dhfxv7gdp/raw/upload/v1/emp-mgmt/enrollments/c8d9.pdf',
    }),
    publicId: z.string().meta({ example: 'emp-mgmt/production/enrollments/c8d9/documents/e0f1' }),
    resourceType: z.string().meta({ example: 'raw' }),
    fileName: z.string().meta({ example: 'certificate.pdf' }),
    mimeType: z.string().meta({ example: 'application/pdf' }),
    size: z.int().meta({ example: 128456 }),
    uploadedBy: z.uuid().nullable().meta({ example: null }),
    createdAt: z.iso.datetime().meta({ example: '2026-09-16T10:00:00.000Z' }),
  })
  .meta({ id: 'EnrollmentDocument' });

export const EnrollmentSchema = z
  .object({
    id: z.uuid().meta({ example: 'd9e0f1a2-b3c4-4d5e-6f7a-8b9c0d1e2f3a' }),
    employeeId: z.uuid().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    trainingProgramId: z.uuid().meta({ example: 'b7c8d9e0-f1a2-4b3c-4d5e-6f7a8b9c0d1e' }),
    status: z.enum(['ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'WITHDRAWN']).meta({
      example: 'ENROLLED',
    }),
    score: z.int().nullable().meta({ example: null }),
    completedAt: z.iso.datetime().nullable().meta({ example: null }),
    trainingProgram: TrainingProgramSchema.optional(),
    createdAt: z.iso.datetime().meta({ example: '2026-09-16T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-09-16T10:00:00.000Z' }),
  })
  .meta({ id: 'Enrollment' });

export const TrainingComplianceStatusSchema = z
  .object({
    trainingProgramId: z.uuid().optional().meta({
      example: 'b7c8d9e0-f1a2-4b3c-4d5e-6f7a8b9c0d1e',
      description: 'Present only in the bulk (no trainingProgramId query param) report shape',
    }),
    trainingProgramName: z.string().optional().meta({ example: 'Annual Security Awareness' }),
    compliant: z.boolean().meta({ example: true }),
    lastCompletedAt: z.iso.datetime().nullable().meta({ example: '2026-01-15T00:00:00.000Z' }),
    expiresAt: z.iso.datetime().nullable().meta({
      example: '2027-01-15T00:00:00.000Z',
      description: 'Null when the program has no renewalPeriodDays (never expires once completed)',
    }),
  })
  .meta({ id: 'TrainingComplianceStatus' });

export const AssetSchema = z
  .object({
    id: z.uuid().meta({ example: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b' }),
    assetTag: z.string().meta({ example: 'LAP-0042' }),
    type: z.string().meta({ example: 'Laptop' }),
    description: z.string().nullable().meta({ example: 'MacBook Pro 14 inch M3, 16GB' }),
    status: z.enum(['AVAILABLE', 'ASSIGNED', 'UNDER_REPAIR', 'RETIRED']).meta({
      example: 'AVAILABLE',
    }),
    createdAt: z.iso.datetime().meta({ example: '2026-09-22T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-09-22T10:00:00.000Z' }),
  })
  .meta({ id: 'Asset' });

export const AssetAssignmentSchema = z
  .object({
    id: z.uuid().meta({ example: 'f2a3b4c5-d6e7-4f8a-9b0c-1d2e3f4a5b6c' }),
    assetId: z.uuid().meta({ example: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b' }),
    employeeId: z.uuid().meta({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
    assignedAt: z.iso.datetime().meta({ example: '2026-09-22T10:00:00.000Z' }),
    returnedAt: z.iso.datetime().nullable().meta({ example: null }),
    returnCondition: z.enum(['GOOD', 'DAMAGED']).nullable().meta({ example: null }),
    returnNotes: z.string().nullable().meta({ example: null }),
    assignedBy: z.uuid().nullable().meta({ example: null }),
    returnedBy: z.uuid().nullable().meta({ example: null }),
    asset: AssetSchema.optional(),
    createdAt: z.iso.datetime().meta({ example: '2026-09-22T10:00:00.000Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2026-09-22T10:00:00.000Z' }),
  })
  .meta({ id: 'AssetAssignment' });

export const PaginationMetaSchema = z
  .object({
    page: z.int().meta({ example: 1 }),
    limit: z.int().meta({ example: 10 }),
    total: z.int().meta({ example: 42 }),
    totalPages: z.int().meta({ example: 5 }),
  })
  .meta({ id: 'PaginationMeta' });
