import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, finalize, map, of, shareReplay, tap } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url.token';
import { SessionStore } from '../auth/session.store';
import { UserListItem, UsersResponse } from './user.models';

/**
 * App-wide singleton (`providedIn: 'root'`) - the one place `GET /users`
 * is ever called from. Built during Feature 6 (Employees) specifically
 * so `UsersStore` (features/users, its own full list+search page) and
 * Employees' optional name-enrichment (features/employees) can share
 * one cached fetch without either feature importing the other -
 * blueprint §1 forbids a direct `features/employees` -> `features/users`
 * import; both depend downward on this `core/` service instead.
 *
 * `user:list` is ADMIN-only (`prisma/seed.js`) - `ensureLoaded()` never
 * even attempts the HTTP call without it, short-circuiting to an empty
 * result instead. This matters most for Employees' enrichment use case:
 * a `MANAGER` has full `employee:*` access but no `user:list`, so their
 * Employees table must render correctly with zero enrichment, never a
 * failed/blocked request in the Network tab.
 *
 * Deliberately does NOT swallow a genuine HTTP failure here - that
 * decision belongs to each caller. `UsersStore` (whose entire page IS
 * this data) lets a real failure propagate into its own `error` signal;
 * Employees' enrichment (optional, must never become a functional
 * dependency) is the one that wraps this call with its own `catchError`.
 */
@Injectable({ providedIn: 'root' })
export class UserDirectoryService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly sessionStore = inject(SessionStore);

  private readonly usersById = signal<Map<string, UserListItem> | null>(null);
  private inFlight$: Observable<UserListItem[]> | null = null;

  canListUsers(): boolean {
    return this.sessionStore.hasAnyPermission('user:list');
  }

  /**
   * Idempotent, single-flight (mirrors `refreshInterceptor`'s dedup
   * pattern) - safe to call from both Users and Employees without
   * triggering more than one real HTTP request per session.
   */
  ensureLoaded(): Observable<UserListItem[]> {
    const cached = this.usersById();
    if (cached) {
      return of(Array.from(cached.values()));
    }

    if (!this.canListUsers()) {
      return of([]);
    }

    if (!this.inFlight$) {
      this.inFlight$ = this.http.get<UsersResponse>(`${this.baseUrl}/users`).pipe(
        map(({ users }) => users),
        tap((users) => this.usersById.set(new Map(users.map((user) => [user.id, user])))),
        shareReplay(1),
        finalize(() => {
          this.inFlight$ = null;
        }),
      );
    }

    return this.inFlight$;
  }

  /**
   * Never a raw id or fabricated value - `null` means "not resolvable"
   * (no permission, not yet loaded, unlinked, or a genuinely deleted
   * user), and the caller must supply its own honest fallback (blueprint,
   * Feature 6: enrichment must never become a functional dependency).
   */
  resolveDisplayName(userId: string | null): string | null {
    if (!userId) {
      return null;
    }
    return this.usersById()?.get(userId)?.name ?? null;
  }
}
