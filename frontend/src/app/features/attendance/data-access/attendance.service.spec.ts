import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SKIP_GLOBAL_ERROR_NOTIFICATION } from '../../../core/http/http-context-tokens';
import { AttendanceRecord } from './attendance.models';
import { AttendanceService } from './attendance.service';

const record: AttendanceRecord = {
  id: 'a-1',
  employeeId: 'e-1',
  date: '2026-09-15T00:00:00.000Z',
  checkIn: '2026-09-15T09:05:00.000Z',
  checkOut: null,
  isHalfDay: false,
  createdAt: '2026-09-15T09:05:00.000Z',
  updatedAt: '2026-09-15T09:05:00.000Z',
};

describe('AttendanceService', () => {
  let service: AttendanceService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AttendanceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists with only the filters that are set, and maps records + pagination', () => {
    let result: unknown;
    service
      .list({ page: 2, limit: 25, sortBy: 'date', order: 'desc', employeeId: 'e-1', dateFrom: '2026-09-01' })
      .subscribe((value) => (result = value));

    const request = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/attendance'));
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('limit')).toBe('25');
    expect(request.request.params.get('sortBy')).toBe('date');
    expect(request.request.params.get('order')).toBe('desc');
    expect(request.request.params.get('employeeId')).toBe('e-1');
    expect(request.request.params.get('dateFrom')).toBe('2026-09-01');
    expect(request.request.params.has('dateTo')).toBe(false);

    const pagination = { page: 2, limit: 25, total: 26, totalPages: 2 };
    request.flush({ records: [record], pagination });
    expect(result).toEqual({ records: [record], pagination });
  });

  it('creates with POST /attendance and unwraps the record', () => {
    let result: AttendanceRecord | undefined;
    service.create({ employeeId: 'e-1', date: '2026-09-15' }).subscribe((value) => (result = value));

    const request = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/attendance'));
    expect(request.request.body).toEqual({ employeeId: 'e-1', date: '2026-09-15' });
    request.flush({ record });

    expect(result).toEqual(record);
  });

  it('corrects with PATCH /attendance/:id', () => {
    service.update('a-1', { checkOut: null }).subscribe();

    const request = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/attendance/a-1'));
    expect(request.request.body).toEqual({ checkOut: null });
    request.flush({ record });
  });

  it('deletes with DELETE /attendance/:id', () => {
    let done = false;
    service.delete('a-1').subscribe(() => (done = true));

    http
      .expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/attendance/a-1'))
      .flush({ message: 'Attendance record deleted successfully' });

    expect(done).toBe(true);
  });

  it('checks in with POST /attendance/check-in and out with PATCH /attendance/check-out', () => {
    service.checkIn().subscribe();
    http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/attendance/check-in')).flush({ record });

    service.checkOut().subscribe();
    http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/attendance/check-out')).flush({ record });
  });

  it('asks for the caller\'s own status by omitting employeeId', () => {
    service.effectiveStatus('2026-09-15').subscribe();

    const request = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/attendance/effective-status'));
    expect(request.request.params.get('date')).toBe('2026-09-15');
    expect(request.request.params.has('employeeId')).toBe(false);
    request.flush({ employeeId: 'e-1', date: '2026-09-15T00:00:00.000Z', status: 'ABSENT', record: null });
  });

  it('asks for a named employee\'s status with employeeId', () => {
    service.effectiveStatus('2026-09-15', 'e-2').subscribe();

    const request = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/attendance/effective-status'));
    expect(request.request.params.get('employeeId')).toBe('e-2');
    request.flush({ employeeId: 'e-2', date: '2026-09-15T00:00:00.000Z', status: 'HOLIDAY', record: null });
  });

  it('opts EVERY request out of the global error toast, because each screen shows its failure inline', () => {
    const cases: [string, () => void, (r: { method: string; url: string }) => boolean, object][] = [
      ['list', () => service.list({ page: 1, limit: 10, sortBy: 'date', order: 'desc' }).subscribe({ error: () => undefined }), (r) => r.method === 'GET' && r.url.endsWith('/attendance'), {}],
      ['create', () => service.create({ employeeId: 'e-1', date: '2026-09-15' }).subscribe({ error: () => undefined }), (r) => r.method === 'POST' && r.url.endsWith('/attendance'), {}],
      ['update', () => service.update('a-1', { isHalfDay: true }).subscribe({ error: () => undefined }), (r) => r.method === 'PATCH' && r.url.endsWith('/attendance/a-1'), {}],
      ['delete', () => service.delete('a-1').subscribe({ error: () => undefined }), (r) => r.method === 'DELETE', {}],
      ['check-in', () => service.checkIn().subscribe({ error: () => undefined }), (r) => r.url.endsWith('/attendance/check-in'), {}],
      ['check-out', () => service.checkOut().subscribe({ error: () => undefined }), (r) => r.url.endsWith('/attendance/check-out'), {}],
      ['effective status', () => service.effectiveStatus('2026-09-15').subscribe({ error: () => undefined }), (r) => r.url.endsWith('/attendance/effective-status'), {}],
    ];

    for (const [name, call, match] of cases) {
      call();
      const request = http.expectOne((r) => match(r));
      expect(request.request.context.get(SKIP_GLOBAL_ERROR_NOTIFICATION), name).toBe(true);
      request.flush({}, { status: 500, statusText: 'Server Error' });
    }
  });
});
