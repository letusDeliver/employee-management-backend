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
  ],
  MANAGER: [
    'employee:create',
    'employee:read:any',
    'employee:update:any',
    'employee:delete:any',
    'branch:read',
    'department:read',
    'designation:read',
  ],
  EMPLOYEE: ['employee:read:own', 'branch:read', 'department:read', 'designation:read'],
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
  console.log('Seed complete: 3 system roles, 18 permissions, role-permission grants.');
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
