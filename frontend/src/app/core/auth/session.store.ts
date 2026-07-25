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
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  readonly user = signal<AuthUser | null>(null);
  readonly accessToken = signal<string | null>(null);

  readonly isAuthenticated = computed(() => this.user() !== null);

  setSession(user: AuthUser, accessToken: string): void {
    this.user.set(user);
    this.accessToken.set(accessToken);
  }

  clearSession(): void {
    this.user.set(null);
    this.accessToken.set(null);
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
