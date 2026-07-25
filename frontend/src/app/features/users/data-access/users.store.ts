import { Injectable, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';

import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { UserListItem } from './user.models';
import { UserService } from './user.service';

/**
 * Signal-based Store (blueprint §6) - not NgRx. `filteredUsers` is a
 * pure client-side convenience over an array `GET /users` already
 * returned in full: the backend has no search/sort/pagination for this
 * endpoint at all (verified against `user.repository.js`'s bare
 * `findMany()`). This filtering must never be read as "the app supports
 * server-side user search" - it's the same "sort data you already have"
 * pattern `MatTableDataSource`'s client-side sorting uses, applied one
 * level up, at the Store.
 */
@Injectable({ providedIn: 'root' })
export class UsersStore {
  private readonly userService = inject(UserService);

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

    this.userService
      .listUsers()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (users) => this.users.set(users),
        error: (error: unknown) => this.error.set(extractErrorMessage(error)),
      });
  }
}
