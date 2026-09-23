import { Component, inject } from '@angular/core';

import { ICON_NAMES } from '../../../shared/icon-names';
import { MasterDataListPageComponent } from '../../../shared/master-data/master-data-list-page.component';
import { DesignationStore } from '../data-access/designation.store';

/**
 * Routed at `/designations`. The whole screen is `MasterDataListPageComponent`;
 * this wrapper supplies only what is Designation's own - its store (which
 * carries the wording), its icon, its permission prefix, and a description
 * that reinforces the job-title-versus-function distinction from Department
 * (docs/domain-designation.md §10).
 */
@Component({
  selector: 'app-designation-list-page',
  imports: [MasterDataListPageComponent],
  template: `<app-master-data-list-page
    [store]="store"
    [icon]="icons.work"
    permissionPrefix="designation"
    description="The job titles employees can hold."
  />`,
})
export class DesignationListPageComponent {
  protected readonly store = inject(DesignationStore);
  protected readonly icons = ICON_NAMES;
}
