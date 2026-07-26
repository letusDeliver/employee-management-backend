import { Component, OnInit, inject } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { UsersStore } from '../data-access/users.store';
import { UserTableComponent } from './user-table.component';

/**
 * Admin-only (`user:list`, gated by `permissionGuard` at the route
 * level). Smart component: injects `UsersStore`, owns the search-term
 * binding; delegates all rendering to `UserTableComponent`.
 */
@Component({
  selector: 'app-user-list-page',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    UserTableComponent,
    PageHeaderComponent,
    InlineBannerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './user-list-page.component.html',
  styleUrl: './user-list-page.component.scss',
})
export class UserListPageComponent implements OnInit {
  protected readonly usersStore = inject(UsersStore);
  protected readonly icons = ICON_NAMES;

  ngOnInit(): void {
    this.usersStore.loadUsers();
  }

  protected onSearchChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.usersStore.searchTerm.set(value);
  }
}
