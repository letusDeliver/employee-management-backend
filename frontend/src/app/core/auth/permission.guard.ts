import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { SessionStore } from './session.store';

/**
 * One shared guard, configured per-route via `route.data['permissions']` -
 * mirrors `requirePermission(...requiredKeys)`'s OR semantics exactly
 * (blueprint §5/§7.1). Not yet exercised by any real route (Employees/
 * Users/Account don't exist), built now since it's shared infrastructure
 * every future feature route will need.
 */
export const permissionGuard: CanActivateFn = (route) => {
  const sessionStore = inject(SessionStore);
  const router = inject(Router);
  const requiredPermissions = (route.data['permissions'] as string[] | undefined) ?? [];

  if (requiredPermissions.length === 0 || sessionStore.hasAnyPermission(...requiredPermissions)) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
