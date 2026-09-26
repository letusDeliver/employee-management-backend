import { Injectable, inject } from '@angular/core';

import { MasterDataLabels } from '../../../shared/master-data/master-data.models';
import { MasterDataStore } from '../../../shared/master-data/master-data.store';
import { CreateLeaveTypeRequest, LeaveType, LeaveTypeListQuery, UpdateLeaveTypeRequest } from './leave.models';
import { LeaveTypeService } from './leave-type.service';

/**
 * All list/mutation behaviour lives in `MasterDataStore`; this class only supplies Leave type's HTTP
 * service, its list query type (its own sortable columns) and its wording. Like Shift it has no
 * `code`, so it satisfies only `MasterDataBase` and keeps its own table, dialog and page.
 */
@Injectable({ providedIn: 'root' })
export class LeaveTypeStore extends MasterDataStore<
  LeaveType,
  CreateLeaveTypeRequest,
  UpdateLeaveTypeRequest,
  LeaveTypeListQuery
> {
  protected readonly api = inject(LeaveTypeService);
  readonly labels: MasterDataLabels = { singular: 'Leave type', plural: 'Leave types' };
}
