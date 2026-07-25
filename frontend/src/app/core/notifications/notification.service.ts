import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * The one place a toast is triggered from app-wide (blueprint §12) - wraps
 * `MatSnackBar` so no other file imports it directly. `showError` is the
 * only method this feature needs; `showSuccess`/`showInfo` are added only
 * when a future feature actually has a use for them.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', {
      duration: 6000,
      panelClass: ['bg-warn', 'text-on-warn'],
    });
  }
}
