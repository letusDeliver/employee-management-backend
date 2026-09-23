import { Paginated } from '../../../shared/models/paginated.model';
import {
  CreateMasterDataRequest,
  MasterDataRecord,
  UpdateMasterDataRequest,
} from '../../../shared/master-data/master-data.models';

/**
 * Department is structurally a `MasterDataRecord` (`id / name / code? /
 * status / createdAt / updatedAt`, no `holidayCalendarId`), so its domain
 * types are aliases of the shared shapes - kept as this feature's own names
 * so Department can diverge later without touching `shared/`. No DTO/Model/
 * Mapper split: zero wire/domain divergence (same reasoning as Branch/Auth).
 */
export type Department = MasterDataRecord;
export type CreateDepartmentRequest = CreateMasterDataRequest;
export type UpdateDepartmentRequest = UpdateMasterDataRequest;

// The wire shapes: each endpoint returns its own key, never a generic envelope (blueprint §0).
export interface DepartmentsListResponse {
  departments: Department[];
  pagination: Paginated;
}

export interface DepartmentResponse {
  department: Department;
}
