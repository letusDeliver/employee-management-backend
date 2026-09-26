import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ColumnDef } from '../../../shared/components/data-table/column-def';
import { DataTableCellDirective } from '../../../shared/components/data-table/data-table-cell.directive';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { Paginated } from '../../../shared/models/paginated.model';
import { LeaveType } from '../data-access/leave.models';

/**
 * Presentational (§9/§10): configures `DataTableComponent` with Leave type's columns. It never
 * injects `SessionStore` - the smart page passes `canEdit` / `canDelete` in. Leave type's own
 * table rather than the shared one: it has no `code`, and shows an entitlement and a paid flag.
 */
@Component({
  selector: 'app-leave-type-table',
  imports: [
    DataTableComponent,
    DataTableCellDirective,
    DatePipe,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './leave-type-table.component.html',
  styleUrl: './leave-type-table.component.scss',
})
export class LeaveTypeTableComponent {
  protected readonly icons = ICON_NAMES;

  readonly rows = input.required<LeaveType[]>();
  readonly loading = input(false);
  readonly pagination = input.required<Paginated>();
  readonly deletingIds = input<ReadonlySet<string>>(new Set());
  readonly canEdit = input(false);
  readonly canDelete = input(false);

  readonly editRequested = output<LeaveType>();
  readonly deleteRequested = output<LeaveType>();
  readonly pageChange = output<PageEvent>();
  readonly sortChange = output<Sort>();

  // The sortable keys are the backend's own sort whitelist (`leaveType.validation.js`). `isPaid` is
  // not sortable server-side.
  protected readonly columns: ColumnDef[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'defaultAnnualEntitlement', header: 'Days per year', sortable: true, nowrap: true },
    { key: 'isPaid', header: 'Pay', nowrap: true },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'createdAt', header: 'Created', sortable: true, nowrap: true },
    { key: 'actions', header: '', stickyEnd: true },
  ];
}
