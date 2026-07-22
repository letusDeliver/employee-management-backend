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
];

const ROLE_PERMISSIONS = {
  ADMIN: [
    'user:list',
    'employee:create',
    'employee:read:any',
    'employee:update:any',
    'employee:delete:any',
  ],
  MANAGER: ['employee:create', 'employee:read:any', 'employee:update:any', 'employee:delete:any'],
  EMPLOYEE: ['employee:read:own'],
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
  console.log('Seed complete: 3 system roles, 6 permissions, role-permission grants.');
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
