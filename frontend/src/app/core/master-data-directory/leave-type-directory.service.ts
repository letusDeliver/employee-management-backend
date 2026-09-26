import { Injectable } from '@angular/core';

import { MasterDataDirectory } from './master-data-directory';

/** `leaveType:read` is granted to every role, so no permission short-circuit is needed. */
@Injectable({ providedIn: 'root' })
export class LeaveTypeDirectoryService extends MasterDataDirectory {
  constructor() {
    // silentErrors: the apply dialog shows a load failure itself (blocking, with a Retry), so no toast.
    super({ path: '/leave-types', listKey: 'leaveTypes', silentErrors: true });
  }
}
