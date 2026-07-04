import bcrypt from 'bcryptjs';

import userRepository from '../users/user.repository.js';
import ConflictError from '../../errors/ConflictError.js';
import UnauthorizedError from '../../errors/UnauthorizedError.js';

const SALT_ROUNDS = 10;
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-safety', SALT_ROUNDS);

const sanitizeUser = (user) => {
  const { password, ...safeUser } = user;
  return safeUser;
};

const register = async ({ email, password, name }) => {
  const existingUser = await userRepository.findByEmail(email);

  if (existingUser) {
    throw new ConflictError('Email already registered');
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await userRepository.create({ email, password: hashedPassword, name });

  return sanitizeUser(user);
};

const login = async ({ email, password }) => {
  const user = await userRepository.findByEmail(email);

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw new UnauthorizedError('Invalid credentials');
  }

  const passwordMatches = await bcrypt.compare(password, user.password);

  if (!passwordMatches) {
    throw new UnauthorizedError('Invalid credentials');
  }

  return sanitizeUser(user);
};

export default { register, login };
