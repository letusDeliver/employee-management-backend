import { Injectable, inject } from '@angular/core';

import { MasterDataLabels } from '../../../shared/master-data/master-data.models';
import { MasterDataStore } from '../../../shared/master-data/master-data.store';
import { CreateDesignationRequest, Designation, UpdateDesignationRequest } from './designation.models';
import { DesignationService } from './designation.service';

/**
 * All list/mutation behaviour lives in `MasterDataStore`; this class only
 * supplies Designation's HTTP service and its wording.
 */
@Injectable({ providedIn: 'root' })
export class DesignationStore extends MasterDataStore<Designation, CreateDesignationRequest, UpdateDesignationRequest> {
  protected readonly api = inject(DesignationService);
  readonly labels: MasterDataLabels = { singular: 'Designation', plural: 'Designations' };
}
