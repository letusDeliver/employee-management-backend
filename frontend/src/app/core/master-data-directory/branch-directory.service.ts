import { Injectable } from '@angular/core';

import { MasterDataDirectory } from './master-data-directory';

/** `branch:read` is granted to every role. */
@Injectable({ providedIn: 'root' })
export class BranchDirectoryService extends MasterDataDirectory {
  constructor() {
    super({ path: '/branches', listKey: 'branches' });
  }
}
