import { EmployeeDocumentDto } from './employee-document.dto';
import { EmployeeDocument } from './employee-document.model';

export function toEmployeeDocumentModel(dto: EmployeeDocumentDto): EmployeeDocument {
  return {
    id: dto.id,
    employeeId: dto.employeeId,
    url: dto.url,
    fileName: dto.fileName,
    mimeType: dto.mimeType,
    size: dto.size,
    uploadedBy: dto.uploadedBy,
    createdAt: new Date(dto.createdAt),
  };
}
