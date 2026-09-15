import 'dotenv/config';
import prismaClientPkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const { PrismaClient } = prismaClientPkg;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PERMISSIONS = [
  {
    key: 'user:list',
    resource: 'user',
    action: 'list',
    scope: null,
    description: 'List all users',
  },
  {
    key: 'employee:create',
    resource: 'employee',
    action: 'create',
    scope: null,
    description: 'Create an employee record',
  },
  {
    key: 'employee:read:any',
    resource: 'employee',
    action: 'read',
    scope: 'any',
    description: 'Read any employee record',
  },
  {
    key: 'employee:read:own',
    resource: 'employee',
    action: 'read',
    scope: 'own',
    description: 'Read your own employee record only',
  },
  {
    key: 'employee:update:any',
    resource: 'employee',
    action: 'update',
    scope: 'any',
    description: 'Update any employee record',
  },
  {
    key: 'employee:delete:any',
    resource: 'employee',
    action: 'delete',
    scope: 'any',
    description: 'Soft-delete any employee record',
  },
  {
    key: 'branch:create',
    resource: 'branch',
    action: 'create',
    scope: null,
    description: 'Create a branch',
  },
  {
    key: 'branch:read',
    resource: 'branch',
    action: 'read',
    scope: null,
    description: 'Read branch records',
  },
  {
    key: 'branch:update',
    resource: 'branch',
    action: 'update',
    scope: null,
    description: 'Update a branch, including activating/deactivating it',
  },
  {
    key: 'branch:delete',
    resource: 'branch',
    action: 'delete',
    scope: null,
    description: 'Hard-delete a branch with zero Employee references',
  },
  {
    key: 'department:create',
    resource: 'department',
    action: 'create',
    scope: null,
    description: 'Create a department',
  },
  {
    key: 'department:read',
    resource: 'department',
    action: 'read',
    scope: null,
    description: 'Read department records',
  },
  {
    key: 'department:update',
    resource: 'department',
    action: 'update',
    scope: null,
    description: 'Update a department, including activating/deactivating it',
  },
  {
    key: 'department:delete',
    resource: 'department',
    action: 'delete',
    scope: null,
    description: 'Hard-delete a department with zero Employee references',
  },
  {
    key: 'designation:create',
    resource: 'designation',
    action: 'create',
    scope: null,
    description: 'Create a designation',
  },
  {
    key: 'designation:read',
    resource: 'designation',
    action: 'read',
    scope: null,
    description: 'Read designation records',
  },
  {
    key: 'designation:update',
    resource: 'designation',
    action: 'update',
    scope: null,
    description: 'Update a designation, including activating/deactivating it',
  },
  {
    key: 'designation:delete',
    resource: 'designation',
    action: 'delete',
    scope: null,
    description: 'Hard-delete a designation with zero Employee references',
  },
  {
    key: 'holidayCalendar:create',
    resource: 'holidayCalendar',
    action: 'create',
    scope: null,
    description: 'Create a holiday calendar',
  },
  {
    key: 'holidayCalendar:read',
    resource: 'holidayCalendar',
    action: 'read',
    scope: null,
    description: 'Read holiday calendar records and their holiday entries',
  },
  {
    key: 'holidayCalendar:update',
    resource: 'holidayCalendar',
    action: 'update',
    scope: null,
    description:
      'Update a holiday calendar (including activating/deactivating it) and manage its holiday entries',
  },
  {
    key: 'holidayCalendar:delete',
    resource: 'holidayCalendar',
    action: 'delete',
    scope: null,
    description: 'Hard-delete a holiday calendar with zero Branch references',
  },
  {
    key: 'shift:create',
    resource: 'shift',
    action: 'create',
    scope: null,
    description: 'Create a shift',
  },
  {
    key: 'shift:read',
    resource: 'shift',
    action: 'read',
    scope: null,
    description: 'Read shift records',
  },
  {
    key: 'shift:update',
    resource: 'shift',
    action: 'update',
    scope: null,
    description: 'Update a shift, including activating/deactivating it',
  },
  {
    key: 'shift:delete',
    resource: 'shift',
    action: 'delete',
    scope: null,
    description: 'Hard-delete a shift with zero Employee references',
  },
  {
    key: 'attendance:checkin',
    resource: 'attendance',
    action: 'checkin',
    scope: null,
    description: "Self-service check-in/check-out against the caller's own Employee record",
  },
  {
    key: 'attendance:read:own',
    resource: 'attendance',
    action: 'read',
    scope: 'own',
    description: "Read the caller's own attendance records only",
  },
  {
    key: 'attendance:read:any',
    resource: 'attendance',
    action: 'read',
    scope: 'any',
    description: 'Read any attendance record, including listing across employees',
  },
  {
    key: 'attendance:create:any',
    resource: 'attendance',
    action: 'create',
    scope: 'any',
    description: 'Administratively create an attendance record for any employee',
  },
  {
    key: 'attendance:update:any',
    resource: 'attendance',
    action: 'update',
    scope: 'any',
    description: 'Correct any attendance record',
  },
  {
    key: 'attendance:delete:any',
    resource: 'attendance',
    action: 'delete',
    scope: 'any',
    description: 'Delete any attendance record',
  },
  {
    key: 'leaveType:create',
    resource: 'leaveType',
    action: 'create',
    scope: null,
    description: 'Create a leave type',
  },
  {
    key: 'leaveType:read',
    resource: 'leaveType',
    action: 'read',
    scope: null,
    description: 'Read leave type records',
  },
  {
    key: 'leaveType:update',
    resource: 'leaveType',
    action: 'update',
    scope: null,
    description: 'Update a leave type, including activating/deactivating it',
  },
  {
    key: 'leaveType:delete',
    resource: 'leaveType',
    action: 'delete',
    scope: null,
    description: 'Hard-delete a leave type with zero LeaveRequest/LeaveBalance references',
  },
  {
    key: 'leaveRequest:create:own',
    resource: 'leaveRequest',
    action: 'create',
    scope: 'own',
    description: "Apply for leave against the caller's own Employee record",
  },
  {
    key: 'leaveRequest:read:own',
    resource: 'leaveRequest',
    action: 'read',
    scope: 'own',
    description: "Read the caller's own leave requests only",
  },
  {
    key: 'leaveRequest:read:any',
    resource: 'leaveRequest',
    action: 'read',
    scope: 'any',
    description: 'Read any leave request, including listing across employees',
  },
  {
    key: 'leaveRequest:cancel:own',
    resource: 'leaveRequest',
    action: 'cancel',
    scope: 'own',
    description: "Cancel the caller's own pending or future-dated approved leave request",
  },
  {
    key: 'leaveRequest:cancel:any',
    resource: 'leaveRequest',
    action: 'cancel',
    scope: 'any',
    description: 'Cancel any pending or future-dated approved leave request',
  },
  {
    key: 'leaveRequest:decide:any',
    resource: 'leaveRequest',
    action: 'decide',
    scope: 'any',
    description: 'Approve or reject any pending leave request, unconditionally (ADMIN)',
  },
  {
    key: 'leaveRequest:decide:reports',
    resource: 'leaveRequest',
    action: 'decide',
    scope: 'reports',
    description:
      "Approve or reject a pending leave request only for the caller's own direct reports (MANAGER)",
  },
  {
    key: 'leaveBalance:read:own',
    resource: 'leaveBalance',
    action: 'read',
    scope: 'own',
    description: "Read the caller's own leave balances only",
  },
  {
    key: 'leaveBalance:read:any',
    resource: 'leaveBalance',
    action: 'read',
    scope: 'any',
    description: 'Read any leave balance, including listing across employees',
  },
  {
    key: 'leaveBalance:adjust:any',
    resource: 'leaveBalance',
    action: 'adjust',
    scope: 'any',
    description: 'Manually adjust any leave balance (ADMIN escape hatch, always audit-logged)',
  },
  {
    key: 'payrollRun:create',
    resource: 'payrollRun',
    action: 'create',
    scope: null,
    description: 'Create a new DRAFT PayrollRun for a period',
  },
  {
    key: 'payrollRun:read',
    resource: 'payrollRun',
    action: 'read',
    scope: null,
    description: 'Read PayrollRun records',
  },
  {
    key: 'payrollRun:process',
    resource: 'payrollRun',
    action: 'process',
    scope: null,
    description: 'Generate Payslips for every active Employee and move a DRAFT run to PROCESSING',
  },
  {
    key: 'payrollRun:finalize',
    resource: 'payrollRun',
    action: 'finalize',
    scope: null,
    description: 'Finalize a PROCESSING run, making its Payslips immutable',
  },
  {
    key: 'payrollRun:markPaid',
    resource: 'payrollRun',
    action: 'markPaid',
    scope: null,
    description: 'Record that a FINALIZED run has been paid out',
  },
  {
    key: 'payrollRun:delete',
    resource: 'payrollRun',
    action: 'delete',
    scope: null,
    description: 'Delete a DRAFT PayrollRun (no Payslips exist yet at that status)',
  },
  {
    key: 'payslip:read:own',
    resource: 'payslip',
    action: 'read',
    scope: 'own',
    description: "Read the caller's own Payslips only",
  },
  {
    key: 'payslip:read:any',
    resource: 'payslip',
    action: 'read',
    scope: 'any',
    description: 'Read any Payslip, including listing across employees',
  },
];

const ROLE_PERMISSIONS = {
  ADMIN: [
    'user:list',
    'employee:create',
    'employee:read:any',
    'employee:update:any',
    'employee:delete:any',
    'branch:create',
    'branch:read',
    'branch:update',
    'branch:delete',
    'department:create',
    'department:read',
    'department:update',
    'department:delete',
    'designation:create',
    'designation:read',
    'designation:update',
    'designation:delete',
    'holidayCalendar:create',
    'holidayCalendar:read',
    'holidayCalendar:update',
    'holidayCalendar:delete',
    'shift:create',
    'shift:read',
    'shift:update',
    'shift:delete',
    'attendance:checkin',
    'attendance:read:own',
    'attendance:read:any',
    'attendance:create:any',
    'attendance:update:any',
    'attendance:delete:any',
    'leaveType:create',
    'leaveType:read',
    'leaveType:update',
    'leaveType:delete',
    'leaveRequest:create:own',
    'leaveRequest:read:own',
    'leaveRequest:read:any',
    'leaveRequest:cancel:own',
    'leaveRequest:cancel:any',
    'leaveRequest:decide:any',
    'leaveBalance:read:own',
    'leaveBalance:read:any',
    'leaveBalance:adjust:any',
    'payrollRun:create',
    'payrollRun:read',
    'payrollRun:process',
    'payrollRun:finalize',
    'payrollRun:markPaid',
    'payrollRun:delete',
    'payslip:read:own',
    'payslip:read:any',
  ],
  MANAGER: [
    'employee:create',
    'employee:read:any',
    'employee:update:any',
    'employee:delete:any',
    'branch:read',
    'department:read',
    'designation:read',
    'holidayCalendar:read',
    'shift:read',
    'attendance:checkin',
    'attendance:read:own',
    'attendance:read:any',
    'attendance:create:any',
    'attendance:update:any',
    'attendance:delete:any',
    'leaveType:read',
    'leaveRequest:create:own',
    'leaveRequest:read:own',
    'leaveRequest:read:any',
    'leaveRequest:cancel:own',
    'leaveRequest:decide:reports',
    'leaveBalance:read:own',
    'leaveBalance:read:any',
    'payslip:read:own',
  ],
  EMPLOYEE: [
    'employee:read:own',
    'branch:read',
    'department:read',
    'designation:read',
    'holidayCalendar:read',
    'shift:read',
    'attendance:checkin',
    'attendance:read:own',
    'leaveType:read',
    'leaveRequest:create:own',
    'leaveRequest:read:own',
    'leaveRequest:cancel:own',
    'leaveBalance:read:own',
    'payslip:read:own',
  ],
};

const seedPermissions = async () => {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: permission,
      create: permission,
    });
  }
};

const seedRolesAndGrants = async () => {
  for (const roleName of Object.keys(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: { isSystem: true },
      create: { name: roleName, isSystem: true },
    });

    for (const permissionKey of ROLE_PERMISSIONS[roleName]) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { key: permissionKey },
      });

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
};

const main = async () => {
  await seedPermissions();
  await seedRolesAndGrants();
  console.log('Seed complete: 3 system roles, 54 permissions, role-permission grants.');
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
