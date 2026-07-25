import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { SessionStore } from '../../../core/auth/session.store';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { EmployeeDocument } from '../data-access/employee-document.model';
import { EmployeeStore } from '../data-access/employee.store';

export interface EmployeeDocumentsDialogData {
  employeeId: string;
}

const DOCUMENT_ACCEPT = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Reuses `FileUploadComponent` (built for Account's profile picture) for
 * its second real, validated consumer. Upload/delete are gated on
 * `employee:update:any` - the backend grants no `:own` variant for
 * either (only listing accepts `:own`, per `employee.routes.js`), so an
 * employee viewing their own record can see documents but never add or
 * remove one; mirrored here rather than relied on server-side alone.
 */
@Component({
  selector: 'app-employee-documents-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, DatePipe, FileUploadComponent],
  templateUrl: './employee-documents-dialog.component.html',
  styleUrl: './employee-documents-dialog.component.scss',
})
export class EmployeeDocumentsDialogComponent implements OnInit {
  private readonly data = inject<EmployeeDocumentsDialogData>(MAT_DIALOG_DATA);
  private readonly dialog = inject(MatDialog);
  protected readonly sessionStore = inject(SessionStore);
  protected readonly employeeStore = inject(EmployeeStore);
  protected readonly icons = ICON_NAMES;

  protected readonly documentAccept = DOCUMENT_ACCEPT;
  protected readonly documentMaxSizeBytes = DOCUMENT_MAX_SIZE_BYTES;
  protected readonly rejectionError = signal<string | null>(null);

  ngOnInit(): void {
    this.employeeStore.loadDocuments(this.data.employeeId);
  }

  protected onFileSelected(file: File): void {
    this.rejectionError.set(null);
    this.employeeStore.uploadDocument(this.data.employeeId, file);
  }

  protected onFileRejected(reason: string): void {
    this.rejectionError.set(reason);
  }

  // No shared FileSizePipe exists (or is justified) yet - this is the
  // only place in the app that formats a byte count today.
  protected formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    const kb = bytes / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(0)} KB`;
    }
    return `${(kb / 1024).toFixed(1)} MB`;
  }

  protected confirmDelete(document: EmployeeDocument): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Delete document',
          message: `Delete "${document.fileName}"? This cannot be undone.`,
          confirmLabel: 'Delete',
        },
      })
      .afterClosed()
      .subscribe((confirmed: boolean | undefined) => {
        if (confirmed) {
          this.employeeStore.deleteDocument(this.data.employeeId, document.id);
        }
      });
  }
}
