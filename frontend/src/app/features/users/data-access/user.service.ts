import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import { UserListItem } from '../../../core/users/user.models';
import { Paginated } from '../../../shared/models/paginated.model';
import { toHttpParams } from '../../../shared/utils/http-params.util';
import { UserListQuery } from './user.model';

interface UsersListResponse {
  users: UserListItem[];
  pagination: Paginated;
}

/** Thin HttpClient wrapper - one method per real endpoint, zero business logic (blueprint §8). */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(query: UserListQuery): Observable<UsersListResponse> {
    const params = toHttpParams(query);
    return this.http.get<UsersListResponse>(`${this.baseUrl}/users`, { params });
  }
}
