import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { SessionStore } from '../auth/session.store';
import { AUTH_ENDPOINTS_WITHOUT_SESSION } from './auth-endpoint-paths';

/**
 * Attaches `Authorization: Bearer <token>` to every outgoing request except
 * the 3 endpoints that don't need or don't yet have one - register/login
 * issue the token, refresh doesn't require it (the httpOnly cookie is the
 * credential there).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const sessionStore = inject(SessionStore);
  const accessToken = sessionStore.accessToken();
  const skipAuth = AUTH_ENDPOINTS_WITHOUT_SESSION.some((path) => req.url.includes(path));

  if (!accessToken || skipAuth) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } }));
};
