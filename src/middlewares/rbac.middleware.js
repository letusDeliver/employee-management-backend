import ForbiddenError from '../errors/ForbiddenError.js';

const requireRole =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('You do not have permission to perform this action'));
    }

    next();
  };

export default requireRole;
