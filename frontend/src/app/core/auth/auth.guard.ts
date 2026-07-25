import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from './auth.service';
import { SessionStore } from './session.store';

/**
 * Guards every route under `ShellComponent`. If `SessionStore` already has a
 * user, activates immediately. Otherwise attempts a silent
 * `restoreSession()` (refresh + `/me`) - the in-memory session is gone
 * after every hard reload, but the httpOnly refresh cookie may still be
 * valid (blueprint §7). Only redirects to `/login` if that silent attempt
 * also fails.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const sessionStore = inject(SessionStore);
  const authService = inject(AuthService);
  const router = inject(Router);

  if (sessionStore.isAuthenticated()) {
    return true;
  }

  return authService.restoreSession().pipe(
    map(() => true),
    catchError(() => of(router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }))),
  );
};
