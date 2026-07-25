import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { SessionStore } from '../../../core/auth/session.store';
import { UserDirectoryService } from '../../../core/users/user-directory.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { EmployeeDocumentsDialogComponent } from '../employee-documents/employee-documents-dialog.component';
import { EmployeeStore } from '../data-access/employee.store';

/**
 * Read-only detail + permission-gated edit/delete entry points. Reuses
 * the shared `ConfirmDialogComponent` (this feature's first real
 * consumer) for the soft-delete confirmation, and `UserDirectoryService`
 * for the same honest name-resolution the list table uses.
 */
@Component({
  selector: 'app-employee-detail-page',
  imports: [MatCardModule, MatButtonModule, MatIconModule, RouterLink, DatePipe, CurrencyPipe],
  templateUrl: './employee-detail-page.component.html',
  styleUrl: './employee-detail-page.component.scss',
})
export class EmployeeDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  protected readonly sessionStore = inject(SessionStore);
  protected readonly userDirectory = inject(UserDirectoryService);
  protected readonly employeeStore = inject(EmployeeStore);
  protected readonly icons = ICON_NAMES;

  protected readonly deleteError = signal<string | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.employeeStore.loadOne(id);
      this.userDirectory.ensureLoaded().subscribe({ error: () => undefined });
    }
  }

  protected displayName(userId: string | null): string | null {
    return this.userDirectory.resolveDisplayName(userId);
  }

  protected openDocuments(): void {
    const employee = this.employeeStore.selected();
    if (!employee) {
      return;
    }

    this.dialog.open(EmployeeDocumentsDialogComponent, {
      data: { employeeId: employee.id },
      width: '480px',
    });
  }

  protected confirmDelete(): void {
    const employee = this.employeeStore.selected();
    if (!employee) {
      return;
    }

    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Delete employee',
          message: `Delete the ${employee.jobTitle} record in ${employee.department}? This cannot be undone.`,
          confirmLabel: 'Delete',
        },
      })
      .afterClosed()
      .subscribe((confirmed: boolean | undefined) => {
        if (confirmed) {
          this.employeeStore.deleteEmployee(employee.id).subscribe({
            next: () => this.router.navigate(['/employees']),
            error: (error: unknown) => this.deleteError.set(extractErrorMessage(error)),
          });
        }
      });
  }
}
