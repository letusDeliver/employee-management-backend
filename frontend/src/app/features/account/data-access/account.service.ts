import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import { SKIP_GLOBAL_ERROR_NOTIFICATION } from '../../../core/http/http-context-tokens';
import { ProfilePictureResponse } from './account.models';

/**
 * Thin HttpClient wrapper for the 2 real self-service `/users/me/*`
 * endpoints - no business logic beyond unwrapping `{ user }`. There is
 * no endpoint to update name/email (verified against
 * `backend/src/modules/users/user.routes.js`) - a real backend
 * limitation, not an omission here.
 */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  // A direct, watched user action (clicking upload/remove) - errors
  // render inline in AccountPageComponent, the same treatment
  // login()/register() already use (blueprint §9), never a duplicate
  // global toast.
  private readonly silentErrorContext = new HttpContext().set(SKIP_GLOBAL_ERROR_NOTIFICATION, true);

  uploadProfilePicture(file: File): Observable<ProfilePictureResponse['user']> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http
      .post<ProfilePictureResponse>(`${this.baseUrl}/users/me/profile-picture`, formData, {
        context: this.silentErrorContext,
      })
      .pipe(map(({ user }) => user));
  }

  deleteProfilePicture(): Observable<ProfilePictureResponse['user']> {
    return this.http
      .delete<ProfilePictureResponse>(`${this.baseUrl}/users/me/profile-picture`, {
        context: this.silentErrorContext,
      })
      .pipe(map(({ user }) => user));
  }
}
