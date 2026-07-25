/**
 * The shape components/stores actually work with - `createdAt` is a real
 * `Date`. `publicId`/`resourceType` are dropped entirely (same trimming
 * precedent as `Employee` dropping `deletedAt`): deletion happens by
 * `documentId`, never `publicId`, and `resourceType` is Cloudinary's own
 * bookkeeping the frontend has no reason to read.
 */
export interface EmployeeDocument {
  id: string;
  employeeId: string;
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedBy: string | null;
  createdAt: Date;
}
