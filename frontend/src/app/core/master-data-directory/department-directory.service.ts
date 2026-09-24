import { Injectable } from '@angular/core';

import { MasterDataDirectory } from './master-data-directory';

/** `department:read` is granted to every role, so no permission short-circuit is needed (unlike `UserDirectoryService`). */
@Injectable({ providedIn: 'root' })
export class DepartmentDirectoryService extends MasterDataDirectory {
  constructor() {
    super({ path: '/departments', listKey: 'departments' });
  }
}
