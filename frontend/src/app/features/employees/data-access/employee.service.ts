import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api-base-url.token';
import { Paginated } from '../../../shared/models/paginated.model';
import { toHttpParams } from '../../../shared/utils/http-params.util';
import { EmployeeDocumentResponse, EmployeeDocumentsListResponse } from './employee-document.dto';
import { toEmployeeDocumentModel } from './employee-document.mapper';
import { EmployeeDocument } from './employee-document.model';
import { EmployeeResponse, EmployeesListResponse } from './employee.dto';
import { toCreateEmployeeRequestDto, toEmployeeModel, toUpdateEmployeeRequestDto } from './employee.mapper';
import { CreateEmployeeRequest, Employee, EmployeeListQuery, UpdateEmployeeRequest } from './employee.model';

/** Thin HttpClient wrapper - one method per real endpoint, zero business logic (blueprint §8). */
@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(query: EmployeeListQuery): Observable<{ employees: Employee[]; pagination: Paginated }> {
    const params = toHttpParams(query);

    return this.http.get<EmployeesListResponse>(`${this.baseUrl}/employees`, { params }).pipe(
      map(({ employees, pagination }) => ({
        employees: employees.map(toEmployeeModel),
        pagination,
      })),
    );
  }

  getById(id: string): Observable<Employee> {
    return this.http
      .get<EmployeeResponse>(`${this.baseUrl}/employees/${id}`)
      .pipe(map(({ employee }) => toEmployeeModel(employee)));
  }

  create(request: CreateEmployeeRequest): Observable<Employee> {
    return this.http
      .post<EmployeeResponse>(`${this.baseUrl}/employees`, toCreateEmployeeRequestDto(request))
      .pipe(map(({ employee }) => toEmployeeModel(employee)));
  }

  update(id: string, request: UpdateEmployeeRequest): Observable<Employee> {
    return this.http
      .patch<EmployeeResponse>(`${this.baseUrl}/employees/${id}`, toUpdateEmployeeRequestDto(request))
      .pipe(map(({ employee }) => toEmployeeModel(employee)));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/employees/${id}`).pipe(map(() => undefined));
  }

  uploadDocument(employeeId: string, file: File): Observable<EmployeeDocument> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http
      .post<EmployeeDocumentResponse>(`${this.baseUrl}/employees/${employeeId}/documents`, formData)
      .pipe(map(({ document }) => toEmployeeDocumentModel(document)));
  }

  listDocuments(employeeId: string): Observable<EmployeeDocument[]> {
    return this.http
      .get<EmployeeDocumentsListResponse>(`${this.baseUrl}/employees/${employeeId}/documents`)
      .pipe(map(({ documents }) => documents.map(toEmployeeDocumentModel)));
  }

  deleteDocument(employeeId: string, documentId: string): Observable<void> {
    return this.http
      .delete<{ message: string }>(`${this.baseUrl}/employees/${employeeId}/documents/${documentId}`)
      .pipe(map(() => undefined));
  }
}
