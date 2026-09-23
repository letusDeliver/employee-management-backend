import { Observable } from 'rxjs';

import { Paginated } from '../models/paginated.model';

/**
 * The shape shared by every "governed master data" aggregate the backend
 * exposes as `id / name / code? / status / createdAt / updatedAt` -
 * Department and Designation today, and Branch structurally (its extra
 * `holidayCalendarId` passes through as an additional field). Deliberately
 * domain-agnostic: nothing here knows which aggregate it describes.
 *
 * Structural, not nominal - a domain declares `type Department =
 * MasterDataRecord` (or extends it) in its own `*.models.ts`, which is also
 * the place it can diverge from this shape later without touching `shared/`.
 */
export type MasterDataStatus = 'ACTIVE' | 'INACTIVE';

export interface MasterDataRecord {
  id: string;
  name: string;
  code: string | null;
  status: MasterDataStatus;
  createdAt: string;
  updatedAt: string;
}

export type MasterDataSortField = 'name' | 'code' | 'status' | 'createdAt';

export interface MasterDataListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: MasterDataStatus;
  sortBy: MasterDataSortField;
  order: 'asc' | 'desc';
}

export interface CreateMasterDataRequest {
  name: string;
  code?: string;
}

export interface UpdateMasterDataRequest {
  name?: string;
  code?: string | null;
  status?: MasterDataStatus;
}

export interface MasterDataPage<T extends MasterDataRecord> {
  items: T[];
  pagination: Paginated;
}

/**
 * What `MasterDataStore` needs from a domain's HTTP service. Each domain's
 * service stays its own explicit, thin `HttpClient` wrapper (blueprint §8) -
 * it owns the endpoint path and maps its own response keys (`departments`,
 * `designations`, ...) into the neutral `items`, so a future divergence in
 * one domain's wire shape never touches `shared/`.
 */
export interface MasterDataApi<
  T extends MasterDataRecord,
  C extends CreateMasterDataRequest = CreateMasterDataRequest,
  U extends UpdateMasterDataRequest = UpdateMasterDataRequest,
> {
  list(query: MasterDataListQuery): Observable<MasterDataPage<T>>;
  create(request: C): Observable<T>;
  update(id: string, request: U): Observable<T>;
  delete(id: string): Observable<void>;
}

/** The only wording the shared screens need from a domain: `Department` / `Departments`. */
export interface MasterDataLabels {
  singular: string;
  plural: string;
}
