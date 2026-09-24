import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { SessionStore } from '../../../core/auth/session.store';
import { BranchDirectoryService } from '../../../core/master-data-directory/branch-directory.service';
import { DepartmentDirectoryService } from '../../../core/master-data-directory/department-directory.service';
import { DesignationDirectoryService } from '../../../core/master-data-directory/designation-directory.service';
import { UserDirectoryService } from '../../../core/users/user-directory.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { EmployeeDocumentsDialogComponent } from '../employee-documents/employee-documents-dialog.component';
import { EmployeeStore } from '../data-access/employee.store';
import { EMPLOYMENT_TYPE_LABELS } from '../data-access/employment-type';

/**
 * Read-only detail + permission-gated edit/delete entry points. Reuses
 * the shared `ConfirmDialogComponent` (this feature's first real
 * consumer) for the soft-delete confirmation, and the `core/` directories
 * (`UserDirectoryService`, department, designation, branch) for the same honest
 * name-resolution the list table uses - the API returns only bare ids, and a name
 * that cannot be resolved is a plain "—", never a raw id or "undefined". The
 * directory loads are display-only enrichment here, so their failures are swallowed.
 */
@Component({
  selector: 'app-employee-detail-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RouterLink,
    DatePipe,
    CurrencyPipe,
    PageHeaderComponent,
    InlineBannerComponent,
  ],
  templateUrl: './employee-detail-page.component.html',
  styleUrl: './employee-detail-page.component.scss',
})
export class EmployeeDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly sessionStore = inject(SessionStore);
  protected readonly userDirectory = inject(UserDirectoryService);
  protected readonly departmentDirectory = inject(DepartmentDirectoryService);
  protected readonly designationDirectory = inject(DesignationDirectoryService);
  protected readonly branchDirectory = inject(BranchDirectoryService);
  protected readonly employeeStore = inject(EmployeeStore);
  protected readonly icons = ICON_NAMES;

  protected readonly deleteError = signal<string | null>(null);
  protected readonly deleting = signal(false);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.employeeStore.loadOne(id);
      this.userDirectory.ensureLoaded().subscribe({ error: () => undefined });
      this.departmentDirectory.refresh().subscribe({ error: () => undefined });
      this.designationDirectory.refresh().subscribe({ error: () => undefined });
      this.branchDirectory.refresh().subscribe({ error: () => undefined });
    }
  }

  /** A method, not a template lookup: a value the backend adds later must render "—", not blank. */
  protected employmentTypeLabel(type: string): string {
    return (EMPLOYMENT_TYPE_LABELS as Record<string, string>)[type] ?? '—';
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
          message: this.deleteMessage(employee),
          confirmLabel: 'Delete',
        },
      })
      .afterClosed()
      .subscribe((confirmed: boolean | undefined) => {
        if (confirmed) {
          this.deleteError.set(null);
          this.deleting.set(true);

          this.employeeStore
            .deleteEmployee(employee.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: () => this.router.navigate(['/employees']),
              error: (error: unknown) => {
                this.deleting.set(false);
                this.deleteError.set(extractErrorMessage(error));
              },
            });
        }
      });
  }

  /** Names where they resolve, plain wording where they do not - never "undefined". */
  private deleteMessage(employee: { designationId: string; departmentId: string }): string {
    const designation = this.designationDirectory.nameOf(employee.designationId);
    const department = this.departmentDirectory.nameOf(employee.departmentId);
    const subject = designation ? `the ${designation} record` : 'this employee record';
    return `Delete ${subject}${department ? ` in ${department}` : ''}? This cannot be undone.`;
  }
}
