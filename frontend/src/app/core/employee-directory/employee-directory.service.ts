import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, ReplaySubject, catchError, finalize, forkJoin, map, of, switchMap, tap, throwError } from 'rxjs';

import { Paginated } from '../../shared/models/paginated.model';
import { parseDateOnly } from '../../shared/utils/date-only.util';
import { extractErrorMessage } from '../../shared/utils/extract-error-message.util';
import { toHttpParams } from '../../shared/utils/http-params.util';
import { API_BASE_URL } from '../config/api-base-url.token';
import { SKIP_GLOBAL_ERROR_NOTIFICATION } from '../http/http-context-tokens';
import { DepartmentDirectoryService } from '../master-data-directory/department-directory.service';
import { DesignationDirectoryService } from '../master-data-directory/designation-directory.service';
import { UserDirectoryService } from '../users/user-directory.service';

/** Only the fields a lookup needs from an employee - `features/employees` owns the full model. */
export interface DirectoryEmployee {
  id: string;
  userId: string | null;
  departmentId: string;
  designationId: string;
  /** `YYYY-MM-DD` part of an ISO instant. */
  dateOfJoining: string;
}

/** One picker option: `detail` tells apart two employees whose `label` is the same. */
export interface EmployeeOption {
  id: string;
  label: string;
  detail: string;
}

// The API's maximum page size (a request for 101 is a 400).
const PAGE_SIZE = 100;

// Every consumer shows a directory failure itself (a warning banner, the picker's own message with a
// Retry), so the global error toast would only repeat it.
const INLINE_ERROR = new HttpContext().set(SKIP_GLOBAL_ERROR_NOTIFICATION, true);

export const UNKNOWN_EMPLOYEE_LABEL = 'Unknown employee';

/**
 * A `core/` lookup over EVERY employee, for features that must *reference* an employee without
 * owning the Employees screens (Attendance now; Leave, Payroll, Performance later) - blueprint §1
 * forbids one feature importing another. Same shape as `MasterDataDirectory`: it pages through
 * every page (the list caps `limit` at 100), holds NO long-lived cache (each consuming page calls
 * `refresh()` on entry) and shares one in-flight load between concurrent callers.
 *
 * **An employee has no name.** The Employee API returns only `userId`, department, designation and
 * similar ids; a person's name lives on the linked User, and `GET /users` is ADMIN-only. So
 * `labelOf` is, in order: the user's name (when the caller may list users and the employee has a
 * linked user) -> "Designation, Department" -> "Unknown employee". Never a raw id. A MANAGER, who
 * manages attendance but cannot list users, therefore sees the second form; `options` add the
 * joining date so two people with the same designation and department can still be told apart.
 *
 * Failure policy - each consumer's decision, like `MasterDataDirectory`: the employee list itself
 * is the functional dependency (a picker with no options is useless), so its failure is exposed as
 * `error`; the user, department and designation lookups only make labels friendlier, so their
 * failures are swallowed here and a label just degrades.
 *
 * A second paging implementation next to `MasterDataDirectory`'s, on purpose: that one is typed to
 * the `id/name/status` master-data shape. Extract a shared pager if a third consumer appears.
 */
@Injectable({ providedIn: 'root' })
export class EmployeeDirectoryService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly userDirectory = inject(UserDirectoryService);
  private readonly departments = inject(DepartmentDirectoryService);
  private readonly designations = inject(DesignationDirectoryService);

  readonly entries = signal<DirectoryEmployee[]>([]);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);

  private readonly byId = computed(() => new Map(this.entries().map((entry) => [entry.id, entry])));

  /** Every employee as a picker option, sorted by label. Recomputes as the name lookups arrive. */
  readonly options = computed<EmployeeOption[]>(() =>
    this.entries()
      .map((entry) => ({ id: entry.id, label: this.labelOf(entry.id), detail: this.joinedDetail(entry) }))
      .sort((a, b) => a.label.localeCompare(b.label) || a.detail.localeCompare(b.detail)),
  );

  private inFlight$: Observable<DirectoryEmployee[]> | null = null;

  /**
   * (Re)loads every employee and, best effort, the names that label them. Starts immediately - the
   * returned observable is only for callers that want to await the EMPLOYEE load; state is in the
   * signals either way. Concurrent calls share one load.
   */
  refresh(): Observable<DirectoryEmployee[]> {
    if (this.inFlight$) {
      return this.inFlight$;
    }

    this.loading.set(true);
    this.error.set(null);

    // Enrichment only: a failed lookup must never fail the directory.
    this.userDirectory.ensureLoaded().subscribe({ error: () => undefined });
    this.departments.refresh().subscribe({ error: () => undefined });
    this.designations.refresh().subscribe({ error: () => undefined });

    const result$ = new ReplaySubject<DirectoryEmployee[]>(1);
    this.inFlight$ = result$.asObservable();

    this.fetchAll()
      .pipe(
        tap((entries) => {
          this.entries.set(entries);
          this.loaded.set(true);
        }),
        catchError((error: unknown) => {
          this.error.set(extractErrorMessage(error));
          return throwError(() => error);
        }),
        finalize(() => {
          this.loading.set(false);
          this.inFlight$ = null;
        }),
      )
      .subscribe({
        next: (entries) => result$.next(entries),
        error: (error: unknown) => result$.error(error),
        complete: () => result$.complete(),
      });

    return result$.asObservable();
  }

  /**
   * The linked user's name, or `null` when the employee has no user or the caller cannot list users
   * (a MANAGER). Callers use `null` to show `detailOf` as well, so two nameless people still differ.
   */
  personNameOf(employeeId: string | null | undefined): string | null {
    const entry = employeeId ? this.byId().get(employeeId) : undefined;
    return entry ? this.userDirectory.resolveDisplayName(entry.userId) : null;
  }

  /** "Joined 5 Jan 2024" - what tells two same-label employees apart. `null` for an unknown id. */
  detailOf(employeeId: string | null | undefined): string | null {
    const entry = employeeId ? this.byId().get(employeeId) : undefined;
    return entry ? this.joinedDetail(entry) : null;
  }

  /** See the class comment for the fallback order. Always a readable string. */
  labelOf(employeeId: string | null | undefined): string {
    const entry = employeeId ? this.byId().get(employeeId) : undefined;
    if (!entry) {
      return UNKNOWN_EMPLOYEE_LABEL;
    }

    const name = this.personNameOf(entry.id);
    if (name) {
      return name;
    }

    const role = [this.designations.nameOf(entry.designationId), this.departments.nameOf(entry.departmentId)]
      .filter((part): part is string => part !== null)
      .join(', ');

    return role || UNKNOWN_EMPLOYEE_LABEL;
  }

  private joinedDetail(entry: DirectoryEmployee): string {
    const joined = parseDateOnly(entry.dateOfJoining).toLocaleDateString(undefined, { dateStyle: 'medium' });
    return `Joined ${joined}`;
  }

  private fetchAll(): Observable<DirectoryEmployee[]> {
    return this.fetchPage(1).pipe(
      switchMap((first) => {
        const { totalPages } = first.pagination;

        if (totalPages <= 1) {
          return of(first.items);
        }

        const remaining = Array.from({ length: totalPages - 1 }, (_, index) => this.fetchPage(index + 2));

        return forkJoin(remaining).pipe(map((rest) => [first.items, ...rest.map((page) => page.items)].flat()));
      }),
    );
  }

  private fetchPage(page: number): Observable<{ items: DirectoryEmployee[]; pagination: Paginated }> {
    // createdAt asc is a stable order to page through: new hires land on the last page.
    const params = toHttpParams({ page, limit: PAGE_SIZE, sortBy: 'createdAt', order: 'asc' });

    return this.http.get<{ employees: DirectoryEmployee[]; pagination: Paginated }>(`${this.baseUrl}/employees`, { params, context: INLINE_ERROR }).pipe(
      map((response) => ({
        items: (response.employees ?? []).map((employee) => ({
          id: employee.id,
          userId: employee.userId,
          departmentId: employee.departmentId,
          designationId: employee.designationId,
          dateOfJoining: employee.dateOfJoining.slice(0, 10),
        })),
        pagination: response.pagination,
      })),
    );
  }
}
