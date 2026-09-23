import { Injectable, inject } from '@angular/core';

import { MasterDataLabels } from '../../../shared/master-data/master-data.models';
import { MasterDataStore } from '../../../shared/master-data/master-data.store';
import { CreateDepartmentRequest, Department, UpdateDepartmentRequest } from './department.models';
import { DepartmentService } from './department.service';

/**
 * All list/mutation behaviour lives in `MasterDataStore`; this class only
 * supplies Department's HTTP service and its wording.
 */
@Injectable({ providedIn: 'root' })
export class DepartmentStore extends MasterDataStore<Department, CreateDepartmentRequest, UpdateDepartmentRequest> {
  protected readonly api = inject(DepartmentService);
  readonly labels: MasterDataLabels = { singular: 'Department', plural: 'Departments' };
}
