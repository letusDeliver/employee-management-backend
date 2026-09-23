import { Component, inject } from '@angular/core';

import { ICON_NAMES } from '../../../shared/icon-names';
import { MasterDataListPageComponent } from '../../../shared/master-data/master-data-list-page.component';
import { DepartmentStore } from '../data-access/department.store';

/**
 * Routed at `/departments`. The whole screen is `MasterDataListPageComponent`;
 * this wrapper supplies only what is Department's own - its store (which
 * carries the wording), its icon, and its permission prefix.
 */
@Component({
  selector: 'app-department-list-page',
  imports: [MasterDataListPageComponent],
  template: `<app-master-data-list-page [store]="store" [icon]="icons.apartment" permissionPrefix="department" />`,
})
export class DepartmentListPageComponent {
  protected readonly store = inject(DepartmentStore);
  protected readonly icons = ICON_NAMES;
}
