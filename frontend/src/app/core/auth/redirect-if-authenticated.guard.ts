import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { NotificationService } from '../notifications/notification.service';
import { AuthService } from './auth.service';
import { SessionStore } from './session.store';

const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';

/**
 * The inverse of `authGuard` - applied to `/`, `/login`, `/register`. A
 * returning, already-logged-in visitor should never be shown the landing
 * page or a login/register form again. Mirrors `authGuard`'s own
 * silent-restore-before-deciding logic: without it, a genuine fresh reload
 * while sitting on `/login` (in-memory session gone, but the httpOnly
 * refresh cookie still valid) would incorrectly show the login form to a
 * still-logged-in visitor.
 *
 * Same `hadPriorSession()` distinction as `authGuard`: a brand-new anonymous
 * visitor hitting `/login` directly gets no message (the overwhelmingly
 * common case, and showing one would be false), but a returning visitor
 * whose refresh cookie died while the browser was closed gets told why
 * they're looking at the login form instead of their dashboard.
 */
export const redirectIfAuthenticatedGuard: CanActivateFn = () => {
  const sessionStore = inject(SessionStore);
  const authService = inject(AuthService);
  const notificationService = inject(NotificationService);
  const router = inject(Router);

  if (sessionStore.isAuthenticated()) {
    return router.createUrlTree(['/dashboard']);
  }

  return authService.restoreSession().pipe(
    map(() => router.createUrlTree(['/dashboard'])),
    catchError(() => {
      if (sessionStore.hadPriorSession()) {
        notificationService.showWarning(SESSION_EXPIRED_MESSAGE);
      }

      sessionStore.forgetPriorSession();
      return of(true);
    }),
  );
};
