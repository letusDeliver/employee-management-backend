import { Injectable, inject } from '@angular/core';

import { MasterDataLabels } from '../../../shared/master-data/master-data.models';
import { MasterDataStore } from '../../../shared/master-data/master-data.store';
import {
  CreateHolidayCalendarRequest,
  HolidayCalendar,
  HolidayCalendarListQuery,
  UpdateHolidayCalendarRequest,
} from './holiday-calendar.models';
import { HolidayCalendarService } from './holiday-calendar.service';

/**
 * All list/mutation behaviour lives in `MasterDataStore`; this class only supplies the
 * calendar HTTP service, its list query type (its own sortable columns) and its wording.
 */
@Injectable({ providedIn: 'root' })
export class HolidayCalendarStore extends MasterDataStore<
  HolidayCalendar,
  CreateHolidayCalendarRequest,
  UpdateHolidayCalendarRequest,
  HolidayCalendarListQuery
> {
  protected readonly api = inject(HolidayCalendarService);
  readonly labels: MasterDataLabels = { singular: 'Holiday calendar', plural: 'Holiday calendars' };
}
