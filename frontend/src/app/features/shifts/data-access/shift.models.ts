import { MasterDataBase, MasterDataQueryBase, MasterDataStatus } from '../../../shared/master-data/master-data.models';
import { Paginated } from '../../../shared/models/paginated.model';

/** The backend's Weekday enum, in calendar order (Monday first) - the order the UI always presents them. */
export const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/**
 * A work shift. Unlike Department/Designation it has NO `code`, so it is not a
 * `MasterDataRecord` - it satisfies only `MasterDataBase` (`id / name / status`), which
 * is all `MasterDataStore` needs. `startTime`/`endTime` are 24-hour `"HH:mm"` strings
 * with no timezone (the backend stores them as strings, not instants), so there is no
 * DTO/Model/Mapper split: zero wire/domain divergence.
 */
export interface Shift extends MasterDataBase {
  startTime: string;
  endTime: string;
  workingDays: Weekday[];
  createdAt: string;
  updatedAt: string;
}

/** The backend's own sort whitelist (`shift.validation.js`); `code` does not exist here. */
export type ShiftSortField = 'name' | 'startTime' | 'endTime' | 'status' | 'createdAt';

export interface ShiftListQuery extends MasterDataQueryBase {
  sortBy: ShiftSortField;
}

export interface CreateShiftRequest {
  name: string;
  startTime: string;
  endTime: string;
  workingDays: Weekday[];
}

export interface UpdateShiftRequest {
  name?: string;
  startTime?: string;
  endTime?: string;
  workingDays?: Weekday[];
  status?: MasterDataStatus;
}

// The wire shapes: each endpoint returns its own key, never a generic envelope (blueprint §0).
export interface ShiftsListResponse {
  shifts: Shift[];
  pagination: Paginated;
}

export interface ShiftResponse {
  shift: Shift;
}
