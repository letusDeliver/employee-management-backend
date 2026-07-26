import { Injectable, computed, signal } from '@angular/core';

import { AuthUser } from './auth.models';

/**
 * The app-wide source of truth for "who is logged in." A signal-based Store
 * (blueprint §6) - not NgRx. The access token lives here in memory only,
 * never in localStorage/sessionStorage (blueprint §7): it is gone after
 * every hard reload, by design, and only restored via authGuard's silent
 * refresh call.
 *
 * `hasPermission`/`hasAnyPermission` are plain methods, not `computed()` -
 * computed() cannot take a runtime argument. They do a direct array lookup
 * against `user().permissions`, already resolved server-side (blueprint
 * §7.1) - no permission-mapping logic lives here.
 *
 * Session-expiry bookkeeping (`hadPriorSession`/`forgetPriorSession`/
 * `sessionExpired`/`markSessionExpired`) exists so `refreshInterceptor`,
 * `errorInterceptor`, `authGuard`, and `redirectIfAuthenticatedGuard` can all
 * show one clear "your session has expired" message instead of the backend's
 * raw refresh-failure text (e.g. "Invalid refresh token") - see each call
 * site for how they're used together.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  /**
   * Deliberately *not* sensitive - a bare boolean, never the token itself
   * (blueprint §7 still holds). Survives a hard reload/browser restart so
   * authGuard/redirectIfAuthenticatedGuard can tell "this browser had a real
   * session that expired" apart from "an anonymous visitor landed here,"
   * which the in-memory signals below can never distinguish once cleared.
   */
  private static readonly HAD_SESSION_KEY = 'ems.hadSession';

  readonly user = signal<AuthUser | null>(null);
  readonly accessToken = signal<string | null>(null);

  readonly isAuthenticated = computed(() => this.user() !== null);

  /**
   * True from the moment an involuntary session termination is first
   * detected (a failed silent refresh) until the next successful login.
   * `errorInterceptor` checks this to skip its generic toast for every
   * request that failed as a side effect of the same expiry, not just the
   * one that triggered it - see `markSessionExpired()`.
   */
  readonly sessionExpired = signal(false);

  setSession(user: AuthUser, accessToken: string): void {
    this.user.set(user);
    this.accessToken.set(accessToken);
    this.sessionExpired.set(false);

    try {
      localStorage.setItem(SessionStore.HAD_SESSION_KEY, '1');
    } catch {
      // Storage unavailable (privacy mode, etc.) - the flag is a UX nicety,
      // never load-bearing for auth itself, so failing silently is correct.
    }
  }

  clearSession(): void {
    this.user.set(null);
    this.accessToken.set(null);
  }

  /** Has this browser ever completed a real login? Read by both guards' silent-restore failure path. */
  hadPriorSession(): boolean {
    try {
      return localStorage.getItem(SessionStore.HAD_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  }

  /**
   * Called once a session's end has been accounted for - either an explicit
   * logout (no "expired" message ever warranted) or after a silent-restore
   * failure has already shown its one message, so the same browser isn't
   * told its session "expired" repeatedly on every subsequent guarded
   * navigation attempt.
   */
  forgetPriorSession(): void {
    try {
      localStorage.removeItem(SessionStore.HAD_SESSION_KEY);
    } catch {
      // See setSession()'s catch - non-fatal by design.
    }
  }

  /**
   * First-caller-wins guard for a burst of concurrent 401s that all trigger
   * the same silent-refresh failure: returns `true` (and flips the signal)
   * only the first time it's called since the last successful login, so
   * `refreshInterceptor` shows its "session expired" toast and redirect
   * exactly once, not once per failed request.
   */
  markSessionExpired(): boolean {
    if (this.sessionExpired()) {
      return false;
    }

    this.sessionExpired.set(true);
    return true;
  }

  /**
   * Used by AccountStore after a profile-picture upload/delete.
   * `POST`/`DELETE /users/me/profile-picture` return a `user` shape
   * without `permissions` (blueprint §7.1 - only register/login/`/auth/me`
   * attach that), so merging the *whole* response into `user` would
   * silently wipe `permissions` from the live session. This merges only
   * the two fields that actually changed.
   */
  updateProfileImage(profileImageUrl: string | null, profileImagePublicId: string | null): void {
    this.user.update((current) => (current ? { ...current, profileImageUrl, profileImagePublicId } : current));
  }

  hasPermission(key: string): boolean {
    return this.user()?.permissions.includes(key) ?? false;
  }

  hasAnyPermission(...keys: string[]): boolean {
    return keys.some((key) => this.hasPermission(key));
  }
}
