import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Clones every outgoing request with `withCredentials: true`, so the
 * httpOnly refresh cookie round-trips on cross-origin calls between
 * `localhost:4200` and `localhost:3000` in dev - harmless on requests with
 * no cookie to send. Angular's `provideHttpClient()` has no built-in global
 * "always send credentials" feature (verified against the installed
 * `@angular/common/http` typings - only `withInterceptors`,
 * `withXsrfConfiguration`, `withNoXsrfProtection`, `withJsonpSupport`,
 * `withRequestsMadeViaParent`, and `withFetch` exist), so a small dedicated
 * interceptor is the correct mechanism, not a provider option (see
 * `docs/frontend-architecture-blueprint.md` §7, v5 revision).
 */
export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req.clone({ withCredentials: true }));
};
