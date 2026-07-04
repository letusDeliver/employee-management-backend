import userRepository from './user.repository.js';

export const sanitizeUser = (user) => {
  const { password, ...safeUser } = user;
  return safeUser;
};

const listUsers = async () => {
  const users = await userRepository.findAll();
  return users.map(sanitizeUser);
};

export default { listUsers };
