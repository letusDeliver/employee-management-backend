import { Injectable } from '@angular/core';

import { MasterDataDirectory } from './master-data-directory';

/**
 * `shift:read` is granted to every role. A shift has more fields than `id / name / status`
 * (times, working days) but a lookup needs only those three, so the extra fields are simply
 * ignored - the same reason this reads `/shifts` directly rather than importing the Shift feature.
 */
@Injectable({ providedIn: 'root' })
export class ShiftDirectoryService extends MasterDataDirectory {
  constructor() {
    super({ path: '/shifts', listKey: 'shifts' });
  }
}
