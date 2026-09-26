import { HttpClient, HttpContext } from '@angular/common/http';
import { computed, inject, signal } from '@angular/core';
import { Observable, ReplaySubject, catchError, finalize, forkJoin, map, of, switchMap, tap, throwError } from 'rxjs';

import { Paginated } from '../../shared/models/paginated.model';
import { extractErrorMessage } from '../../shared/utils/extract-error-message.util';
import { toHttpParams } from '../../shared/utils/http-params.util';
import { API_BASE_URL } from '../config/api-base-url.token';
import { SKIP_GLOBAL_ERROR_NOTIFICATION } from '../http/http-context-tokens';

/** The only fields a lookup needs from a master-data record. */
export interface DirectoryEntry {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

/** One `<mat-option>`: `inactive` marks a record that is shown only because it is the current value. */
export interface DirectoryOption {
  id: string;
  label: string;
  inactive: boolean;
}

export interface DirectoryConfig {
  /** e.g. `/departments` */
  path: string;
  /** The endpoint's own response key, e.g. `departments` (there is no generic envelope - blueprint §0). */
  listKey: string;
  /**
   * Skip the global error toast for this directory's requests. For a directory whose failure every
   * consumer already shows itself (Leave's apply dialog blocks with a banner and a Retry), where the toast
   * would only repeat it. Off by default: the older consumers rely on the toast.
   */
  silentErrors?: boolean;
}

// The API's maximum page size (a request for 101 is a 400).
const PAGE_SIZE = 100;

const SILENT = new HttpContext().set(SKIP_GLOBAL_ERROR_NOTIFICATION, true);

/**
 * A `core/` lookup over one governed master-data list (Department, Designation,
 * Branch), for the features that must *reference* those records without owning
 * them - blueprint §1 forbids a feature importing another feature, so Employees
 * cannot reach into `features/departments`. Same role `UserDirectoryService`
 * plays for users, with three deliberate differences:
 *
 * - It **pages through every page**. The list endpoints cap `limit` at 100 and the
 *   dev data already holds 69 departments and 74 designations, so "fetch one
 *   page" would silently truncate soon.
 * - It **holds no long-lived cache**. Master data changes (an admin creates or
 *   deactivates a department), and the Department screens must not have to know
 *   who caches them; each consuming page just calls `refresh()` on entry - a
 *   handful of small GETs. Concurrent calls share one in-flight load.
 * - Two views of the same data: `entries()` (every record, for display names and
 *   filters - an employee keeps a department even after it is deactivated) and
 *   `active()` (only assignable records, for form selects - a positive allowlist,
 *   `status === 'ACTIVE'`, never "not INACTIVE").
 *
 * Whether a failed load is fatal is each consumer's decision, not this class's:
 * a mandatory FK's select must block its form; a list column can degrade to "—".
 *
 * Like `MasterDataStore`, a base class kept deliberately narrow: a concrete
 * directory is `providedIn: 'root'` and supplies only its `DirectoryConfig`.
 */
export class MasterDataDirectory {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  readonly entries = signal<DirectoryEntry[]>([]);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);

  readonly active = computed(() => this.entries().filter((entry) => entry.status === 'ACTIVE'));

  private readonly byId = computed(() => new Map(this.entries().map((entry) => [entry.id, entry])));
  private inFlight$: Observable<DirectoryEntry[]> | null = null;

  constructor(private readonly config: DirectoryConfig) {}

  /**
   * (Re)loads every page. Starts immediately - the returned observable is only for
   * callers that want to await completion; state is in the signals either way, so
   * an ignored result is safe. Concurrent calls share one load.
   */
  refresh(): Observable<DirectoryEntry[]> {
    if (this.inFlight$) {
      return this.inFlight$;
    }

    this.loading.set(true);
    this.error.set(null);

    const result$ = new ReplaySubject<DirectoryEntry[]>(1);
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

  /** `null` means "not resolvable" (not loaded, unknown id, or no id) - the caller supplies its own honest fallback, never a raw id. */
  nameOf(id: string | null | undefined): string | null {
    if (!id) {
      return null;
    }
    return this.byId().get(id)?.name ?? null;
  }

  /**
   * Select options for a form: every assignable record, plus - first - the record's
   * *current* value when it is no longer assignable. The backend rejects assigning an
   * inactive record but happily keeps an existing assignment, so an edit form must
   * still be able to display "Engineering (inactive)" instead of a blank select.
   * A current id the directory has never heard of is shown as "Unknown" rather than
   * silently dropped. Empty until loaded.
   */
  optionsFor(currentId: string | null | undefined): DirectoryOption[] {
    if (!this.loaded()) {
      return [];
    }

    const options: DirectoryOption[] = this.active().map((entry) => ({ id: entry.id, label: entry.name, inactive: false }));

    if (currentId && !options.some((option) => option.id === currentId)) {
      const current = this.byId().get(currentId);
      options.unshift({ id: currentId, label: current?.name ?? 'Unknown', inactive: current ? true : false });
    }

    return options;
  }

  private fetchAll(): Observable<DirectoryEntry[]> {
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

  private fetchPage(page: number): Observable<{ items: DirectoryEntry[]; pagination: Paginated }> {
    const params = toHttpParams({ page, limit: PAGE_SIZE, sortBy: 'name', order: 'asc' });

    return this.http
      .get<Record<string, unknown>>(`${this.baseUrl}${this.config.path}`, { params, context: this.config.silentErrors ? SILENT : undefined })
      .pipe(
        map((response) => ({
          items: (response[this.config.listKey] as DirectoryEntry[]) ?? [],
          pagination: response['pagination'] as Paginated,
        })),
      );
  }
}
