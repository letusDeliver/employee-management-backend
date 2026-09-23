import {
  CreateMasterDataRequest,
  MasterDataRecord,
  UpdateMasterDataRequest,
} from '../../../shared/master-data/master-data.models';
import { Paginated } from '../../../shared/models/paginated.model';

/**
 * Designation (the job title) is structurally a `MasterDataRecord` - `id /
 * name / code? / status / createdAt / updatedAt`, verified identical to
 * Department's contract against the backend module. Its domain types are
 * aliases of the shared shapes, kept as this feature's own names so it can
 * diverge later without touching `shared/`. No DTO/Model/Mapper split: zero
 * wire/domain divergence.
 */
export type Designation = MasterDataRecord;
export type CreateDesignationRequest = CreateMasterDataRequest;
export type UpdateDesignationRequest = UpdateMasterDataRequest;

// The wire shapes: each endpoint returns its own key, never a generic envelope (blueprint §0).
export interface DesignationsListResponse {
  designations: Designation[];
  pagination: Paginated;
}

export interface DesignationResponse {
  designation: Designation;
}
