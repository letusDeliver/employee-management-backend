import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { BranchDirectoryService } from './branch-directory.service';
import { DepartmentDirectoryService } from './department-directory.service';
import { DesignationDirectoryService } from './designation-directory.service';
import { DirectoryEntry } from './master-data-directory';
import { HolidayCalendarDirectoryService } from './holiday-calendar-directory.service';
import { ShiftDirectoryService } from './shift-directory.service';

const entry = (id: string, name: string, status: DirectoryEntry['status'] = 'ACTIVE'): DirectoryEntry => ({ id, name, status });
const pagination = (totalPages: number, page = 1) => ({ page, limit: 100, total: totalPages * 100, totalPages });

describe('MasterDataDirectory (through DepartmentDirectoryService)', () => {
  let directory: DepartmentDirectoryService;
  let http: HttpTestingController;

  const pageRequests = (): TestRequest[] =>
    http.match((req) => req.method === 'GET' && req.url.endsWith('/departments'));

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    directory = TestBed.inject(DepartmentDirectoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('refresh', () => {
    it('requests page 1 at the API maximum (100), sorted by name, and maps the `departments` key', () => {
      directory.refresh();

      const [request] = pageRequests();
      expect(request.request.params.get('page')).toBe('1');
      expect(request.request.params.get('limit')).toBe('100');
      expect(request.request.params.get('sortBy')).toBe('name');
      expect(request.request.params.get('order')).toBe('asc');
      expect(directory.loading()).toBe(true);

      request.flush({ departments: [entry('d1', 'Engineering')], pagination: pagination(1) });

      expect(directory.entries()).toEqual([entry('d1', 'Engineering')]);
      expect(directory.loaded()).toBe(true);
      expect(directory.loading()).toBe(false);
      expect(directory.error()).toBeNull();
    });

    it('pages through EVERY page, not just the first - and keeps the order', () => {
      directory.refresh();

      const [first] = pageRequests();
      first.flush({ departments: [entry('a', 'A'), entry('b', 'B')], pagination: pagination(3) });

      const rest = pageRequests();
      expect(rest.map((request) => request.request.params.get('page')).sort()).toEqual(['2', '3']);
      rest.find((request) => request.request.params.get('page') === '3')!.flush({ departments: [entry('e', 'E')], pagination: pagination(3, 3) });
      rest.find((request) => request.request.params.get('page') === '2')!.flush({ departments: [entry('c', 'C'), entry('d', 'D')], pagination: pagination(3, 2) });

      expect(directory.entries().map((e) => e.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(directory.loading()).toBe(false);
    });

    it('shares one in-flight load between concurrent callers', () => {
      directory.refresh();
      directory.refresh();
      directory.refresh();

      const requests = pageRequests();
      expect(requests).toHaveLength(1);
      requests[0].flush({ departments: [], pagination: pagination(1) });
    });

    it('holds no long-lived cache: a later refresh asks the server again', () => {
      directory.refresh();
      pageRequests()[0].flush({ departments: [entry('d1', 'Engineering')], pagination: pagination(1) });

      directory.refresh();
      const again = pageRequests();
      expect(again).toHaveLength(1);
      again[0].flush({ departments: [entry('d1', 'Engineering'), entry('d2', 'Finance')], pagination: pagination(1) });

      expect(directory.entries()).toHaveLength(2);
    });

    it('surfaces the backend message on failure, errors the returned observable, and keeps the previous entries', () => {
      directory.refresh();
      pageRequests()[0].flush({ departments: [entry('d1', 'Engineering')], pagination: pagination(1) });

      let caught: unknown;
      directory.refresh().subscribe({ error: (error: unknown) => (caught = error) });
      pageRequests()[0].flush({ status: 'error', message: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(directory.error()).toBe('boom');
      expect(caught).toBeTruthy();
      expect(directory.loading()).toBe(false);
      expect(directory.entries()).toHaveLength(1);
    });

    it('recovers: a retry after a failure loads normally and clears the error', () => {
      directory.refresh();
      pageRequests()[0].flush({ status: 'error', message: 'boom' }, { status: 500, statusText: 'Server Error' });
      expect(directory.error()).toBe('boom');

      directory.refresh();
      pageRequests()[0].flush({ departments: [entry('d1', 'Engineering')], pagination: pagination(1) });

      expect(directory.error()).toBeNull();
      expect(directory.loaded()).toBe(true);
    });
  });

  describe('views over the data', () => {
    beforeEach(() => {
      directory.refresh();
      pageRequests()[0].flush({
        departments: [entry('d1', 'Engineering'), entry('d2', 'Legacy Ops', 'INACTIVE'), entry('d3', 'Finance')],
        pagination: pagination(1),
      });
    });

    it('active() is only ACTIVE records - entries() is everyone', () => {
      expect(directory.active().map((e) => e.id)).toEqual(['d1', 'd3']);
      expect(directory.entries()).toHaveLength(3);
    });

    it('nameOf resolves an INACTIVE record too (an employee keeps it), and is null when it cannot', () => {
      expect(directory.nameOf('d2')).toBe('Legacy Ops');
      expect(directory.nameOf('nope')).toBeNull();
      expect(directory.nameOf(null)).toBeNull();
      expect(directory.nameOf(undefined)).toBeNull();
    });

    it('optionsFor: only assignable records when there is no current value', () => {
      expect(directory.optionsFor(null).map((o) => o.label)).toEqual(['Engineering', 'Finance']);
    });

    it('optionsFor: an ACTIVE current value is not duplicated', () => {
      expect(directory.optionsFor('d1').map((o) => o.id)).toEqual(['d1', 'd3']);
    });

    it('optionsFor: a since-deactivated current value is shown first and flagged inactive', () => {
      const options = directory.optionsFor('d2');

      expect(options[0]).toEqual({ id: 'd2', label: 'Legacy Ops', inactive: true });
      expect(options.slice(1).map((o) => o.id)).toEqual(['d1', 'd3']);
    });

    it('optionsFor: a current id the directory has never heard of is "Unknown", not silently dropped', () => {
      expect(directory.optionsFor('ghost')[0]).toEqual({ id: 'ghost', label: 'Unknown', inactive: false });
    });
  });

  it('optionsFor is empty until the directory has loaded', () => {
    expect(directory.optionsFor('d1')).toEqual([]);
    expect(directory.optionsFor(null)).toEqual([]);
  });
});

describe('directory providers', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it.each([
    ['department', () => TestBed.inject(DepartmentDirectoryService), '/departments', 'departments'],
    ['designation', () => TestBed.inject(DesignationDirectoryService), '/designations', 'designations'],
    ['branch', () => TestBed.inject(BranchDirectoryService), '/branches', 'branches'],
    ['shift', () => TestBed.inject(ShiftDirectoryService), '/shifts', 'shifts'],
    ['holiday calendar', () => TestBed.inject(HolidayCalendarDirectoryService), '/holiday-calendars', 'holidayCalendars'],
  ])('%s directory reads its own endpoint and response key', (_name, factory, path, key) => {
    const directory = factory();
    directory.refresh();

    const request = http.expectOne((req) => req.url.endsWith(path));
    request.flush({ [key]: [entry('x1', 'Thing')], pagination: pagination(1) });

    expect(directory.nameOf('x1')).toBe('Thing');
  });
});
