import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Injectable, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { SessionStore } from '../../../core/auth/session.store';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { AccountService } from './account.service';

/**
 * Coordinates AccountService + SessionStore for profile-picture
 * mutations (blueprint §6) - not NgRx, just signals + a service call.
 * `LiveAnnouncer` lives here rather than in `AccountPageComponent`,
 * since only this Store actually knows the moment an upload/delete has
 * resolved; the async outcome has no visual focus change of its own
 * (blueprint §15), so a screen-reader user needs an explicit
 * announcement at that exact point.
 */
@Injectable({ providedIn: 'root' })
export class AccountStore {
  private readonly accountService = inject(AccountService);
  private readonly sessionStore = inject(SessionStore);
  private readonly liveAnnouncer = inject(LiveAnnouncer);
  private readonly notificationService = inject(NotificationService);

  readonly uploading = signal(false);
  readonly error = signal<string | null>(null);

  uploadProfilePicture(file: File): void {
    this.error.set(null);
    this.uploading.set(true);

    this.accountService
      .uploadProfilePicture(file)
      .pipe(finalize(() => this.uploading.set(false)))
      .subscribe({
        next: (user) => {
          // Merge only the two image fields - never replace the whole
          // session user with this response, which lacks `permissions`.
          this.sessionStore.updateProfileImage(user.profileImageUrl, user.profileImagePublicId);
          this.liveAnnouncer.announce('Profile picture updated.');
          this.notificationService.showSuccess('Profile picture updated.');
        },
        error: (error: unknown) => this.error.set(extractErrorMessage(error)),
      });
  }

  deleteProfilePicture(): void {
    this.error.set(null);
    this.uploading.set(true);

    this.accountService
      .deleteProfilePicture()
      .pipe(finalize(() => this.uploading.set(false)))
      .subscribe({
        next: (user) => {
          this.sessionStore.updateProfileImage(user.profileImageUrl, user.profileImagePublicId);
          this.liveAnnouncer.announce('Profile picture removed.');
          this.notificationService.showSuccess('Profile picture removed.');
        },
        error: (error: unknown) => this.error.set(extractErrorMessage(error)),
      });
  }
}
