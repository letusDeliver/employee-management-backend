import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { BranchDirectoryService } from '../../../core/master-data-directory/branch-directory.service';
import { DepartmentDirectoryService } from '../../../core/master-data-directory/department-directory.service';
import { DesignationDirectoryService } from '../../../core/master-data-directory/designation-directory.service';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { notFutureDateValidator } from '../../../shared/validators/not-future-date.validator';
import { positiveNumberValidator } from '../../../shared/validators/positive-number.validator';
import { uuidValidator } from '../../../shared/validators/uuid.validator';
import { buildEmployeeCreate, buildEmployeeUpdate, EmployeeFormValue } from '../data-access/employee-update';
import { Employee } from '../data-access/employee.model';
import { EmployeeStore } from '../data-access/employee.store';
import { EMPLOYMENT_TYPE_OPTIONS, EmploymentType } from '../data-access/employment-type';

// Mirrors the backend's own sanity bound (employee.validation.js) - a
// generous ceiling meant to catch garbled/pasted-in-error input (a
// 20-digit number, a misplaced extra zero), not to constrain real salaries.
const MAX_SALARY = 100_000_000;

/**
 * Employees-specific (not a shared validator, unlike `notFutureDate`/
 * `positiveNumber`) - needs the current record's own id, only known in
 * edit mode, to mirror the backend's `assertNotSelfManaged` check
 * (`employee.service.js`) as a UX convenience.
 */
function selfManagedValidator(employeeId: string | null) {
  return (control: AbstractControl): ValidationErrors | null => {
    const managerId = control.value as string;
    return employeeId && managerId && managerId === employeeId ? { selfManaged: true } : null;
  };
}

/**
 * Create + edit, one component (typed Reactive Form, blueprint §9).
 *
 * Department, Designation and Employment Type are mandatory selects; Branch is an optional
 * one ("No branch"). The options are the records the backend will actually accept:
 * `active()` only - assigning an inactive record is a 400 - PLUS, in edit mode, the
 * employee's *current* value even if it has since been deactivated, labelled
 * "(inactive)", so the select never goes blank on an existing assignment.
 *
 * Those lookups are a functional dependency (the FKs are mandatory), so a failed
 * Department or Designation load BLOCKS the form with a retry - unlike a list column's
 * display-only names, which degrade to "—". Branch is optional: if only the branch
 * lookup fails the select is disabled and the rest of the form stays usable (an
 * unchanged branch is never sent, so nothing is lost).
 *
 * Edit sends only what changed (`buildEmployeeUpdate`) - the backend re-validates any
 * foreign key that is PRESENT in a PATCH, so resending an unchanged, since-deactivated
 * department would fail an edit that never touched it.
 *
 * `managerId`/`userId` remain plain text inputs (paste a real id) rather than a
 * searchable picker - a known, named scope limitation, not a fabricated richer UI.
 */
@Component({
  selector: 'app-employee-form-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    RouterLink,
    PageHeaderComponent,
    InlineBannerComponent,
  ],
  templateUrl: './employee-form.component.html',
  styleUrl: './employee-form.component.scss',
})
export class EmployeeFormPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly employeeStore = inject(EmployeeStore);
  private readonly formBuilder = inject(FormBuilder);
  private readonly departments = inject(DepartmentDirectoryService);
  private readonly designations = inject(DesignationDirectoryService);
  private readonly branches = inject(BranchDirectoryService);

  protected readonly employeeId = this.route.snapshot.paramMap.get('id');
  protected readonly isEditMode = this.employeeId !== null;
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly icons = ICON_NAMES;
  protected readonly employmentTypes = EMPLOYMENT_TYPE_OPTIONS;

  private formPatched = false;
  /** The record as loaded, set when the edit form is patched - the baseline `buildEmployeeUpdate` diffs against. */
  private readonly original = signal<Employee | null>(null);

  // --- Mandatory lookups (department + designation) block the form; branch is best-effort. ---
  protected readonly mandatoryLookupsLoaded = computed(() => this.departments.loaded() && this.designations.loaded());
  protected readonly mandatoryLookupsError = computed(() => this.departments.error() ?? this.designations.error());
  protected readonly lookupsLoading = computed(() => this.departments.loading() || this.designations.loading());
  protected readonly formReady = computed(() => this.mandatoryLookupsLoaded() && !this.mandatoryLookupsError());
  protected readonly branchUnavailable = computed(() => Boolean(this.branches.error()));
  protected readonly canSubmit = computed(
    () => !this.submitting() && this.formReady() && (!this.isEditMode || this.original() !== null),
  );

  protected readonly departmentOptions = computed(() =>
    this.departments.optionsFor(this.original()?.departmentId),
  );
  protected readonly designationOptions = computed(() =>
    this.designations.optionsFor(this.original()?.designationId),
  );
  protected readonly branchOptions = computed(() => this.branches.optionsFor(this.original()?.branchId));

  protected readonly form = this.formBuilder.nonNullable.group({
    departmentId: ['', Validators.required],
    designationId: ['', Validators.required],
    employmentType: ['' as EmploymentType | '', Validators.required],
    branchId: [''],
    // A plain text control, not type="number" - see positiveNumberValidator's
    // own comment for why a native number input is the wrong tool here.
    salary: ['', [Validators.required, positiveNumberValidator(MAX_SALARY)]],
    userId: ['', uuidValidator],
    managerId: ['', [uuidValidator, selfManagedValidator(this.employeeId)]],
    // A plain (nullable) FormControl instance bypasses nonNullable.group's
    // shorthand wrapping - dateOfJoining is genuinely empty until picked,
    // unlike the string fields above.
    dateOfJoining: new FormControl<Date | null>(null, [Validators.required, notFutureDateValidator]),
  });

  constructor() {
    effect(() => {
      const employee = this.employeeStore.selected();
      const lookupsReady = this.formReady();
      // Guards are required, not redundant: `EmployeeStore.selected` is a singleton
      // signal that outlives this component - it may still hold ANOTHER employee (one
      // viewed a moment ago) until this one's load lands, and patching that into the
      // form would be silently wrong. The id match closes that; `isEditMode` keeps a
      // blank "New Employee" form from ever being patched. Patching waits for the
      // lookups so the select options containing the current value already exist.
      if (employee && lookupsReady && this.isEditMode && employee.id === this.employeeId && !this.formPatched) {
        this.original.set(employee);
        this.form.patchValue({
          departmentId: employee.departmentId,
          designationId: employee.designationId,
          employmentType: employee.employmentType,
          branchId: employee.branchId ?? '',
          salary: String(employee.salary),
          dateOfJoining: employee.dateOfJoining,
          userId: employee.userId ?? '',
          managerId: employee.managerId ?? '',
        });
        this.formPatched = true;
      }
    });

    effect(() => {
      const control = this.form.controls.branchId;
      if (this.branchUnavailable()) {
        control.disable({ emitEvent: false });
      } else {
        control.enable({ emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    this.reloadLookups();

    if (this.isEditMode && this.employeeId) {
      this.employeeStore.loadOne(this.employeeId);
    }
  }

  /** Also the Retry button's handler. Errors are surfaced through each directory's `error` signal, not here. */
  protected reloadLookups(): void {
    for (const directory of [this.departments, this.designations, this.branches]) {
      directory.refresh().subscribe({ error: () => undefined });
    }
  }

  protected submit(): void {
    if (this.form.invalid || !this.canSubmit()) {
      this.form.markAllAsTouched();
      return;
    }

    this.serverError.set(null);

    const raw = this.form.getRawValue();
    const value: EmployeeFormValue = {
      departmentId: raw.departmentId,
      designationId: raw.designationId,
      employmentType: raw.employmentType as EmploymentType,
      // Safe: positiveNumberValidator already confirmed this parses cleanly.
      salary: Number(raw.salary),
      // Safe: Validators.required on this control already gated submission above.
      dateOfJoining: raw.dateOfJoining as Date,
      branchId: raw.branchId,
      userId: raw.userId,
      managerId: raw.managerId,
    };

    const original = this.original();
    let result$;

    if (this.isEditMode && this.employeeId && original) {
      const changes = buildEmployeeUpdate(original, value);

      // Nothing changed: a no-op PATCH would still write an audit row and bump
      // `updatedAt`, so don't send one - just go back to the record.
      if (Object.keys(changes).length === 0) {
        this.router.navigate(['/employees', this.employeeId]);
        return;
      }

      result$ = this.employeeStore.updateEmployee(this.employeeId, changes);
    } else {
      result$ = this.employeeStore.createEmployee(buildEmployeeCreate(value));
    }

    this.submitting.set(true);

    // takeUntilDestroyed both cancels the real in-flight HTTP request (Angular
    // aborts on unsubscribe) and prevents a late response from navigating or
    // setting state after the user has already left this page - e.g. Cancel,
    // or the browser back button, while a submit is still pending.
    result$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (employee) => {
        this.submitting.set(false);
        this.router.navigate(['/employees', employee.id]);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.serverError.set(extractErrorMessage(error));
      },
    });
  }
}
