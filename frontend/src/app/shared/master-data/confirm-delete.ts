import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, finalize } from 'rxjs';

import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';
import { extractErrorMessage } from '../utils/extract-error-message.util';

export interface ConfirmDeleteCopy {
  title: string;
  message: string;
  /** Defaults to "Delete". Leave's cancel / approve flows reuse this helper with their own wording. */
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'warn' | 'primary';
}

/**
 * The confirm -> delete -> report-failure flow every master-data list page repeats: ask first, mark
 * the row as deleting while the request is in flight (so its button is replaced by a spinner and
 * cannot be clicked twice), and keep the backend's own message when the delete is refused - a
 * `409` on a referenced record is a NORMAL outcome, not an error to hide.
 *
 * Call it in a field initialiser (it injects). `deleteById` is read lazily, so it may close over
 * something that is not available yet (e.g. a signal input).
 *
 * Extracted from `MasterDataListPageComponent` and `ShiftListPageComponent` once Holiday Calendar
 * became a third identical consumer (the "two identical instances" rule had already been met).
 */
export function createConfirmDelete(deleteById: (id: string) => Observable<unknown>) {
  const dialog = inject(MatDialog);
  const destroyRef = inject(DestroyRef);

  const deleteError = signal<string | null>(null);
  const deletingIds = signal<ReadonlySet<string>>(new Set());

  const request = (id: string, copy: ConfirmDeleteCopy): void => {
    dialog
      .open(ConfirmDialogComponent, { data: { confirmLabel: 'Delete', ...copy } })
      .afterClosed()
      .subscribe((confirmed: boolean | undefined) => {
        if (!confirmed) {
          return;
        }

        deleteError.set(null);
        deletingIds.update((current) => new Set(current).add(id));

        deleteById(id)
          .pipe(
            takeUntilDestroyed(destroyRef),
            finalize(() =>
              deletingIds.update((current) => {
                const next = new Set(current);
                next.delete(id);
                return next;
              }),
            ),
          )
          .subscribe({
            error: (error: unknown) => deleteError.set(extractErrorMessage(error)),
          });
      });
  };

  return { deleteError, deletingIds, request };
}
