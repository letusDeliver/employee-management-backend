import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subscription, finalize, tap } from 'rxjs';

import { NotificationService } from '../../../core/notifications/notification.service';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { createListQueryState } from '../../../shared/utils/list-query-state.util';
import { Paginated } from '../../../shared/models/paginated.model';
import { EmployeeDocument } from './employee-document.model';
import { EmployeeService } from './employee.service';
import { CreateEmployeeRequest, Employee, EmployeeListQuery, UpdateEmployeeRequest } from './employee.model';

const DEFAULT_QUERY: EmployeeListQuery = {
  page: 1,
  limit: 10,
  sortBy: 'createdAt',
  order: 'desc',
};

const DEFAULT_PAGINATION: Paginated = { page: 1, limit: 10, total: 0, totalPages: 0 };

/**
 * Signal-based Store (blueprint §6) - orchestrates `EmployeeService` and holds
 * list/pagination/query state. List query state comes from the shared
 * `createListQueryState` (Feature 6 predates it and hand-wrote the same signals).
 *
 * Mutations never update local state optimistically. Create and update touch no list
 * state at all - both navigate to the detail page, and the list page reloads on entry
 * - so a locally patched row could only ever be wrong (misplaced under the current
 * sort/page, stale total). Delete is the one mutation that happens *on* the list, so it
 * refetches, stepping back a page if it removed the only row on a later one.
 */
@Injectable({ providedIn: 'root' })
export class EmployeeStore {
  private readonly employeeService = inject(EmployeeService);
  private readonly notificationService = inject(NotificationService);

  readonly employees = signal<Employee[]>([]);
  readonly pagination = signal<Paginated>(DEFAULT_PAGINATION);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly listQuery = createListQueryState<EmployeeListQuery>(DEFAULT_QUERY, () => this.loadList());
  readonly query = this.listQuery.query;

  readonly selected = signal<Employee | null>(null);
  readonly selectedLoading = signal(false);
  readonly selectedError = signal<string | null>(null);

  readonly documents = signal<EmployeeDocument[]>([]);
  readonly documentsLoading = signal(false);
  readonly documentsError = signal<string | null>(null);
  readonly documentUploading = signal(false);
  // Tracks which specific document(s) are mid-delete, so the dialog can
  // disable just that row's button - without this, a slow delete request
  // leaves its row fully clickable, letting a second click fire a
  // redundant DELETE for the same id.
  readonly deletingDocumentIds = signal<ReadonlySet<string>>(new Set());

  // Only the latest list request may write state - a slow earlier response
  // (an older filter) must not overwrite a newer one.
  private listSubscription: Subscription | null = null;

  loadList(): void {
    // Unsubscribe FIRST: it runs the old request's finalize(), which would
    // otherwise flip `loading` back to false right after the new one set it.
    this.listSubscription?.unsubscribe();
    this.error.set(null);
    this.loading.set(true);

    this.listSubscription = this.employeeService
      .list(this.query())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ employees, pagination }) => {
          this.employees.set(employees);
          this.pagination.set(pagination);
        },
        error: (error: unknown) => this.error.set(extractErrorMessage(error)),
      });
  }

  setPage(page: number, limit: number): void {
    this.listQuery.setPage(page, limit);
  }

  setSort(sortBy: EmployeeListQuery['sortBy'], order: EmployeeListQuery['order']): void {
    this.listQuery.setSort(sortBy, order);
  }

  setFilters(
    filters: Partial<Pick<EmployeeListQuery, 'search' | 'departmentId' | 'designationId' | 'employmentType' | 'managerId'>>,
  ): void {
    this.listQuery.setFilters(filters);
  }

  loadOne(id: string): void {
    this.selectedError.set(null);
    this.selectedLoading.set(true);

    this.employeeService
      .getById(id)
      .pipe(finalize(() => this.selectedLoading.set(false)))
      .subscribe({
        next: (employee) => this.selected.set(employee),
        error: (error: unknown) => this.selectedError.set(extractErrorMessage(error)),
      });
  }

  createEmployee(request: CreateEmployeeRequest): Observable<Employee> {
    return this.employeeService.create(request).pipe(
      tap(() => this.notificationService.showSuccess('Employee created successfully.')),
    );
  }

  updateEmployee(id: string, request: UpdateEmployeeRequest): Observable<Employee> {
    return this.employeeService.update(id, request).pipe(
      tap((employee) => {
        if (this.selected()?.id === id) {
          this.selected.set(employee);
        }
        this.notificationService.showSuccess('Employee updated successfully.');
      }),
    );
  }

  deleteEmployee(id: string): Observable<void> {
    return this.employeeService.delete(id).pipe(
      tap(() => {
        this.notificationService.showSuccess('Employee deleted successfully.');

        // Only when the deleted row is in the list currently held - a delete from the
        // detail page needs no refetch (the list reloads on entry).
        if (!this.employees().some((employee) => employee.id === id)) {
          return;
        }

        // Deleting the only row on a later page would leave that page empty
        // (the server has one fewer page now) - step back one page instead.
        const { page, limit } = this.query();
        if (page > 1 && this.employees().length === 1) {
          this.listQuery.setPage(page - 1, limit);
        } else {
          this.loadList();
        }
      }),
    );
  }

  loadDocuments(employeeId: string): void {
    this.documentsError.set(null);
    this.documentsLoading.set(true);

    this.employeeService
      .listDocuments(employeeId)
      .pipe(finalize(() => this.documentsLoading.set(false)))
      .subscribe({
        next: (documents) => this.documents.set(documents),
        error: (error: unknown) => this.documentsError.set(extractErrorMessage(error)),
      });
  }

  // Void, not Observable (unlike createEmployee/updateEmployee above) -
  // mirrors AccountStore.uploadProfilePicture: the dialog that calls this
  // never navigates away on success, it just stays open showing the
  // updated list, so there's nothing for a caller to subscribe to.
  uploadDocument(employeeId: string, file: File): void {
    this.documentsError.set(null);
    this.documentUploading.set(true);

    this.employeeService
      .uploadDocument(employeeId, file)
      .pipe(finalize(() => this.documentUploading.set(false)))
      .subscribe({
        next: (document) => {
          this.documents.update((current) => [document, ...current]);
          this.notificationService.showSuccess('Document uploaded successfully.');
        },
        error: (error: unknown) => this.documentsError.set(extractErrorMessage(error)),
      });
  }

  deleteDocument(employeeId: string, documentId: string): void {
    this.documentsError.set(null);
    this.deletingDocumentIds.update((current) => new Set(current).add(documentId));

    this.employeeService
      .deleteDocument(employeeId, documentId)
      .pipe(
        finalize(() =>
          this.deletingDocumentIds.update((current) => {
            const next = new Set(current);
            next.delete(documentId);
            return next;
          }),
        ),
      )
      .subscribe({
        next: () => {
          this.documents.update((current) => current.filter((doc) => doc.id !== documentId));
          this.notificationService.showSuccess('Document deleted successfully.');
        },
        error: (error: unknown) => this.documentsError.set(extractErrorMessage(error)),
      });
  }
}
