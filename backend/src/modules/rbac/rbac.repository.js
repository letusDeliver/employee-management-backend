import prisma from '../../config/database.js';

const getPermissionKeysForRoles = async (roleNames) => {
  if (roleNames.length === 0) {
    return [];
  }

  const rolePermissions = await prisma.role.findMany({
    where: { name: { in: roleNames } },
    select: {
      rolePermissions: {
        select: { permission: { select: { key: true } } },
      },
    },
  });

  const keys = rolePermissions.flatMap((role) =>
    role.rolePermissions.map((rolePermission) => rolePermission.permission.key),
  );

  return [...new Set(keys)];
};

const findRoleByName = (name, client = prisma) => {
  return client.role.findUnique({ where: { name } });
};

const assignRoleToUser = (userId, roleId, client = prisma) => {
  return client.userRole.create({ data: { userId, roleId } });
};

const getRoleNamesForUser = async (userId) => {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    select: { role: { select: { name: true } } },
  });

  return userRoles.map((userRole) => userRole.role.name);
};

const getRoleNamesForUsers = async (userIds) => {
  if (userIds.length === 0) {
    return new Map();
  }

  const userRoles = await prisma.userRole.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, role: { select: { name: true } } },
  });

  const rolesByUserId = new Map();

  for (const userRole of userRoles) {
    const roles = rolesByUserId.get(userRole.userId) ?? [];
    roles.push(userRole.role.name);
    rolesByUserId.set(userRole.userId, roles);
  }

  return rolesByUserId;
};

export default {
  getPermissionKeysForRoles,
  findRoleByName,
  assignRoleToUser,
  getRoleNamesForUser,
  getRoleNamesForUsers,
};
