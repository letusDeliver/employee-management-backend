/**
 * The 3 `/auth/*` endpoints that sit outside the normal session machinery -
 * shared by `authInterceptor` (no token to attach yet) and
 * `refreshInterceptor` (a 401 from any of these means "wrong credentials"
 * or "no/invalid refresh cookie," never "your session expired," so none of
 * them should trigger a silent refresh attempt).
 */
export const AUTH_ENDPOINTS_WITHOUT_SESSION = ['/auth/login', '/auth/register', '/auth/refresh'];
