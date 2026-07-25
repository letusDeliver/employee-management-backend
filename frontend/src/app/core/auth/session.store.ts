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

  hasPermission(key: string): boolean {
    return this.user()?.permissions.includes(key) ?? false;
  }

  hasAnyPermission(...keys: string[]): boolean {
    return keys.some((key) => this.hasPermission(key));
  }
}
