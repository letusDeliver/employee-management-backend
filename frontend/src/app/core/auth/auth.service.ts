import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, finalize, map, switchMap, tap } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url.token';
import { SKIP_GLOBAL_ERROR_NOTIFICATION } from '../http/http-context-tokens';
import {
  AuthSuccessResponse,
  AuthUser,
  LoginRequest,
  LogoutResponse,
  MeResponse,
  RefreshResponse,
  RegisterRequest,
} from './auth.models';
import { SessionStore } from './session.store';

/**
 * Thin HttpClient wrapper for the 5 real `/auth/*` endpoints - no business
 * logic beyond keeping `SessionStore` in sync with each response. Components
 * inject this service, never `SessionStore.setSession`/`clearSession`
 * directly (blueprint §6).
 *
 * `POST /auth/refresh` returns only `{ accessToken }` - not `user` (verified
 * against `backend/src/modules/auth/auth.controller.js`). That means a bare
 * refresh cannot repopulate `SessionStore.user` after a hard reload, where
 * the in-memory store is empty. `restoreSession()` is the two-step chain
 * `authGuard` uses for exactly that case: refresh the access token first (so
 * `authInterceptor` can attach it), then call `/auth/me` to recover the user
 * object. A 401-triggered refresh mid-session (`refreshInterceptor`) doesn't
 * need this second step, since `SessionStore.user` is already populated.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly sessionStore = inject(SessionStore);
  private readonly baseUrl = inject(API_BASE_URL);

  // Shared by two unrelated-but-similar cases: register()/login() use it
  // because their errors render inline in the calling form (blueprint §9);
  // refreshAccessToken() uses it because a failed silent refresh is the
  // *normal, expected* outcome for an anonymous visitor or an already-
  // expired session (every visit to `/`, `/login`, `/register` while
  // logged out triggers one via `redirectIfAuthenticatedGuard`) - never
  // something a user should see as a raw "Refresh token missing" toast.
  private readonly silentErrorContext = new HttpContext().set(SKIP_GLOBAL_ERROR_NOTIFICATION, true);

  register(request: RegisterRequest): Observable<AuthUser> {
    return this.http
      .post<AuthSuccessResponse>(`${this.baseUrl}/auth/register`, request, {
        context: this.silentErrorContext,
      })
      .pipe(
        tap(({ user, accessToken }) => this.sessionStore.setSession(user, accessToken)),
        map(({ user }) => user),
      );
  }

  login(request: LoginRequest): Observable<AuthUser> {
    return this.http
      .post<AuthSuccessResponse>(`${this.baseUrl}/auth/login`, request, {
        context: this.silentErrorContext,
      })
      .pipe(
        tap(({ user, accessToken }) => this.sessionStore.setSession(user, accessToken)),
        map(({ user }) => user),
      );
  }

  logout(): Observable<void> {
    return this.http.post<LogoutResponse>(`${this.baseUrl}/auth/logout`, {}).pipe(
      map(() => undefined),
      finalize(() => {
        this.sessionStore.clearSession();
        // An explicit logout is never "your session expired" - forget the
        // persisted flag so a later visit to a protected/public route
        // doesn't misreport a deliberate logout as an involuntary expiry.
        this.sessionStore.forgetPriorSession();
      }),
    );
  }

  /** Used by `refreshInterceptor` when an existing session's access token has expired. */
  refreshAccessToken(): Observable<string> {
    return this.http
      .post<RefreshResponse>(`${this.baseUrl}/auth/refresh`, {}, { context: this.silentErrorContext })
      .pipe(
        tap(({ accessToken }) => this.sessionStore.accessToken.set(accessToken)),
        map(({ accessToken }) => accessToken),
      );
  }

  getCurrentUser(): Observable<AuthUser> {
    return this.http.get<MeResponse>(`${this.baseUrl}/auth/me`).pipe(
      tap(({ user }) => this.sessionStore.user.set(user)),
      map(({ user }) => user),
    );
  }

  /** Used by `authGuard` on app bootstrap / hard reload, when `SessionStore` is empty. */
  restoreSession(): Observable<AuthUser> {
    return this.refreshAccessToken().pipe(switchMap(() => this.getCurrentUser()));
  }
}
