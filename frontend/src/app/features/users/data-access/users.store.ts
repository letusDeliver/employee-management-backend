import { Injectable, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';

import { UserDirectoryService } from '../../../core/users/user-directory.service';
import { UserListItem } from '../../../core/users/user.models';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';

/**
 * Signal-based Store (blueprint §6) - not NgRx. `filteredUsers` is a
 * pure client-side convenience over an array `GET /users` already
 * returned in full: the backend has no search/sort/pagination for this
 * endpoint at all (verified against `user.repository.js`'s bare
 * `findMany()`). This filtering must never be read as "the app supports
 * server-side user search" - it's the same "sort data you already have"
 * pattern `MatTableDataSource`'s client-side sorting uses, applied one
 * level up, at the Store.
 *
 * Sources data from `UserDirectoryService` (`core/users/`, moved here
 * in Feature 6 alongside Employees' name-enrichment need) rather than
 * its own HTTP call - one real fetch implementation for "all users" in
 * the whole app, shared by this page and Employees' optional
 * enrichment, neither importing the other.
 */
@Injectable({ providedIn: 'root' })
export class UsersStore {
  private readonly userDirectory = inject(UserDirectoryService);

  readonly users = signal<UserListItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');

  readonly filteredUsers = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return this.users();
    }
    return this.users().filter(
      (user) => user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term),
    );
  });

  loadUsers(): void {
    this.error.set(null);
    this.loading.set(true);

    this.userDirectory
      .ensureLoaded()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (users) => this.users.set(users),
        error: (error: unknown) => this.error.set(extractErrorMessage(error)),
      });
  }
}
