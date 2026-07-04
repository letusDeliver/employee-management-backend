import authService from './auth.service.js';
import jwt from '../../utils/jwt.js';
import env from '../../config/env.js';
import UnauthorizedError from '../../errors/UnauthorizedError.js';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

const buildCookieOptions = (refreshToken) => {
  const { exp } = jwt.decode(refreshToken);

  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: exp * 1000 - Date.now(),
  };
};

const register = async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.register(req.body);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, buildCookieOptions(refreshToken));
  res.status(201).json({ message: 'User registered successfully', user, accessToken });
};

const login = async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, buildCookieOptions(refreshToken));
  res.status(200).json({ message: 'Login successful', user, accessToken });
};

const refresh = async (req, res) => {
  const incomingToken = req.cookies[REFRESH_COOKIE_NAME];

  if (!incomingToken) {
    throw new UnauthorizedError('Refresh token missing');
  }

  const { accessToken, refreshToken } = await authService.refresh(incomingToken);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, buildCookieOptions(refreshToken));
  res.status(200).json({ accessToken });
};

const logout = async (req, res) => {
  const incomingToken = req.cookies[REFRESH_COOKIE_NAME];

  if (incomingToken) {
    await authService.logout(incomingToken);
  }

  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  res.status(200).json({ message: 'Logged out successfully' });
};

const me = async (req, res) => {
  const user = await authService.getCurrentUser(req.user.id);
  res.status(200).json({ user });
};

export default { register, login, refresh, logout, me };
