import crypto from 'node:crypto';

import bcrypt from 'bcryptjs';

import prisma from '../../config/database.js';
import userRepository from '../users/user.repository.js';
import { sanitizeUser, attachPermissions } from '../users/user.service.js';
import rbacRepository from '../rbac/rbac.repository.js';
import refreshTokenRepository from './refreshToken.repository.js';
import jwt from '../../utils/jwt.js';
import ConflictError from '../../errors/ConflictError.js';
import UnauthorizedError from '../../errors/UnauthorizedError.js';

const SALT_ROUNDS = 10;
const DEFAULT_ROLE_NAME = 'EMPLOYEE';
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-safety', SALT_ROUNDS);

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const issueTokenPair = async (user) => {
  const roles = await rbacRepository.getRoleNamesForUser(user.id);
  const payload = { sub: user.id, roles };
  const accessToken = jwt.signAccessToken(payload);
  const refreshToken = jwt.signRefreshToken(payload);

  const { exp } = jwt.decode(refreshToken);

  await refreshTokenRepository.create({
    tokenHash: hashToken(refreshToken),
    userId: user.id,
    expiresAt: new Date(exp * 1000),
  });

  return { accessToken, refreshToken, roles };
};

const register = async ({ email, password, name }) => {
  const existingUser = await userRepository.findByEmail(email);

  if (existingUser) {
    throw new ConflictError('Email already registered');
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  // User creation and default-role assignment happen in one transaction so
  // a user can never exist without a role - an account with zero roles
  // could pass no permission check, ever, which is a broken state, not
  // just an inconvenience (unlike the token-issuance step below, which
  // stays outside the transaction on purpose - see the Feature 9 planning
  // doc for why that failure mode is acceptable and this one isn't).
  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await userRepository.create({ email, password: hashedPassword, name }, tx);
    const defaultRole = await rbacRepository.findRoleByName(DEFAULT_ROLE_NAME, tx);
    await rbacRepository.assignRoleToUser(createdUser.id, defaultRole.id, tx);
    return createdUser;
  });

  const { roles, ...tokens } = await issueTokenPair(user);

  return { user: await attachPermissions(sanitizeUser(user, roles), roles), ...tokens };
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

  const { roles, ...tokens } = await issueTokenPair(user);

  return { user: await attachPermissions(sanitizeUser(user, roles), roles), ...tokens };
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
    // One transaction: revoking the refresh token without also stamping
    // tokensValidAfter (or vice versa, if the process died mid-way) would leave
    // a half-finished logout - the refresh token gone but this user's other
    // access tokens still trusted, or the reverse. Closes the multi-tab gap:
    // revoking the refresh token alone leaves any access token already issued
    // to this user (in any tab/device) valid until its own natural expiry,
    // since access-token verification is otherwise fully stateless
    // (jwt.js's verifyAccessToken is signature+expiry only). authMiddleware
    // rejects any access token whose `iat` predates tokensValidAfter, so this
    // logout takes effect on this user's very next request anywhere, not just
    // in the tab that called /auth/logout.
    await prisma.$transaction(async (tx) => {
      await refreshTokenRepository.revoke(storedToken.id, tx);
      await userRepository.invalidateTokensIssuedBefore(storedToken.userId, new Date(), tx);
    });
  }
};

const getCurrentUser = async (userId) => {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new UnauthorizedError('User no longer exists');
  }

  const roles = await rbacRepository.getRoleNamesForUser(userId);

  return attachPermissions(sanitizeUser(user, roles), roles);
};

export default { register, login, refresh, logout, getCurrentUser };
