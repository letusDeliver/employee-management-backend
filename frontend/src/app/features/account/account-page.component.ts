import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { SessionStore } from '../../core/auth/session.store';
import { FileUploadComponent } from '../../shared/components/file-upload/file-upload.component';
import { ICON_NAMES } from '../../shared/icon-names';
import { AccountStore } from './data-access/account.store';

const PROFILE_PICTURE_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
const PROFILE_PICTURE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Self-service: view profile (name/email/roles/member-since, all
 * already in SessionStore from login/`/auth/me` - no new fetch) and
 * manage the profile picture via the 2 real `/users/me/*` endpoints.
 * There is no name/email edit here - the backend has no endpoint for
 * it (blueprint, Feature 4 Theory).
 */
@Component({
  selector: 'app-account-page',
  imports: [
    DatePipe,
    MatCardModule,
    MatChipsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    FileUploadComponent,
  ],
  templateUrl: './account-page.component.html',
  styleUrl: './account-page.component.scss',
})
export class AccountPageComponent {
  protected readonly sessionStore = inject(SessionStore);
  protected readonly accountStore = inject(AccountStore);

  protected readonly icons = ICON_NAMES;
  protected readonly profilePictureAccept = PROFILE_PICTURE_ACCEPT;
  protected readonly profilePictureMaxSizeBytes = PROFILE_PICTURE_MAX_SIZE_BYTES;

  // Client-side rejection (wrong type/too large) never reaches the
  // server, so it's kept separate from AccountStore.error - a purely
  // local, presentational concern.
  protected readonly rejectionError = signal<string | null>(null);

  protected onFileSelected(file: File): void {
    this.rejectionError.set(null);
    this.accountStore.uploadProfilePicture(file);
  }

  protected onFileRejected(reason: string): void {
    this.rejectionError.set(reason);
  }

  protected onRemove(): void {
    this.rejectionError.set(null);
    this.accountStore.deleteProfilePicture();
  }
}
