import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, contentChildren, input, output } from '@angular/core';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';

import { ColumnDef } from './column-def';
import { DataTableCellDirective } from './data-table-cell.directive';

/**
 * Generic, domain-agnostic infrastructure (blueprint §9/§11) - pagination
 * and sorting are entirely **server-side**: this component never fetches
 * anything and never sorts/paginates `rows()` itself, it only reports
 * "the user changed page/sort" via `(pageChange)`/`(sortChange)` and
 * trusts the caller to re-fetch and pass in the new `rows()`. That is a
 * deliberately different contract from `UserTableComponent`'s
 * client-side `MatTableDataSource` (Feature 5) - the two were never
 * meant to share an implementation (see blueprint §9's premature-
 * abstraction principle). `EmployeeTableComponent` is this component's
 * first real, validating consumer.
 *
 * Zero Employees-specific (or any domain-specific) logic lives here -
 * every rich cell is supplied by the caller via a projected
 * `<ng-template [appDataTableCell]="'key'" let-row>`, matched by
 * `ColumnDef.key`; a column with no supplied template just renders
 * `row[key]` as plain text.
 */
@Component({
  selector: 'app-data-table',
  imports: [MatTableModule, MatSortModule, MatPaginatorModule, MatProgressBarModule, NgTemplateOutlet],
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss',
})
export class DataTableComponent<T> {
  readonly columns = input.required<ColumnDef[]>();
  readonly rows = input.required<T[]>();
  readonly loading = input(false);
  readonly totalCount = input(0);
  readonly pageIndex = input(0);
  readonly pageSize = input(10);
  readonly pageSizeOptions = input<number[]>([10, 25, 50]);

  readonly pageChange = output<PageEvent>();
  readonly sortChange = output<Sort>();

  private readonly cellTemplates = contentChildren(DataTableCellDirective);

  protected readonly displayedColumns = computed(() => this.columns().map((column) => column.key));

  protected templateFor(key: string) {
    return this.cellTemplates().find((template) => template.appDataTableCell() === key)?.templateRef;
  }

  protected cellValue(row: T, key: string): unknown {
    return (row as Record<string, unknown>)[key];
  }

  protected onPage(event: PageEvent): void {
    this.pageChange.emit(event);
  }

  protected onSort(sort: Sort): void {
    this.sortChange.emit(sort);
  }
}
