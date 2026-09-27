import { Injectable, computed, inject, signal } from '@angular/core';
import { EMPTY, Observable, expand, finalize, map, reduce, tap } from 'rxjs';

import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { ReviewCycle } from './performance.models';
import { ReviewCycleService } from './review-cycle.service';

const PAGE_SIZE = 100;

/**
 * Every review cycle, for NAMES (a review carries only `reviewCycleId`) and for the OPEN cycles a new
 * review may be created in. Feature-local: only Performance references cycles. `MasterDataDirectory` is
 * not reused because it is typed to ACTIVE/INACTIVE; cycles are OPEN/CLOSED.
 *
 * No long-lived cache: pages call `refresh()` on entry. A failed load is exposed (`error`); a name then
 * degrades to "Unknown cycle", and the new-review dialog blocks with a Retry (a cycle is mandatory).
 */
@Injectable({ providedIn: 'root' })
export class ReviewCycleLookup {
  private readonly api = inject(ReviewCycleService);

  readonly cycles = signal<ReviewCycle[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly byId = computed(() => new Map(this.cycles().map((cycle) => [cycle.id, cycle])));

  /** Cycles a review may be created in, newest first. */
  readonly open = computed(() => this.cycles().filter((cycle) => cycle.status === 'OPEN'));

  refresh(): Observable<ReviewCycle[]> {
    this.error.set(null);
    this.loading.set(true);
    const page = (number: number) => this.api.list({ page: number, limit: PAGE_SIZE, sortBy: 'startDate', order: 'desc' });

    return page(1).pipe(
      expand((result) => (result.pagination.page < result.pagination.totalPages ? page(result.pagination.page + 1) : EMPTY)),
      map((result) => result.items),
      reduce((all, items) => [...all, ...items], [] as ReviewCycle[]),
      tap({
        next: (cycles) => this.cycles.set(cycles),
        error: (failure: unknown) => this.error.set(extractErrorMessage(failure)),
      }),
      finalize(() => this.loading.set(false)),
    );
  }

  nameOf(id: string): string {
    return this.byId().get(id)?.name ?? 'Unknown cycle';
  }

  get(id: string): ReviewCycle | undefined {
    return this.byId().get(id);
  }
}
