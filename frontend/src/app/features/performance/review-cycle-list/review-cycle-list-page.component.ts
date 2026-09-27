import { Component, DestroyRef, OnInit, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { Sort } from '@angular/material/sort';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { createConfirmDelete } from '../../../shared/master-data/confirm-delete';
import { ReviewCycle, ReviewCycleSortField, ReviewCycleStatus } from '../data-access/performance.models';
import { ReviewCycleListStore } from '../data-access/review-cycle-list.store';
import { ReviewCycleDialogComponent, ReviewCycleDialogData } from './review-cycle-dialog.component';
import { ReviewCycleTableComponent } from './review-cycle-table.component';

/**
 * Routed at `/review-cycles` (ADMIN - `reviewCycle:create` gates the route; every role may READ cycles,
 * but they meet cycle names on their reviews). A cycle with reviews cannot be deleted - the backend's
 * 409 ("close it instead") is shown as it is; closing is the retirement path.
 */
@Component({
  selector: 'app-review-cycle-list-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
    ReviewCycleTableComponent,
  ],
  providers: [ReviewCycleListStore],
  templateUrl: './review-cycle-list-page.component.html',
  styleUrl: './review-cycle-list-page.component.scss',
})
export class ReviewCycleListPageComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sessionStore = inject(SessionStore);
  protected readonly store = inject(ReviewCycleListStore);
  protected readonly icons = ICON_NAMES;

  private readonly confirmDelete = createConfirmDelete((id) => this.store.delete(id));
  protected readonly deleteError = this.confirmDelete.deleteError;
  protected readonly deletingIds = this.confirmDelete.deletingIds;

  protected readonly canEdit = computed(() => this.sessionStore.hasAnyPermission('reviewCycle:update'));
  protected readonly search = new FormControl('', { nonNullable: true });

  protected readonly hasFilters = computed(() => !!this.store.query().search || !!this.store.query().status);

  ngOnInit(): void {
    this.store.load();
    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.store.setSearch(value.trim()));
  }

  protected onStatusChange(status: ReviewCycleStatus | ''): void {
    this.store.setStatus(status || undefined);
  }

  protected onPageChange(event: PageEvent): void {
    this.store.setPage(event.pageIndex + 1, event.pageSize);
  }

  protected onSortChange(sort: Sort): void {
    if (!sort.direction) {
      return;
    }
    this.store.setSort(sort.active as ReviewCycleSortField, sort.direction);
  }

  protected openDialog(cycle: ReviewCycle | null): void {
    this.dialog.open<ReviewCycleDialogComponent, ReviewCycleDialogData, ReviewCycle>(ReviewCycleDialogComponent, {
      data: { cycle, store: this.store },
      width: '480px',
      maxWidth: '95vw',
    });
  }

  protected onDeleteRequested(cycle: ReviewCycle): void {
    this.confirmDelete.request(cycle.id, {
      title: 'Delete review cycle?',
      message: `"${cycle.name}" will be deleted. A cycle that already has reviews can't be deleted - close it instead.`,
    });
  }
}
