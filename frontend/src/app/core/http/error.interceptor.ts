import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { SessionStore } from '../auth/session.store';
import { NotificationService } from '../notifications/notification.service';
import { extractErrorMessage } from '../../shared/utils/extract-error-message.util';
import { SKIP_GLOBAL_ERROR_NOTIFICATION } from './http-context-tokens';

/**
 * Maps an `HttpErrorResponse` to the backend's real `ApiError` shape and
 * reports it to `NotificationService`, unless the request's `HttpContext`
 * carries `SKIP_GLOBAL_ERROR_NOTIFICATION` (set by forms that render the
 * message inline instead, per blueprint §9) or `SessionStore.sessionExpired`
 * is already `true`. Registered *before* `refreshInterceptor` in
 * `app.config.ts`'s `withInterceptors([...])` array deliberately - Angular
 * runs interceptors in array order outbound, but in *reverse* order for the
 * response/error path, so `refreshInterceptor` (later in the array) sees a
 * 401 first and can silently retry; this interceptor only ever sees an error
 * that refresh already gave up on.
 *
 * The `sessionExpired` check matters when several requests are in flight at
 * once and all 401 together: `refreshInterceptor` dedupes its own "session
 * expired" toast+redirect down to one via `markSessionExpired()`, but
 * without this check, *every other* failing request would still reach here
 * and flash the raw backend refresh-failure message (e.g. "Invalid refresh
 * token") as its own separate toast right alongside the real message.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notificationService = inject(NotificationService);
  const sessionStore = inject(SessionStore);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        !sessionStore.sessionExpired() &&
        !req.context.get(SKIP_GLOBAL_ERROR_NOTIFICATION)
      ) {
        notificationService.showError(extractErrorMessage(error));
      }

      return throwError(() => error);
    }),
  );
};
