import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import { ProfilePictureResponse } from './account.models';

/**
 * Thin HttpClient wrapper for the 2 real self-service `/users/me/*`
 * endpoints - no business logic beyond unwrapping `{ user }`. There is
 * no endpoint to update name/email (verified against
 * `backend/src/modules/users/user.routes.js`) - a real backend
 * limitation, not an omission here.
 *
 * Unlike login()/register(), these calls do NOT suppress the global error
 * toast: a single-action mutation (upload/remove one picture) has only one
 * thing that can go wrong, so a toast alongside the inline message isn't
 * the same redundancy a multi-field auth form would have.
 */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  uploadProfilePicture(file: File): Observable<ProfilePictureResponse['user']> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http
      .post<ProfilePictureResponse>(`${this.baseUrl}/users/me/profile-picture`, formData)
      .pipe(map(({ user }) => user));
  }

  deleteProfilePicture(): Observable<ProfilePictureResponse['user']> {
    return this.http
      .delete<ProfilePictureResponse>(`${this.baseUrl}/users/me/profile-picture`)
      .pipe(map(({ user }) => user));
  }
}
