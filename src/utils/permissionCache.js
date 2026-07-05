import rbacRepository from '../modules/rbac/rbac.repository.js';

const TTL_MS = 5 * 60 * 1000;

const cache = new Map();

const isExpired = (entry) => Date.now() - entry.cachedAt > TTL_MS;

const getPermissionKeysForRoles = async (roleNames) => {
  const uncachedRoleNames = [];
  const resolvedKeys = new Set();

  for (const roleName of roleNames) {
    const entry = cache.get(roleName);

    if (entry && !isExpired(entry)) {
      entry.permissionKeys.forEach((key) => resolvedKeys.add(key));
    } else {
      uncachedRoleNames.push(roleName);
    }
  }

  await Promise.all(
    uncachedRoleNames.map(async (roleName) => {
      const keys = await rbacRepository.getPermissionKeysForRoles([roleName]);
      cache.set(roleName, { permissionKeys: keys, cachedAt: Date.now() });
      keys.forEach((key) => resolvedKeys.add(key));
    }),
  );

  return [...resolvedKeys];
};

const invalidate = (roleName) => {
  if (roleName) {
    cache.delete(roleName);
  } else {
    cache.clear();
  }
};

export default { getPermissionKeysForRoles, invalidate };
