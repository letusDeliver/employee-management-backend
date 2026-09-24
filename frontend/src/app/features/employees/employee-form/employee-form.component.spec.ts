import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AbstractControl, FormGroup } from '@angular/forms';
import { provideNativeDateAdapter } from '@angular/material/core';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { BranchDirectoryService } from '../../../core/master-data-directory/branch-directory.service';
import { DepartmentDirectoryService } from '../../../core/master-data-directory/department-directory.service';
import { DesignationDirectoryService } from '../../../core/master-data-directory/designation-directory.service';
import { DirectoryEntry, DirectoryOption } from '../../../core/master-data-directory/master-data-directory';
import { Employee } from '../data-access/employee.model';
import { EmployeeStore } from '../data-access/employee.store';
import { makeEmployee } from '../data-access/employee.testing';
import { EmployeeFormPageComponent } from './employee-form.component';

const entry = (id: string, name: string, status: DirectoryEntry['status'] = 'ACTIVE'): DirectoryEntry => ({ id, name, status });

const DEPARTMENTS = [entry('dep-1', 'Engineering'), entry('dep-2', 'Finance'), entry('dep-old', 'Legacy Ops', 'INACTIVE')];
const DESIGNATIONS = [entry('des-1', 'Backend Engineer'), entry('des-2', 'Sales Manager'), entry('des-old', 'Retired Title', 'INACTIVE')];
const BRANCHES = [entry('br-1', 'Bengaluru HQ'), entry('br-old', 'Old Site', 'INACTIVE')];

const pagination = { page: 1, limit: 100, total: 3, totalPages: 1 };

/** The form is `protected` - reach what the template reaches, via the instance. */
interface Internals {
  form: FormGroup<Record<string, AbstractControl>>;
  departmentOptions: () => DirectoryOption[];
  designationOptions: () => DirectoryOption[];
  branchOptions: () => DirectoryOption[];
  canSubmit: () => boolean;
  submit: () => void;
}

type Lookup = 'departments' | 'designations' | 'branches';

describe('EmployeeFormPageComponent', () => {
  const selected = signal<Employee | null>(null);
  const store = {
    selected,
    selectedLoading: signal(false),
    selectedError: signal<string | null>(null),
    loadOne: vi.fn(),
    createEmployee: vi.fn(),
    updateEmployee: vi.fn(),
  };

  let http: HttpTestingController;
  let router: Router;

  const setup = (
    employeeId: string | null = null,
    options: { preloaded?: boolean } = {},
  ): { fixture: ComponentFixture<EmployeeFormPageComponent>; el: HTMLElement; c: Internals } => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: EmployeeStore, useValue: store },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(employeeId ? { id: employeeId } : {}) } },
        },
      ],
    });

    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    if (options.preloaded) {
      // The directories are root singletons: by the time the form opens they may already
      // hold data from an earlier page (e.g. the list). Simulate that visit.
      const earlier = { departments: DEPARTMENTS, designations: DESIGNATIONS, branches: BRANCHES };
      for (const service of [DepartmentDirectoryService, DesignationDirectoryService, BranchDirectoryService]) {
        TestBed.inject(service).refresh();
      }
      for (const name of ['departments', 'designations', 'branches'] as const) {
        lookupRequest(name).flush({ [name]: earlier[name], pagination });
      }
    }

    const fixture = TestBed.createComponent(EmployeeFormPageComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, c: fixture.componentInstance as unknown as Internals };
  };

  const lookupRequest = (name: Lookup) => http.expectOne((req) => req.method === 'GET' && req.url.endsWith(`/${name}`));

  /** Answers the three lookup requests the form fires on init (or on Retry). `fail` makes one of them a 500. */
  const flushLookups = (fixture: ComponentFixture<EmployeeFormPageComponent>, fail: Lookup[] = []) => {
    const data: Record<Lookup, DirectoryEntry[]> = { departments: DEPARTMENTS, designations: DESIGNATIONS, branches: BRANCHES };

    for (const name of ['departments', 'designations', 'branches'] as const) {
      const request = lookupRequest(name);
      if (fail.includes(name)) {
        request.flush({ status: 'error', message: 'boom' }, { status: 500, statusText: 'Server Error' });
      } else {
        request.flush({ [name]: data[name], pagination });
      }
    }
    fixture.detectChanges();
  };

  const submitButton = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const submitForm = (fixture: ComponentFixture<EmployeeFormPageComponent>, el: HTMLElement) => {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };
  const buttonWithText = (el: HTMLElement, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(text));

  const fillValid = (c: Internals, overrides: Record<string, unknown> = {}) =>
    c.form.patchValue({
      departmentId: 'dep-2',
      designationId: 'des-1',
      employmentType: 'INTERN',
      salary: '5000.5',
      dateOfJoining: new Date(2024, 0, 15),
      ...overrides,
    });

  beforeEach(() => {
    selected.set(null);
    store.selectedLoading.set(false);
    store.selectedError.set(null);
    store.loadOne.mockReset();
    store.createEmployee.mockReset();
    store.updateEmployee.mockReset();
  });

  afterEach(() => http.verify());

  describe('create', () => {
    it('loads the department, designation and branch lookups on entry', () => {
      const { fixture } = setup();

      flushLookups(fixture);

      expect(store.loadOne).not.toHaveBeenCalled();
    });

    it('offers only ACTIVE records - an inactive department/designation/branch is not assignable', () => {
      const { fixture, c } = setup();
      flushLookups(fixture);

      expect(c.departmentOptions().map((o) => o.id)).toEqual(['dep-1', 'dep-2']);
      expect(c.designationOptions().map((o) => o.id)).toEqual(['des-1', 'des-2']);
      expect(c.branchOptions().map((o) => o.id)).toEqual(['br-1']);
    });

    it('cannot be submitted until the lookups have loaded', () => {
      const { fixture, el, c } = setup();

      expect(c.canSubmit()).toBe(false);
      expect(submitButton(el).disabled).toBe(true);
      expect(el.textContent).toContain('Loading form options');

      flushLookups(fixture);

      expect(c.canSubmit()).toBe(true);
      expect(submitButton(el).disabled).toBe(false);
    });

    it('requires department, designation and employment type: nothing is sent and each says so', () => {
      const { fixture, el } = setup();
      flushLookups(fixture);

      submitForm(fixture, el);

      expect(store.createEmployee).not.toHaveBeenCalled();
      expect(el.textContent).toContain('Department is required.');
      expect(el.textContent).toContain('Designation is required.');
      expect(el.textContent).toContain('Employment type is required.');
    });

    it('sends the chosen ids and enum, and OMITS the optional links that were left blank', () => {
      store.createEmployee.mockReturnValue(of(makeEmployee({ id: 'new-1' })));
      const { fixture, el, c } = setup();
      flushLookups(fixture);
      fillValid(c);

      submitForm(fixture, el);

      expect(store.createEmployee).toHaveBeenCalledTimes(1);
      const request = store.createEmployee.mock.calls[0][0];
      expect(request).toMatchObject({ departmentId: 'dep-2', designationId: 'des-1', employmentType: 'INTERN', salary: 5000.5 });
      expect(request.branchId).toBeUndefined();
      expect(request.userId).toBeUndefined();
      expect(request.managerId).toBeUndefined();
      expect(router.navigate).toHaveBeenCalledWith(['/employees', 'new-1']);
    });

    it('sends a branch when one was chosen', () => {
      store.createEmployee.mockReturnValue(of(makeEmployee({ id: 'new-1' })));
      const { fixture, el, c } = setup();
      flushLookups(fixture);
      fillValid(c, { branchId: 'br-1' });

      submitForm(fixture, el);

      expect(store.createEmployee.mock.calls[0][0].branchId).toBe('br-1');
    });

    it("stays on the page and shows the backend's message when creation is rejected", () => {
      store.createEmployee.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 400, error: { status: 'error', message: 'departmentId: this department is not active' } })),
      );
      const { fixture, el, c } = setup();
      flushLookups(fixture);
      fillValid(c);

      submitForm(fixture, el);

      expect(el.querySelector('app-inline-banner')?.textContent).toContain('this department is not active');
      expect(router.navigate).not.toHaveBeenCalled();
      expect(c.canSubmit()).toBe(true);
    });
  });

  describe('a lookup that fails to load', () => {
    it.each(['departments', 'designations'] as const)(
      'BLOCKS the form when %s cannot be loaded: an error with Retry, submit disabled, nothing sent',
      (failing) => {
        const { fixture, el, c } = setup();
        flushLookups(fixture, [failing]);
        fillValid(c);

        expect(el.textContent).toContain('Could not load the department and designation options');
        expect(el.textContent).toContain('boom');
        expect(buttonWithText(el, 'Retry')).toBeDefined();
        expect(c.canSubmit()).toBe(false);
        expect(submitButton(el).disabled).toBe(true);

        c.submit();
        expect(store.createEmployee).not.toHaveBeenCalled();
      },
    );

    it("BLOCKS even when the directories were loaded earlier in the session - a stale cache must not mask a failed refresh", () => {
      // First-time failures are blocked simply because nothing is loaded; THIS is the
      // case where `loaded` is already true and only the error says the data is suspect.
      const { fixture, el, c } = setup(null, { preloaded: true });
      expect(c.canSubmit()).toBe(true);

      flushLookups(fixture, ['departments']);
      fillValid(c);

      expect(el.textContent).toContain('Could not load the department and designation options');
      expect(buttonWithText(el, 'Retry')).toBeDefined();
      expect(c.canSubmit()).toBe(false);
      expect(submitButton(el).disabled).toBe(true);

      c.submit();
      expect(store.createEmployee).not.toHaveBeenCalled();
    });

    it('recovers when Retry succeeds: the banner goes and the form can be submitted', () => {
      const { fixture, el, c } = setup();
      flushLookups(fixture, ['departments']);
      expect(c.canSubmit()).toBe(false);

      buttonWithText(el, 'Retry')!.click();
      flushLookups(fixture);

      expect(el.textContent).not.toContain('Could not load');
      expect(c.canSubmit()).toBe(true);
    });

    it('does NOT block on a branch failure alone - branch is optional: the select is disabled and the rest still works', () => {
      store.createEmployee.mockReturnValue(of(makeEmployee({ id: 'new-1' })));
      const { fixture, el, c } = setup();
      flushLookups(fixture, ['branches']);
      fillValid(c);

      expect(el.textContent).not.toContain('Could not load the department and designation');
      expect(c.form.controls['branchId'].disabled).toBe(true);
      expect(el.textContent).toContain('Branches could not be loaded');
      expect(c.canSubmit()).toBe(true);

      submitForm(fixture, el);
      expect(store.createEmployee).toHaveBeenCalledTimes(1);
      expect(store.createEmployee.mock.calls[0][0].branchId).toBeUndefined();
    });
  });

  describe('edit', () => {
    const existing = () =>
      makeEmployee({
        departmentId: 'dep-old', // deactivated since it was assigned
        designationId: 'des-1',
        employmentType: 'CONTRACT',
        branchId: 'br-1',
        salary: 1000,
        userId: null,
        managerId: null,
      });

    it('loads the employee, and does not patch the form until the lookups are ready', () => {
      const { fixture, c } = setup('emp-1');
      expect(store.loadOne).toHaveBeenCalledWith('emp-1');

      selected.set(existing());
      fixture.detectChanges();
      expect(c.form.controls['departmentId'].value).toBe('');

      flushLookups(fixture);

      expect(c.form.controls['departmentId'].value).toBe('dep-old');
    });

    it('patches every field from the employee', () => {
      const { fixture, c } = setup('emp-1');
      selected.set(makeEmployee({ ...existing(), departmentId: 'dep-1', userId: '11111111-1111-4111-8111-111111111111' }));
      flushLookups(fixture);

      expect(c.form.getRawValue()).toMatchObject({
        departmentId: 'dep-1',
        designationId: 'des-1',
        employmentType: 'CONTRACT',
        branchId: 'br-1',
        salary: '1000',
        userId: '11111111-1111-4111-8111-111111111111',
      });
    });

    it("keeps a since-deactivated CURRENT department selectable - first, and flagged inactive - instead of a blank select", () => {
      const { fixture, c } = setup('emp-1');
      selected.set(existing());
      flushLookups(fixture);

      expect(c.departmentOptions()[0]).toEqual({ id: 'dep-old', label: 'Legacy Ops', inactive: true });
      expect(c.departmentOptions().map((o) => o.id)).toEqual(['dep-old', 'dep-1', 'dep-2']);
      // ...but ANOTHER employee's form still cannot offer it (that is the create case above).
    });

    it('THE CRUX: changing only the salary sends only the salary - the deactivated department is NOT resent', () => {
      store.updateEmployee.mockReturnValue(of(makeEmployee()));
      const { fixture, el, c } = setup('emp-1');
      selected.set(existing());
      flushLookups(fixture);
      c.form.patchValue({ salary: '2000' });

      submitForm(fixture, el);

      expect(store.updateEmployee).toHaveBeenCalledTimes(1);
      const [id, body] = store.updateEmployee.mock.calls[0];
      expect(id).toBe('emp-1');
      expect(body).toEqual({ salary: 2000 });
      expect(body).not.toHaveProperty('departmentId');
      expect(body).not.toHaveProperty('designationId');
      expect(body).not.toHaveProperty('branchId');
    });

    it('sends a designation that was actually changed - and only that', () => {
      store.updateEmployee.mockReturnValue(of(makeEmployee()));
      const { fixture, el, c } = setup('emp-1');
      selected.set(existing());
      flushLookups(fixture);
      c.form.patchValue({ designationId: 'des-2' });

      submitForm(fixture, el);

      expect(store.updateEmployee.mock.calls[0][1]).toEqual({ designationId: 'des-2' });
    });

    it('CLEARS a branch with null (choosing "No branch"), not by omitting it', () => {
      store.updateEmployee.mockReturnValue(of(makeEmployee()));
      const { fixture, el, c } = setup('emp-1');
      selected.set(existing());
      flushLookups(fixture);
      c.form.patchValue({ branchId: '' });

      submitForm(fixture, el);

      expect(store.updateEmployee.mock.calls[0][1]).toEqual({ branchId: null });
    });

    it('sends NO request at all when nothing changed - it just goes back to the record', () => {
      const { fixture, el } = setup('emp-1');
      selected.set(existing());
      flushLookups(fixture);

      submitForm(fixture, el);

      expect(store.updateEmployee).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/employees', 'emp-1']);
    });

    it("does not patch (or allow saving) while the store still holds a DIFFERENT employee's record", () => {
      const { fixture, c } = setup('emp-1');
      selected.set(makeEmployee({ id: 'someone-else', departmentId: 'dep-2' }));
      flushLookups(fixture);

      expect(c.form.controls['departmentId'].value).toBe('');
      expect(c.canSubmit()).toBe(false);
    });

    it('cannot be saved when the employee failed to load, and says why', () => {
      const { fixture, el, c } = setup('emp-1');
      store.selectedError.set('Employee not found');
      flushLookups(fixture);

      expect(el.textContent).toContain('Employee not found');
      expect(c.canSubmit()).toBe(false);
    });

    it('navigates to the record after a successful save', () => {
      store.updateEmployee.mockReturnValue(of(makeEmployee({ id: 'emp-1' })));
      const { fixture, el, c } = setup('emp-1');
      selected.set(existing());
      flushLookups(fixture);
      c.form.patchValue({ salary: '3000' });

      submitForm(fixture, el);

      expect(router.navigate).toHaveBeenCalledWith(['/employees', 'emp-1']);
    });

    it("shows the backend's message and stays put when the save is rejected", () => {
      store.updateEmployee.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 400, error: { status: 'error', message: 'salary: Salary must be a positive number' } })),
      );
      const { fixture, el, c } = setup('emp-1');
      selected.set(existing());
      flushLookups(fixture);
      c.form.patchValue({ salary: '3000' });

      submitForm(fixture, el);

      expect(el.querySelector('app-inline-banner')?.textContent).toContain('Salary must be a positive number');
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });
});
