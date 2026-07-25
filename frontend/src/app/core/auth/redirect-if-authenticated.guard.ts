import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from './auth.service';
import { SessionStore } from './session.store';

/**
 * The inverse of `authGuard` - applied to `/`, `/login`, `/register`. A
 * returning, already-logged-in visitor should never be shown the landing
 * page or a login/register form again. Mirrors `authGuard`'s own
 * silent-restore-before-deciding logic: without it, a genuine fresh reload
 * while sitting on `/login` (in-memory session gone, but the httpOnly
 * refresh cookie still valid) would incorrectly show the login form to a
 * still-logged-in visitor.
 */
export const redirectIfAuthenticatedGuard: CanActivateFn = () => {
  const sessionStore = inject(SessionStore);
  const authService = inject(AuthService);
  const router = inject(Router);

  if (sessionStore.isAuthenticated()) {
    return router.createUrlTree(['/dashboard']);
  }

  return authService.restoreSession().pipe(
    map(() => router.createUrlTree(['/dashboard'])),
    catchError(() => of(true)),
  );
};
