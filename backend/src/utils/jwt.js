import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';

import env from '../config/env.js';

const signAccessToken = (payload) => {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN });
};

// Every refresh token carries a random `jti`. The payload is only `{ sub, roles }`
// plus `iat`/`exp`, and `iat` has one-second resolution - without a unique claim,
// two tokens issued for the same user within the same second are byte-identical,
// so their SHA-256 hashes collide on RefreshToken.tokenHash's unique constraint
// (a 500 on POST /auth/refresh, e.g. a page reload right after login). Access
// tokens are never stored, so they do not need one.
const signRefreshToken = (payload) => {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    jwtid: crypto.randomUUID(),
  });
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
};

const decode = (token) => {
  return jwt.decode(token);
};

export default { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, decode };
