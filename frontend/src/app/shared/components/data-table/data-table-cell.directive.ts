import { Directive, TemplateRef, inject, input } from '@angular/core';

/**
 * `<ng-template [appDataTableCell]="'salary'" let-row>...</ng-template>`
 * projected into `<app-data-table>` - lets a consumer supply rich,
 * domain-specific cell content (formatted currency, chips, an actions
 * column) for one column, keyed by the same `key` used in its
 * `ColumnDef`, without `DataTableComponent` itself knowing anything
 * about what that content is.
 */
@Directive({
  selector: 'ng-template[appDataTableCell]',
})
export class DataTableCellDirective {
  readonly appDataTableCell = input.required<string>();
  readonly templateRef = inject(TemplateRef);
}
