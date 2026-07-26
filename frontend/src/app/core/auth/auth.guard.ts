import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { NotificationService } from '../notifications/notification.service';
import { AuthService } from './auth.service';
import { SessionStore } from './session.store';

const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';

/**
 * Guards every route under `ShellComponent`. If `SessionStore` already has a
 * user, activates immediately. Otherwise attempts a silent
 * `restoreSession()` (refresh + `/me`) - the in-memory session is gone
 * after every hard reload, but the httpOnly refresh cookie may still be
 * valid (blueprint §7). Only redirects to `/login` if that silent attempt
 * also fails.
 *
 * Unlike `refreshInterceptor`'s mid-session case, a restore failure here can
 * mean two very different things: a genuinely anonymous visitor landing on a
 * deep link they were never authorized for (say nothing - showing "session
 * expired" would be actively misleading), or a returning visitor whose
 * refresh cookie died while the tab/browser was closed (say something - this
 * is the only place that case is ever detected at all, since no interceptor
 * runs before the first request). `SessionStore.hadPriorSession()` - a
 * persisted, non-sensitive flag set on login and survives a hard reload -
 * is what tells the two apart.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const sessionStore = inject(SessionStore);
  const authService = inject(AuthService);
  const notificationService = inject(NotificationService);
  const router = inject(Router);

  if (sessionStore.isAuthenticated()) {
    return true;
  }

  return authService.restoreSession().pipe(
    map(() => true),
    catchError(() => {
      if (sessionStore.hadPriorSession()) {
        notificationService.showWarning(SESSION_EXPIRED_MESSAGE);
      }

      sessionStore.forgetPriorSession();
      return of(router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }));
    }),
  );
};
