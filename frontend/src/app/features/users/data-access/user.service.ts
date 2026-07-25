import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import { UserListItem, UsersResponse } from './user.models';

/**
 * Thin HttpClient wrapper for the one real `user:list` endpoint - no
 * business logic beyond unwrapping `{ users }`. `GET /users` returns
 * every user, unpaginated/unsorted/unfiltered (verified against
 * `user.repository.js`'s bare `findMany()`) - `UsersStore` is where any
 * client-side search/sort happens, never here.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  listUsers(): Observable<UserListItem[]> {
    return this.http.get<UsersResponse>(`${this.baseUrl}/users`).pipe(map(({ users }) => users));
  }
}
