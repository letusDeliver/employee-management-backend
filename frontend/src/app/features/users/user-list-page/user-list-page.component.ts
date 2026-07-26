import { Component, OnInit, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';
import { ActivatedRoute, Router } from '@angular/router';

import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { UserListQuery, UserSortField } from '../data-access/user.model';
import { UsersStore } from '../data-access/users.store';
import { UserFilters, UserToolbarComponent } from './user-toolbar.component';
import { UserTableComponent } from './user-table.component';

const SORTABLE_FIELDS: readonly UserSortField[] = ['name', 'email', 'createdAt'];

/**
 * Smart, routed (§10/§9). Owns URL <-> query synchronization on top of
 * `UsersStore` - reads the initial page/limit/search/role/sortBy/order
 * from the URL on load (so a bookmarked or refreshed list URL restores
 * the exact same view), and writes the current query back to the URL
 * (via `replaceUrl`, not pushing a new history entry per keystroke/page
 * click) after every change. Delegates all rendering to
 * `UserToolbarComponent`/`UserTableComponent`, mirroring
 * `EmployeeListPageComponent`'s split exactly.
 */
@Component({
  selector: 'app-user-list-page',
  imports: [
    UserToolbarComponent,
    UserTableComponent,
    MatIconModule,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './user-list-page.component.html',
  styleUrl: './user-list-page.component.scss',
})
export class UserListPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly usersStore = inject(UsersStore);
  protected readonly icons = ICON_NAMES;

  protected readonly initialFilters = computed<UserFilters>(() => {
    const query = this.usersStore.query();
    return { search: query.search, role: query.role };
  });

  // Distinguishes "no users exist at all" from "this filter matched
  // nothing" - the two need different EmptyStateComponent copy, same
  // pattern as EmployeeListPageComponent's hasActiveFilters.
  protected readonly hasActiveFilters = computed(() => {
    const query = this.usersStore.query();
    return Boolean(query.search || query.role);
  });

  ngOnInit(): void {
    this.usersStore.setInitialQuery(this.buildInitialQueryFromUrl());
    this.usersStore.loadList();
  }

  protected onFiltersChange(filters: UserFilters): void {
    this.usersStore.setFilters(filters);
    this.syncQueryParamsToUrl();
  }

  protected onPageChange(event: PageEvent): void {
    this.usersStore.setPage(event.pageIndex + 1, event.pageSize);
    this.syncQueryParamsToUrl();
  }

  protected onSortChange(sort: Sort): void {
    if (!sort.direction) {
      // MatSort's "cleared" third-click state - keep the previous sort
      // rather than sending a request with no direction at all.
      return;
    }
    this.usersStore.setSort(sort.active as UserSortField, sort.direction);
    this.syncQueryParamsToUrl();
  }

  private buildInitialQueryFromUrl(): UserListQuery {
    const params = this.route.snapshot.queryParamMap;

    const page = Number(params.get('page'));
    const limit = Number(params.get('limit'));
    const sortByParam = params.get('sortBy');
    const orderParam = params.get('order');

    return {
      page: Number.isInteger(page) && page >= 1 ? page : 1,
      limit: Number.isInteger(limit) && limit >= 1 ? limit : 10,
      search: params.get('search') ?? undefined,
      role: params.get('role') ?? undefined,
      sortBy: (SORTABLE_FIELDS as readonly string[]).includes(sortByParam ?? '')
        ? (sortByParam as UserSortField)
        : 'createdAt',
      order: orderParam === 'asc' ? 'asc' : 'desc',
    };
  }

  private syncQueryParamsToUrl(): void {
    const query = this.usersStore.query();

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: query.page,
        limit: query.limit,
        search: query.search || null,
        role: query.role || null,
        sortBy: query.sortBy,
        order: query.order,
      },
      replaceUrl: true,
    });
  }
}
