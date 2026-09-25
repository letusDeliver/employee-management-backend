import { Injectable, inject } from '@angular/core';

import { MasterDataLabels } from '../../../shared/master-data/master-data.models';
import { MasterDataStore } from '../../../shared/master-data/master-data.store';
import { CreateShiftRequest, Shift, ShiftListQuery, UpdateShiftRequest } from './shift.models';
import { ShiftService } from './shift.service';

/**
 * All list/mutation behaviour lives in `MasterDataStore`; this class only supplies
 * Shift's HTTP service, its list query type (its own sortable columns) and its wording.
 */
@Injectable({ providedIn: 'root' })
export class ShiftStore extends MasterDataStore<Shift, CreateShiftRequest, UpdateShiftRequest, ShiftListQuery> {
  protected readonly api = inject(ShiftService);
  readonly labels: MasterDataLabels = { singular: 'Shift', plural: 'Shifts' };
}
