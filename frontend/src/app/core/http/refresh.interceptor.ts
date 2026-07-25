import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, shareReplay, switchMap, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { SessionStore } from '../auth/session.store';
import { AUTH_ENDPOINTS_WITHOUT_SESSION } from './auth-endpoint-paths';

/**
 * Module-scoped (not per-call) so concurrent 401s share exactly one
 * in-flight `/auth/refresh` call instead of each firing its own - important
 * since this backend rotates the refresh token on every use (a second
 * concurrent refresh call would invalidate the first one mid-flight).
 * Reset to `null` once the shared call settles, so a *later*, unrelated 401
 * triggers a fresh refresh rather than replaying a stale result.
 */
let refreshInProgress$: Observable<string> | null = null;

/**
 * On a 401 from any call other than the 3 no-session `/auth/*` endpoints
 * (avoiding an infinite loop, and because a 401 from login/register means
 * "wrong credentials," never "your session expired"): trigger (or join)
 * the single shared refresh, retry the original request once with the new
 * token. If the refresh itself fails, force logout and redirect to
 * `/login` - but a 401 is the *only* status this reacts to; anything else
 * (403, 500, ...) passes straight through to `errorInterceptor`.
 */
export const refreshInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const sessionStore = inject(SessionStore);
  const router = inject(Router);

  if (AUTH_ENDPOINTS_WITHOUT_SESSION.some((path) => req.url.includes(path))) {
    return next(req);
  }

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      if (!refreshInProgress$) {
        refreshInProgress$ = authService.refreshAccessToken().pipe(
          catchError((refreshError: unknown) => {
            sessionStore.clearSession();
            router.navigate(['/login']);
            return throwError(() => refreshError);
          }),
          finalize(() => {
            refreshInProgress$ = null;
          }),
          shareReplay(1),
        );
      }

      return refreshInProgress$.pipe(
        switchMap((newAccessToken) =>
          next(req.clone({ setHeaders: { Authorization: `Bearer ${newAccessToken}` } })),
        ),
      );
    }),
  );
};
