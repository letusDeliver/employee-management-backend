import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { SessionStore } from '../../../core/auth/session.store';
import { BranchDirectoryService } from '../../../core/master-data-directory/branch-directory.service';
import { DepartmentDirectoryService } from '../../../core/master-data-directory/department-directory.service';
import { DesignationDirectoryService } from '../../../core/master-data-directory/designation-directory.service';
import { ShiftDirectoryService } from '../../../core/master-data-directory/shift-directory.service';
import { UserDirectoryService } from '../../../core/users/user-directory.service';
import { Employee } from '../data-access/employee.model';
import { EmployeeStore } from '../data-access/employee.store';
import { makeEmployee } from '../data-access/employee.testing';
import { signal } from '@angular/core';
import { EmployeeDetailPageComponent } from './employee-detail-page.component';

const directory = (map: Record<string, string>) => ({
  nameOf: (id: string | null | undefined) => (id ? (map[id] ?? null) : null),
  refresh: vi.fn(() => of([])),
});

describe('EmployeeDetailPageComponent', () => {
  const selected = signal<Employee | null>(null);
  const store = {
    selected,
    selectedLoading: signal(false),
    selectedError: signal<string | null>(null),
    loadOne: vi.fn(),
    deleteEmployee: vi.fn(),
  };
  const dialog = { open: vi.fn() };

  let departments: ReturnType<typeof directory>;
  let designations: ReturnType<typeof directory>;
  let branches: ReturnType<typeof directory>;
  let shifts: ReturnType<typeof directory>;

  const setup = (
    employee: Employee,
    lookups: {
      departments?: Record<string, string>;
      designations?: Record<string, string>;
      branches?: Record<string, string>;
      shifts?: Record<string, string>;
    } = {},
  ): { fixture: ComponentFixture<EmployeeDetailPageComponent>; el: HTMLElement } => {
    departments = directory(lookups.departments ?? { 'dep-1': 'Engineering' });
    designations = directory(lookups.designations ?? { 'des-1': 'Backend Engineer' });
    branches = directory(lookups.branches ?? { 'br-1': 'Bengaluru HQ' });
    shifts = directory(lookups.shifts ?? { 'sh-1': 'Day Shift' });
    selected.set(employee);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: EmployeeStore, useValue: store },
        { provide: MatDialog, useValue: dialog },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: employee.id }) } } },
        { provide: SessionStore, useValue: { hasAnyPermission: () => true } },
        { provide: UserDirectoryService, useValue: { ensureLoaded: () => of([]), resolveDisplayName: () => null } },
        { provide: DepartmentDirectoryService, useValue: departments },
        { provide: DesignationDirectoryService, useValue: designations },
        { provide: BranchDirectoryService, useValue: branches },
        { provide: ShiftDirectoryService, useValue: shifts },
      ],
    });

    const fixture = TestBed.createComponent(EmployeeDetailPageComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const field = (el: HTMLElement, label: string): string | undefined =>
    [...el.querySelectorAll('dl > div')]
      .find((row) => row.querySelector('dt')?.textContent?.trim() === label)
      ?.querySelector('dd')
      ?.textContent?.trim();

  beforeEach(() => {
    store.loadOne.mockReset();
    store.deleteEmployee.mockReset();
    dialog.open.mockReset();
    store.selectedLoading.set(false);
    store.selectedError.set(null);
  });

  it('loads the record and refreshes the lookups it needs to show names', () => {
    setup(makeEmployee());

    expect(store.loadOne).toHaveBeenCalledWith('emp-1');
    expect(departments.refresh).toHaveBeenCalled();
    expect(designations.refresh).toHaveBeenCalled();
    expect(branches.refresh).toHaveBeenCalled();
    expect(shifts.refresh).toHaveBeenCalled();
  });

  it('titles the page with the designation name and shows department, designation, type and branch by NAME', () => {
    const { el } = setup(makeEmployee({ employmentType: 'CONTRACT', branchId: 'br-1' }));

    expect(el.querySelector('h1')?.textContent).toContain('Backend Engineer');
    expect(field(el, 'Department')).toBe('Engineering');
    expect(field(el, 'Designation')).toBe('Backend Engineer');
    expect(field(el, 'Employment type')).toBe('Contract');
    expect(field(el, 'Branch')).toBe('Bengaluru HQ');
  });

  it('shows the shift by NAME', () => {
    const { el } = setup(makeEmployee({ shiftId: 'sh-1' }));

    expect(field(el, 'Shift')).toBe('Day Shift');
  });

  it('shows a dash when there is no shift, or it cannot be resolved (e.g. the shifts lookup failed)', () => {
    expect(field(setup(makeEmployee({ shiftId: null })).el, 'Shift')).toBe('—');

    TestBed.resetTestingModule();
    const { el } = setup(makeEmployee({ shiftId: 'sh-gone' }), { shifts: {} });

    expect(field(el, 'Shift')).toBe('—');
    expect(el.textContent).not.toContain('sh-gone');
  });

  it('shows a plain dash - never an id or "undefined" - for anything that cannot be resolved or is unset', () => {
    const { el } = setup(makeEmployee({ departmentId: 'dep-gone', designationId: 'des-gone', branchId: null, shiftId: null }), {
      departments: {},
      designations: {},
    });

    expect(el.querySelector('h1')?.textContent).toContain('Employee');
    expect(field(el, 'Department')).toBe('—');
    expect(field(el, 'Designation')).toBe('—');
    expect(field(el, 'Branch')).toBe('—');
    expect(field(el, 'Shift')).toBe('—');
    expect(el.textContent).not.toContain('undefined');
    expect(el.textContent).not.toContain('dep-gone');
  });

  it('renders an unknown employment type as a dash, not blank', () => {
    const { el } = setup(makeEmployee({ employmentType: 'SOMETHING_NEW' as never }));

    expect(field(el, 'Employment type')).toBe('—');
  });

  describe('delete confirmation copy', () => {
    const openConfirm = (el: HTMLElement): string => {
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });
      [...el.querySelectorAll('button')].find((button) => button.textContent?.includes('Delete'))!.click();
      return dialog.open.mock.calls[0][1].data.message as string;
    };

    it('names the designation and department', () => {
      const { el } = setup(makeEmployee());

      expect(openConfirm(el)).toBe('Delete the Backend Engineer record in Engineering? This cannot be undone.');
    });

    it('falls back to plain wording, never "undefined"', () => {
      const { el } = setup(makeEmployee({ designationId: 'des-gone', departmentId: 'dep-gone' }), { departments: {}, designations: {} });

      const message = openConfirm(el);

      expect(message).toBe('Delete this employee record? This cannot be undone.');
      expect(message).not.toContain('undefined');
    });
  });

  it('shows the backend message when a delete is rejected', () => {
    const { fixture, el } = setup(makeEmployee());
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    store.deleteEmployee.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { status: 'error', message: 'This employee cannot be deleted right now' } })),
    );

    [...el.querySelectorAll('button')].find((button) => button.textContent?.includes('Delete'))!.click();
    fixture.detectChanges();

    expect(store.deleteEmployee).toHaveBeenCalledWith('emp-1');
    expect(el.querySelector('app-inline-banner')?.textContent).toContain('This employee cannot be deleted right now');
    // Still on the page, and Delete is available again.
    expect([...el.querySelectorAll('button')].some((button) => button.textContent?.includes('Delete') && !button.disabled)).toBe(true);
  });
});
