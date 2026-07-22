import ForbiddenError from '../errors/ForbiddenError.js';
import permissionCache from '../utils/permissionCache.js';

const requirePermission =
  (...requiredKeys) =>
  async (req, res, next) => {
    if (!req.user || !Array.isArray(req.user.roles)) {
      return next(new ForbiddenError('You do not have permission to perform this action'));
    }

    const grantedKeys = await permissionCache.getPermissionKeysForRoles(req.user.roles);
    const hasPermission = requiredKeys.some((key) => grantedKeys.includes(key));

    if (!hasPermission) {
      return next(new ForbiddenError('You do not have permission to perform this action'));
    }

    // Exposed so the service layer can tell an ':any' grant apart from an
    // ':own' grant when a route (like GET /employees/:id) accepts either -
    // the middleware can't do the ownership check itself, it has no record
    // to compare against yet.
    req.grantedPermissions = grantedKeys;
    next();
  };

export default requirePermission;
