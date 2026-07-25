import { Injectable, inject, signal } from '@angular/core';
import { Observable, finalize, tap } from 'rxjs';

import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
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
 * Signal-based Store (blueprint §6) - orchestrates `EmployeeService` and
 * holds list/pagination/query state. Mutations never update local state
 * optimistically - `createEmployee`/`updateEmployee`/`deleteEmployee`
 * only patch `employees`/`selected` from the server's actual response,
 * after the request resolves (blueprint §6's explicit no-optimistic-UI
 * rule), matching the backend's own "mutation + audit log commit
 * together or not at all" guarantee in spirit.
 */
@Injectable({ providedIn: 'root' })
export class EmployeeStore {
  private readonly employeeService = inject(EmployeeService);

  readonly employees = signal<Employee[]>([]);
  readonly pagination = signal<Paginated>(DEFAULT_PAGINATION);
  readonly query = signal<EmployeeListQuery>(DEFAULT_QUERY);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly selected = signal<Employee | null>(null);
  readonly selectedLoading = signal(false);
  readonly selectedError = signal<string | null>(null);

  readonly documents = signal<EmployeeDocument[]>([]);
  readonly documentsLoading = signal(false);
  readonly documentsError = signal<string | null>(null);
  readonly documentUploading = signal(false);

  loadList(): void {
    this.error.set(null);
    this.loading.set(true);

    this.employeeService
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
    this.query.update((current) => ({ ...current, page, limit }));
    this.loadList();
  }

  setSort(sortBy: EmployeeListQuery['sortBy'], order: EmployeeListQuery['order']): void {
    this.query.update((current) => ({ ...current, sortBy, order, page: 1 }));
    this.loadList();
  }

  setFilters(filters: Partial<Pick<EmployeeListQuery, 'search' | 'department' | 'jobTitle' | 'managerId'>>): void {
    this.query.update((current) => ({ ...current, ...filters, page: 1 }));
    this.loadList();
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
      tap((employee) => this.employees.update((current) => [employee, ...current])),
    );
  }

  updateEmployee(id: string, request: UpdateEmployeeRequest): Observable<Employee> {
    return this.employeeService.update(id, request).pipe(
      tap((employee) => {
        this.employees.update((current) => current.map((existing) => (existing.id === id ? employee : existing)));
        if (this.selected()?.id === id) {
          this.selected.set(employee);
        }
      }),
    );
  }

  deleteEmployee(id: string): Observable<void> {
    return this.employeeService.delete(id).pipe(
      tap(() => this.employees.update((current) => current.filter((existing) => existing.id !== id))),
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
        next: (document) => this.documents.update((current) => [document, ...current]),
        error: (error: unknown) => this.documentsError.set(extractErrorMessage(error)),
      });
  }

  deleteDocument(employeeId: string, documentId: string): void {
    this.documentsError.set(null);

    this.employeeService.deleteDocument(employeeId, documentId).subscribe({
      next: () => this.documents.update((current) => current.filter((doc) => doc.id !== documentId)),
      error: (error: unknown) => this.documentsError.set(extractErrorMessage(error)),
    });
  }
}
