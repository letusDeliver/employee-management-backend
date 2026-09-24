import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Sort } from '@angular/material/sort';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { DepartmentDirectoryService } from '../../../core/master-data-directory/department-directory.service';
import { DesignationDirectoryService } from '../../../core/master-data-directory/designation-directory.service';
import { UserDirectoryService } from '../../../core/users/user-directory.service';
import { makeEmployee } from '../data-access/employee.testing';
import { Employee } from '../data-access/employee.model';
import { EmployeeTableComponent } from './employee-table.component';

const names = (map: Record<string, string>) => ({ nameOf: (id: string | null | undefined) => (id ? (map[id] ?? null) : null) });

describe('EmployeeTableComponent', () => {
  const setup = (
    rows: Employee[],
    options: { permissions?: string[]; departments?: Record<string, string>; designations?: Record<string, string> } = {},
  ): { fixture: ComponentFixture<EmployeeTableComponent>; el: HTMLElement } => {
    const permissions = options.permissions ?? [];

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: SessionStore,
          useValue: { hasAnyPermission: (...keys: string[]) => keys.some((key) => permissions.includes(key)) },
        },
        { provide: UserDirectoryService, useValue: { ensureLoaded: () => of([]), resolveDisplayName: () => null } },
        { provide: DepartmentDirectoryService, useValue: names(options.departments ?? { 'dep-1': 'Engineering' }) },
        { provide: DesignationDirectoryService, useValue: names(options.designations ?? { 'des-1': 'Backend Engineer' }) },
      ],
    });

    const fixture = TestBed.createComponent(EmployeeTableComponent);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('pagination', { page: 1, limit: 10, total: rows.length, totalPages: 1 });
    fixture.detectChanges();

    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  it('shows department, designation and employment type BY NAME - never a blank, an id or "undefined"', () => {
    const { el } = setup([makeEmployee({ employmentType: 'PART_TIME' })]);
    const row = el.querySelector('tr.mat-mdc-row')!.textContent!;

    expect(row).toContain('Engineering');
    expect(row).toContain('Backend Engineer');
    expect(row).toContain('Part-time');
    expect(row).not.toContain('dep-1');
    expect(row).not.toContain('undefined');
  });

  it('degrades a name that cannot be resolved to a plain dash, still without leaking the id', () => {
    const { el } = setup([makeEmployee({ departmentId: 'dep-gone', designationId: 'des-gone' })], {
      departments: {},
      designations: {},
    });
    const row = el.querySelector('tr.mat-mdc-row')!.textContent!;

    expect(row).toContain('—');
    expect(row).not.toContain('dep-gone');
    expect(row).not.toContain('des-gone');
    expect(row).not.toContain('undefined');
  });

  it('shows the label for every employment type', () => {
    const { el } = setup(
      (['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'] as const).map((employmentType, i) => makeEmployee({ id: `e${i}`, employmentType })),
    );
    const text = el.textContent!;

    for (const label of ['Full-time', 'Part-time', 'Contract', 'Intern']) {
      expect(text).toContain(label);
    }
  });

  it('labels icon-only buttons with the designation name, or "employee" - never "undefined"', () => {
    const { el } = setup([makeEmployee(), makeEmployee({ id: 'emp-2', designationId: 'des-gone' })], {
      permissions: ['employee:update:any', 'employee:delete:any'],
    });

    expect(el.querySelector('a[aria-label="View Backend Engineer"]')).not.toBeNull();
    expect(el.querySelector('a[aria-label="Edit Backend Engineer"]')).not.toBeNull();
    expect(el.querySelector('button[aria-label="Delete Backend Engineer"]')).not.toBeNull();
    expect(el.querySelector('a[aria-label="View employee"]')).not.toBeNull();
    expect(el.innerHTML).not.toContain('undefined');
  });

  it('gates Edit and Delete on their own permissions, but always offers View', () => {
    const { el } = setup([makeEmployee()], { permissions: [] });

    expect(el.querySelector('a[aria-label^="View"]')).not.toBeNull();
    expect(el.querySelector('a[aria-label^="Edit"]')).toBeNull();
    expect(el.querySelector('button[aria-label^="Delete"]')).toBeNull();
  });

  it("sorts with the backend's own keys: department, designation, employmentType (relation/enum sorts - never jobTitle)", () => {
    const { fixture, el } = setup([makeEmployee()]);
    const sorts: Sort[] = [];
    fixture.componentInstance.sortChange.subscribe((sort) => sorts.push(sort));

    for (const header of ['Department', 'Designation', 'Employment type']) {
      [...el.querySelectorAll<HTMLElement>('th')].find((th) => th.textContent?.trim().startsWith(header))!.click();
    }

    expect(sorts.map((sort) => sort.active)).toEqual(['department', 'designation', 'employmentType']);
  });

  it('emits the row when Delete is clicked', () => {
    const { fixture, el } = setup([makeEmployee()], { permissions: ['employee:delete:any'] });
    const requested: Employee[] = [];
    fixture.componentInstance.deleteRequested.subscribe((row) => requested.push(row));

    el.querySelector<HTMLButtonElement>('button[aria-label="Delete Backend Engineer"]')!.click();

    expect(requested.map((row) => row.id)).toEqual(['emp-1']);
  });
});
