import { Injectable } from '@angular/core';

import { MasterDataDirectory } from './master-data-directory';

/**
 * `holidayCalendar:read` is granted to every role. Only `id / name / status` are read from each
 * calendar, so this reads `/holiday-calendars` directly rather than importing the Holiday
 * Calendar feature (blueprint §1: a feature never imports another feature).
 */
@Injectable({ providedIn: 'root' })
export class HolidayCalendarDirectoryService extends MasterDataDirectory {
  constructor() {
    super({ path: '/holiday-calendars', listKey: 'holidayCalendars' });
  }
}
