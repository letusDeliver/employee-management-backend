import jwt from '../utils/jwt.js';
import userRepository from '../modules/users/user.repository.js';
import UnauthorizedError from '../errors/UnauthorizedError.js';

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authentication required'));
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = jwt.verifyAccessToken(token);

    // Closes the multi-tab logout gap: a stateless-JWT access token otherwise stays
    // valid until its own expiry regardless of /auth/logout being called elsewhere -
    // see auth.service.js's `logout` and User.tokensValidAfter's schema comment.
    // `iat` is in whole seconds (the JWT standard); tokensValidAfter is millisecond
    // precision, hence the *1000.
    const tokensValidAfter = await userRepository.getTokensValidAfter(payload.sub);

    // `undefined` means the account behind this token no longer exists - a
    // well-signed, unexpired token for a deleted user must not be trusted
    // just because it predates a tokensValidAfter stamp that was never set.
    if (tokensValidAfter === undefined) {
      return next(new UnauthorizedError('Invalid or expired token'));
    }

    if (tokensValidAfter && payload.iat * 1000 < tokensValidAfter.getTime()) {
      return next(new UnauthorizedError('Invalid or expired token'));
    }

    req.user = { id: payload.sub, roles: payload.roles };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
};

export default authMiddleware;
