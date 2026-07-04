import crypto from 'node:crypto';

import bcrypt from 'bcryptjs';

import userRepository from '../users/user.repository.js';
import { sanitizeUser } from '../users/user.service.js';
import refreshTokenRepository from './refreshToken.repository.js';
import jwt from '../../utils/jwt.js';
import ConflictError from '../../errors/ConflictError.js';
import UnauthorizedError from '../../errors/UnauthorizedError.js';

const SALT_ROUNDS = 10;
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-safety', SALT_ROUNDS);

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const issueTokenPair = async (user) => {
  const payload = { sub: user.id, role: user.role };
  const accessToken = jwt.signAccessToken(payload);
  const refreshToken = jwt.signRefreshToken(payload);

  const { exp } = jwt.decode(refreshToken);

  await refreshTokenRepository.create({
    tokenHash: hashToken(refreshToken),
    userId: user.id,
    expiresAt: new Date(exp * 1000),
  });

  return { accessToken, refreshToken };
};

const register = async ({ email, password, name }) => {
  const existingUser = await userRepository.findByEmail(email);

  if (existingUser) {
    throw new ConflictError('Email already registered');
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await userRepository.create({ email, password: hashedPassword, name });
  const tokens = await issueTokenPair(user);

  return { user: sanitizeUser(user), ...tokens };
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

  const tokens = await issueTokenPair(user);

  return { user: sanitizeUser(user), ...tokens };
};

const refresh = async (refreshToken) => {
  let payload;

  try {
    payload = jwt.verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }

  const storedToken = await refreshTokenRepository.findValidByHash(hashToken(refreshToken));

  if (!storedToken) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  await refreshTokenRepository.revoke(storedToken.id);

  const user = await userRepository.findById(payload.sub);

  if (!user) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  return issueTokenPair(user);
};

const logout = async (refreshToken) => {
  const storedToken = await refreshTokenRepository.findValidByHash(hashToken(refreshToken));

  if (storedToken) {
    await refreshTokenRepository.revoke(storedToken.id);
  }
};

const getCurrentUser = async (userId) => {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new UnauthorizedError('User no longer exists');
  }

  return sanitizeUser(user);
};

export default { register, login, refresh, logout, getCurrentUser };
