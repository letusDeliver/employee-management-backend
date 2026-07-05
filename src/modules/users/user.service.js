import userRepository from './user.repository.js';
import rbacRepository from '../rbac/rbac.repository.js';

export const sanitizeUser = (user, roles = []) => {
  const { password, ...safeUser } = user;
  return { ...safeUser, roles };
};

const listUsers = async () => {
  const users = await userRepository.findAll();
  const roleNamesByUserId = await rbacRepository.getRoleNamesForUsers(users.map((user) => user.id));

  return users.map((user) => sanitizeUser(user, roleNamesByUserId.get(user.id) ?? []));
};

export default { listUsers };
