import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { SKIP_GLOBAL_ERROR_NOTIFICATION } from '../http/http-context-tokens';
import { UserDirectoryService } from '../users/user-directory.service';
import { EmployeeDirectoryService, UNKNOWN_EMPLOYEE_LABEL } from './employee-directory.service';

const employee = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  userId: null,
  departmentId: 'dep-1',
  designationId: 'des-1',
  dateOfJoining: '2024-01-05T00:00:00.000Z',
  ...overrides,
});

const pagination = (totalPages: number, page = 1) => ({ page, limit: 100, total: totalPages * 100, totalPages });

describe('EmployeeDirectoryService', () => {
  let directory: EmployeeDirectoryService;
  let http: HttpTestingController;
  const userNames = new Map<string, string>();
  const userDirectory = {
    ensureLoaded: vi.fn(() => of([])),
    resolveDisplayName: (userId: string | null) => (userId ? (userNames.get(userId) ?? null) : null),
  };

  const employeePages = (): TestRequest[] => http.match((r) => r.method === 'GET' && r.url.endsWith('/employees'));
  const lookups = () => ({
    departments: http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/departments')),
    designations: http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/designations')),
  });
  const flushLookups = (): void => {
    const { departments, designations } = lookups();
    departments.flush({ departments: [{ id: 'dep-1', name: 'Sales', status: 'ACTIVE' }], pagination: pagination(1) });
    designations.flush({ designations: [{ id: 'des-1', name: 'Engineer', status: 'ACTIVE' }], pagination: pagination(1) });
  };

  beforeEach(() => {
    userNames.clear();
    userDirectory.ensureLoaded.mockClear();

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: UserDirectoryService, useValue: userDirectory }],
    });

    directory = TestBed.inject(EmployeeDirectoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('refresh', () => {
    it('requests page 1 at the API maximum, in a stable order, and keeps only the fields a lookup needs', () => {
      directory.refresh();

      const [request] = employeePages();
      expect(request.request.params.get('page')).toBe('1');
      expect(request.request.params.get('limit')).toBe('100');
      expect(request.request.params.get('sortBy')).toBe('createdAt');
      expect(request.request.params.get('order')).toBe('asc');
      expect(directory.loading()).toBe(true);

      request.flush({
        employees: [{ ...employee('e-1'), salary: '5000', managerId: null, deletedAt: null }],
        pagination: pagination(1),
      });
      flushLookups();

      expect(directory.entries()).toEqual([
        { id: 'e-1', userId: null, departmentId: 'dep-1', designationId: 'des-1', managerId: null, dateOfJoining: '2024-01-05' },
      ]);
      expect(directory.loaded()).toBe(true);
      expect(directory.loading()).toBe(false);
      expect(directory.error()).toBeNull();
    });

    it("opts out of the global error toast, because every consumer shows the failure itself", () => {
      directory.refresh().subscribe({ error: () => undefined });

      const [request] = employeePages();
      expect(request.request.context.get(SKIP_GLOBAL_ERROR_NOTIFICATION)).toBe(true);
      request.flush({ status: 'error', message: 'boom' }, { status: 500, statusText: 'Server Error' });
      flushLookups();
    });

    it('pages through EVERY page, in order', () => {
      directory.refresh();

      employeePages()[0].flush({ employees: [employee('a'), employee('b')], pagination: pagination(3) });

      const rest = employeePages();
      expect(rest.map((r) => r.request.params.get('page')).sort()).toEqual(['2', '3']);
      rest.find((r) => r.request.params.get('page') === '3')!.flush({ employees: [employee('e')], pagination: pagination(3, 3) });
      rest.find((r) => r.request.params.get('page') === '2')!.flush({ employees: [employee('c'), employee('d')], pagination: pagination(3, 2) });
      flushLookups();

      expect(directory.entries().map((e) => e.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('shares one in-flight load between concurrent callers', () => {
      directory.refresh();
      directory.refresh();

      const requests = employeePages();
      expect(requests).toHaveLength(1);
      requests[0].flush({ employees: [], pagination: pagination(1) });
      flushLookups();
    });

    it('holds no long-lived cache: a later refresh asks the server again', () => {
      directory.refresh();
      employeePages()[0].flush({ employees: [employee('a')], pagination: pagination(1) });
      flushLookups();

      directory.refresh();
      expect(employeePages()).toHaveLength(1);
      // Drain the lookups the second refresh started.
      flushLookups();
      employeePages();
    });

    it('exposes a failed EMPLOYEE load as an error, because a picker without employees is useless', () => {
      let failed = false;
      directory.refresh().subscribe({ error: () => (failed = true) });

      employeePages()[0].flush({ status: 'error', message: 'boom' }, { status: 500, statusText: 'Server Error' });
      flushLookups();

      expect(failed).toBe(true);
      expect(directory.error()).toBe('boom');
      expect(directory.loaded()).toBe(false);
      expect(directory.loading()).toBe(false);
    });

    it('does NOT fail when only the name lookups fail - labels just degrade', () => {
      directory.refresh();

      employeePages()[0].flush({ employees: [employee('e-1')], pagination: pagination(1) });
      const { departments, designations } = lookups();
      departments.flush({ status: 'error', message: 'down' }, { status: 500, statusText: 'Server Error' });
      designations.flush({ status: 'error', message: 'down' }, { status: 500, statusText: 'Server Error' });

      expect(directory.error()).toBeNull();
      expect(directory.loaded()).toBe(true);
      expect(directory.labelOf('e-1')).toBe(UNKNOWN_EMPLOYEE_LABEL);
    });

    it('also asks for the user names (which the user directory itself skips without permission)', () => {
      directory.refresh();
      employeePages()[0].flush({ employees: [], pagination: pagination(1) });
      flushLookups();

      expect(userDirectory.ensureLoaded).toHaveBeenCalledTimes(1);
    });
  });

  describe('labelOf', () => {
    const loadWith = (employees: Record<string, unknown>[]): void => {
      directory.refresh();
      employeePages()[0].flush({ employees, pagination: pagination(1) });
      flushLookups();
    };

    it("is the linked user's name when it can be resolved", () => {
      userNames.set('u-1', 'Priya Sharma');
      loadWith([employee('e-1', { userId: 'u-1' })]);

      expect(directory.labelOf('e-1')).toBe('Priya Sharma');
    });

    it('falls back to "Designation, Department" when the name cannot be resolved (a MANAGER cannot list users)', () => {
      loadWith([employee('e-1', { userId: 'u-1' }), employee('e-2', { userId: null })]);

      expect(directory.labelOf('e-1')).toBe('Engineer, Sales');
      expect(directory.labelOf('e-2')).toBe('Engineer, Sales');
    });

    it('uses whichever of designation / department is known when only one resolves', () => {
      directory.refresh();
      employeePages()[0].flush({ employees: [employee('e-1')], pagination: pagination(1) });
      const { departments, designations } = lookups();
      departments.flush({ status: 'error', message: 'down' }, { status: 500, statusText: 'Server Error' });
      designations.flush({ designations: [{ id: 'des-1', name: 'Engineer', status: 'ACTIVE' }], pagination: pagination(1) });

      expect(directory.labelOf('e-1')).toBe('Engineer');
    });

    it('is "Unknown employee" for an id it has never heard of - never the raw id', () => {
      loadWith([employee('e-1')]);

      expect(directory.labelOf('nobody')).toBe(UNKNOWN_EMPLOYEE_LABEL);
      expect(directory.labelOf(null)).toBe(UNKNOWN_EMPLOYEE_LABEL);
      expect(directory.labelOf(undefined)).toBe(UNKNOWN_EMPLOYEE_LABEL);
      expect(directory.labelOf('nobody')).not.toContain('nobody');
    });
  });

  describe('managerId and ownEmployeeId (what decides who may approve leave)', () => {
    it('keeps the direct manager link, null when there is none', () => {
      directory.refresh();
      employeePages()[0].flush({
        employees: [employee('e-boss'), employee('e-report', { managerId: 'e-boss' })],
        pagination: pagination(1),
      });
      flushLookups();

      expect(directory.entries().map((e) => [e.id, e.managerId])).toEqual([
        ['e-boss', null],
        ['e-report', 'e-boss'],
      ]);
    });

    it('answers managerIdOf: the manager, null for none, undefined for an id it does not know', () => {
      directory.refresh();
      employeePages()[0].flush({
        employees: [employee('e-boss'), employee('e-report', { managerId: 'e-boss' })],
        pagination: pagination(1),
      });
      flushLookups();

      expect(directory.managerIdOf('e-report')).toBe('e-boss');
      expect(directory.managerIdOf('e-boss')).toBeNull();
      expect(directory.managerIdOf('nobody')).toBeUndefined();
      expect(directory.managerIdOf(null)).toBeUndefined();
    });

    it("finds the signed-in user's own employee by userId, and null when there is none", () => {
      directory.refresh();
      employeePages()[0].flush({
        employees: [employee('e-1', { userId: 'u-1' }), employee('e-2', { userId: 'u-2' }), employee('e-3')],
        pagination: pagination(1),
      });
      flushLookups();

      expect(directory.ownEmployeeId('u-2')).toBe('e-2');
      expect(directory.ownEmployeeId('u-unlinked')).toBeNull();
      expect(directory.ownEmployeeId(null)).toBeNull();
      expect(directory.ownEmployeeId(undefined)).toBeNull();
    });

    it('is null before the directory has loaded', () => {
      expect(directory.ownEmployeeId('u-1')).toBeNull();
    });
  });

  describe('personNameOf / detailOf', () => {
    it("returns the linked user's name, or null when it cannot be resolved", () => {
      userNames.set('u-1', 'Priya Sharma');
      directory.refresh();
      employeePages()[0].flush({
        employees: [employee('e-named', { userId: 'u-1' }), employee('e-nameless', { userId: 'u-2' }), employee('e-nouser')],
        pagination: pagination(1),
      });
      flushLookups();

      expect(directory.personNameOf('e-named')).toBe('Priya Sharma');
      expect(directory.personNameOf('e-nameless')).toBeNull();
      expect(directory.personNameOf('e-nouser')).toBeNull();
      expect(directory.personNameOf('nobody')).toBeNull();
      expect(directory.personNameOf(null)).toBeNull();
    });

    it('gives a joining-date detail for a known employee and null for an unknown one', () => {
      directory.refresh();
      employeePages()[0].flush({ employees: [employee('e-1', { dateOfJoining: '2024-01-05T00:00:00.000Z' })], pagination: pagination(1) });
      flushLookups();

      expect(directory.detailOf('e-1')).toMatch(/^Joined .*2024/);
      expect(directory.detailOf('nobody')).toBeNull();
      expect(directory.detailOf(undefined)).toBeNull();
    });
  });

  describe('options', () => {
    it('lists every employee sorted by label, each with a joining-date detail to tell twins apart', () => {
      userNames.set('u-z', 'Zoe');
      userNames.set('u-a', 'Amit');

      directory.refresh();
      employeePages()[0].flush({
        employees: [
          employee('e-z', { userId: 'u-z' }),
          employee('e-twin-late', { dateOfJoining: '2025-06-01T00:00:00.000Z' }),
          employee('e-a', { userId: 'u-a' }),
          employee('e-twin-early', { dateOfJoining: '2023-02-01T00:00:00.000Z' }),
        ],
        pagination: pagination(1),
      });
      flushLookups();

      const options = directory.options();
      expect(options.map((o) => o.id)).toEqual(['e-a', 'e-twin-early', 'e-twin-late', 'e-z']);
      expect(options[0].label).toBe('Amit');
      expect(options[1].label).toBe('Engineer, Sales');
      expect(options[1].label).toBe(options[2].label);
      expect(options[1].detail).not.toBe(options[2].detail);
      expect(options[1].detail).toMatch(/^Joined .*2023/);
    });

    it('is empty until loaded', () => {
      expect(directory.options()).toEqual([]);
    });
  });
});
