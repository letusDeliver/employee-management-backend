import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { DepartmentDirectoryService } from '../../../core/master-data-directory/department-directory.service';
import { DesignationDirectoryService } from '../../../core/master-data-directory/designation-directory.service';
import { DirectoryEntry } from '../../../core/master-data-directory/master-data-directory';
import { UserDirectoryService } from '../../../core/users/user-directory.service';
import { Employee, EmployeeListQuery } from '../data-access/employee.model';
import { EmployeeStore } from '../data-access/employee.store';
import { makeEmployee } from '../data-access/employee.testing';
import { EmployeeListPageComponent } from './employee-list-page.component';
import { EmployeeToolbarComponent } from './employee-toolbar.component';

const entry = (id: string, name: string): DirectoryEntry => ({ id, name, status: 'ACTIVE' });

const directoryFake = (map: Record<string, string>, refresh = () => of([] as DirectoryEntry[])) => ({
  entries: signal(Object.entries(map).map(([id, name]) => entry(id, name))),
  nameOf: (id: string | null | undefined) => (id ? (map[id] ?? null) : null),
  refresh: vi.fn(refresh),
});

const DEFAULT_QUERY: EmployeeListQuery = { page: 1, limit: 10, sortBy: 'createdAt', order: 'desc' };

describe('EmployeeListPageComponent', () => {
  const store = {
    employees: signal<Employee[]>([]),
    pagination: signal({ page: 1, limit: 10, total: 0, totalPages: 0 }),
    loading: signal(false),
    error: signal<string | null>(null),
    query: signal<EmployeeListQuery>(DEFAULT_QUERY),
    loadList: vi.fn(),
    setFilters: vi.fn(),
    setPage: vi.fn(),
    setSort: vi.fn(),
    deleteEmployee: vi.fn(),
  };
  const dialog = { open: vi.fn() };

  let departments: ReturnType<typeof directoryFake>;
  let designations: ReturnType<typeof directoryFake>;

  const setup = (
    options: {
      rows?: Employee[];
      permissions?: string[];
      departmentsRefresh?: () => ReturnType<typeof of>;
      lookups?: { departments?: Record<string, string>; designations?: Record<string, string> };
    } = {},
  ): { fixture: ComponentFixture<EmployeeListPageComponent>; el: HTMLElement } => {
    const permissions = options.permissions ?? [];
    departments = directoryFake(options.lookups?.departments ?? { 'dep-1': 'Engineering' }, options.departmentsRefresh as never);
    designations = directoryFake(options.lookups?.designations ?? { 'des-1': 'Backend Engineer' });
    store.employees.set(options.rows ?? [makeEmployee()]);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: EmployeeStore, useValue: store },
        { provide: MatDialog, useValue: dialog },
        {
          provide: SessionStore,
          useValue: { hasAnyPermission: (...keys: string[]) => keys.some((key) => permissions.includes(key)) },
        },
        { provide: UserDirectoryService, useValue: { ensureLoaded: () => of([]), resolveDisplayName: () => null } },
        { provide: DepartmentDirectoryService, useValue: departments },
        { provide: DesignationDirectoryService, useValue: designations },
      ],
    });

    const fixture = TestBed.createComponent(EmployeeListPageComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  beforeEach(() => {
    store.loadList.mockReset();
    store.setFilters.mockReset();
    store.deleteEmployee.mockReset();
    dialog.open.mockReset();
    store.error.set(null);
    store.loading.set(false);
    store.query.set(DEFAULT_QUERY);
  });

  it('loads the list AND both directories on entry', () => {
    setup();

    expect(store.loadList).toHaveBeenCalledTimes(1);
    expect(departments.refresh).toHaveBeenCalledTimes(1);
    expect(designations.refresh).toHaveBeenCalledTimes(1);
  });

  it('a directory failure degrades to dashes and shows NO error - names are display-only on this page', () => {
    const { el } = setup({ departmentsRefresh: () => throwError(() => new HttpErrorResponse({ status: 500 })) as never });

    expect(el.querySelector('app-inline-banner')).toBeNull();
    expect(el.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);
  });

  it('hands the directories\' records to the toolbar and forwards its filters to the store', () => {
    const { fixture } = setup();
    const toolbar = fixture.debugElement.query(By.directive(EmployeeToolbarComponent));

    expect((toolbar.componentInstance as EmployeeToolbarComponent).departments().map((d) => d.name)).toEqual(['Engineering']);
    expect((toolbar.componentInstance as EmployeeToolbarComponent).designations().map((d) => d.name)).toEqual(['Backend Engineer']);

    (toolbar.componentInstance as EmployeeToolbarComponent).filtersChange.emit({ departmentId: 'dep-1' });

    expect(store.setFilters).toHaveBeenCalledWith({ departmentId: 'dep-1' });
  });

  describe('empty state', () => {
    it('says "No employees yet" when nothing exists', () => {
      const { el } = setup({ rows: [] });

      expect(el.querySelector('app-empty-state')?.textContent).toContain('No employees yet');
    });

    it.each([
      ['departmentId', { departmentId: 'dep-1' }],
      ['designationId', { designationId: 'des-1' }],
      ['employmentType', { employmentType: 'CONTRACT' as const }],
      ['search', { search: 'zzz' }],
    ])('says the filter matched nothing when only %s is set', (_name, filter) => {
      store.query.set({ ...DEFAULT_QUERY, ...filter });

      const { el } = setup({ rows: [] });

      expect(el.querySelector('app-empty-state')?.textContent).toContain('No employees match your filters');
    });
  });

  it('gates "New Employee" on employee:create', () => {
    expect(setup({ permissions: [] }).el.textContent).not.toContain('New Employee');
    TestBed.resetTestingModule();
    expect(setup({ permissions: ['employee:create'] }).el.textContent).toContain('New Employee');
  });

  describe('delete', () => {
    const clickDelete = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('button[aria-label^="Delete"]')!.click();

    it('asks with a message that names the designation and department', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });
      const { el } = setup({ permissions: ['employee:delete:any'] });

      clickDelete(el);

      expect(dialog.open.mock.calls[0][1].data.message).toBe(
        'Delete the Backend Engineer record in Engineering? This cannot be undone.',
      );
    });

    it('falls back to plain wording when names are unavailable - never "undefined"', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });
      const { el } = setup({ permissions: ['employee:delete:any'], lookups: { departments: {}, designations: {} } });

      clickDelete(el);

      const message = dialog.open.mock.calls[0][1].data.message as string;
      expect(message).toBe('Delete this employee record? This cannot be undone.');
      expect(message).not.toContain('undefined');
    });

    it('deletes only when confirmed', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });
      const { el } = setup({ permissions: ['employee:delete:any'] });

      clickDelete(el);

      expect(store.deleteEmployee).not.toHaveBeenCalled();
    });

    it("deletes on confirmation, and shows the backend's message if it is rejected", () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) });
      store.deleteEmployee.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 409, error: { status: 'error', message: 'Cannot delete right now' } })),
      );
      const { fixture, el } = setup({ permissions: ['employee:delete:any'] });

      clickDelete(el);
      fixture.detectChanges();

      expect(store.deleteEmployee).toHaveBeenCalledWith('emp-1');
      expect(el.querySelector('app-inline-banner')?.textContent).toContain('Cannot delete right now');
    });
  });
});
