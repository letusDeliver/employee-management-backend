import { Injectable } from '@angular/core';

import { MasterDataDirectory } from './master-data-directory';

/** `designation:read` is granted to every role. */
@Injectable({ providedIn: 'root' })
export class DesignationDirectoryService extends MasterDataDirectory {
  constructor() {
    super({ path: '/designations', listKey: 'designations' });
  }
}
