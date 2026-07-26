import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * The one place a toast is triggered from app-wide (blueprint §12) - wraps
 * `MatSnackBar` so no other file imports it directly.
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

  showSuccess(message: string): void {
    this.snackBar.open(message, 'Dismiss', {
      duration: 4000,
      panelClass: ['bg-success', 'text-on-success'],
    });
  }

  showWarning(message: string): void {
    this.snackBar.open(message, 'Dismiss', {
      duration: 5000,
      panelClass: ['bg-warning', 'text-on-warning'],
    });
  }
}
