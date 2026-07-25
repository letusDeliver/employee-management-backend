/** Exact wire shape - `publicId`/`resourceType` are Cloudinary bookkeeping the frontend never uses (see the mapper). */
export interface EmployeeDocumentDto {
  id: string;
  employeeId: string;
  url: string;
  publicId: string;
  resourceType: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedBy: string | null;
  createdAt: string;
}

export interface EmployeeDocumentResponse {
  document: EmployeeDocumentDto;
}

export interface EmployeeDocumentsListResponse {
  documents: EmployeeDocumentDto[];
}
