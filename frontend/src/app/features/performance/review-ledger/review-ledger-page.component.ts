import { Component, DestroyRef, OnInit, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { Sort } from '@angular/material/sort';
import { Router } from '@angular/router';

import { SessionStore } from '../../../core/auth/session.store';
import { EmployeeDirectoryService } from '../../../core/employee-directory/employee-directory.service';
import { EmployeePickerComponent } from '../../../shared/components/employee-picker/employee-picker.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { PerformanceReview, ReviewSortField, ReviewStatus } from '../data-access/performance.models';
import { ReviewContext } from '../data-access/review-context';
import { ReviewCycleLookup } from '../data-access/review-cycle-lookup';
import { ReviewLedgerStore } from '../data-access/review-ledger.store';
import { REVIEW_STATUSES, REVIEW_STATUS_META } from '../data-access/review-rules';
import { NewReviewDialogComponent, NewReviewDialogData } from './new-review-dialog.component';
import { ReviewLedgerTableComponent } from './review-ledger-table.component';

/**
 * Routed at `/performance-reviews` (MANAGER: `manage:reports`, ADMIN: `manage:any`). The reviews the
 * caller writes or oversees, filtered by cycle, status and employee. A MANAGER's own review appears here
 * too (the server has no reviewer filter) and is labelled "About you". New Review opens the dialog and
 * then the new review, where its rating is written.
 */
@Component({
  selector: 'app-review-ledger-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
    EmployeePickerComponent,
    ReviewLedgerTableComponent,
  ],
  providers: [ReviewLedgerStore],
  templateUrl: './review-ledger-page.component.html',
  styleUrl: './review-ledger-page.component.scss',
})
export class ReviewLedgerPageComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sessionStore = inject(SessionStore);
  protected readonly context = inject(ReviewContext);
  protected readonly cycles = inject(ReviewCycleLookup);
  protected readonly directory = inject(EmployeeDirectoryService);
  protected readonly store = inject(ReviewLedgerStore);
  protected readonly icons = ICON_NAMES;

  protected readonly statusOptions = REVIEW_STATUSES.map((value) => ({ value, label: REVIEW_STATUS_META[value].label }));
  protected readonly employeeFilter = new FormControl<string | null>(null);

  protected readonly canCreate = computed(() =>
    this.sessionStore.hasAnyPermission('performanceReview:create:any', 'performanceReview:create:reports'),
  );

  protected readonly hasFilters = computed(() => {
    const query = this.store.query();
    return !!query.reviewCycleId || !!query.status || !!query.employeeId;
  });

  ngOnInit(): void {
    this.store.load();
    this.cycles.refresh().subscribe({ error: () => undefined });
    this.context.load().subscribe();
    this.employeeFilter.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((employeeId) => this.store.setFilters({ employeeId: employeeId ?? undefined }));
  }

  protected onCycleChange(reviewCycleId: string): void {
    this.store.setFilters({ reviewCycleId: reviewCycleId || undefined });
  }

  protected onStatusChange(status: ReviewStatus | ''): void {
    this.store.setFilters({ status: status || undefined });
  }

  protected onPageChange(event: PageEvent): void {
    this.store.setPage(event.pageIndex + 1, event.pageSize);
  }

  protected onSortChange(sort: Sort): void {
    if (!sort.direction) {
      return;
    }
    this.store.setSort(sort.active as ReviewSortField, sort.direction);
  }

  protected reloadNames(): void {
    this.context.load().subscribe();
    this.cycles.refresh().subscribe({ error: () => undefined });
  }

  protected openNewReview(): void {
    this.dialog
      .open<NewReviewDialogComponent, NewReviewDialogData, PerformanceReview>(NewReviewDialogComponent, {
        data: {
          store: this.store,
          createAny: this.sessionStore.hasAnyPermission('performanceReview:create:any'),
        },
        width: '520px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((review) => {
        if (review) {
          void this.router.navigate(['/performance-reviews', review.id]);
        }
      });
  }
}
