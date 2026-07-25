import { Component, OnInit, inject } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';

import { EmployeeSortField } from '../data-access/employee.model';
import { EmployeeStore } from '../data-access/employee.store';
import { EmployeeFilters, EmployeeToolbarComponent } from './employee-toolbar.component';
import { EmployeeTableComponent } from './employee-table.component';

/**
 * Smart, routed (§10/§9). Owns nothing about rendering rows or
 * resolving names - delegates entirely to `EmployeeToolbarComponent`/
 * `EmployeeTableComponent`, injects `EmployeeStore` for all list state.
 */
@Component({
  selector: 'app-employee-list-page',
  imports: [EmployeeToolbarComponent, EmployeeTableComponent],
  templateUrl: './employee-list-page.component.html',
  styleUrl: './employee-list-page.component.scss',
})
export class EmployeeListPageComponent implements OnInit {
  protected readonly employeeStore = inject(EmployeeStore);

  ngOnInit(): void {
    this.employeeStore.loadList();
  }

  protected onFiltersChange(filters: EmployeeFilters): void {
    this.employeeStore.setFilters(filters);
  }

  protected onPageChange(event: PageEvent): void {
    this.employeeStore.setPage(event.pageIndex + 1, event.pageSize);
  }

  protected onSortChange(sort: Sort): void {
    if (!sort.direction) {
      // MatSort's "cleared" third-click state - keep the previous sort
      // rather than sending a request with no direction at all.
      return;
    }
    this.employeeStore.setSort(sort.active as EmployeeSortField, sort.direction);
  }
}
