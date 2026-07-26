import { Component, DestroyRef, OnInit, effect, inject, signal } from '@angular/core';
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

import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ICON_NAMES } from '../../../shared/icon-names';
import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { notBlankValidator } from '../../../shared/validators/not-blank.validator';
import { notFutureDateValidator } from '../../../shared/validators/not-future-date.validator';
import { positiveNumberValidator } from '../../../shared/validators/positive-number.validator';
import { uuidValidator } from '../../../shared/validators/uuid.validator';
import { EmployeeStore } from '../data-access/employee.store';

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
 * `managerId`/`userId` are plain text inputs (paste a real id) rather
 * than a searchable picker - a known, named scope limitation (see the
 * handbook's Future Improvements), not a fabricated richer UI.
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

  protected readonly employeeId = this.route.snapshot.paramMap.get('id');
  protected readonly isEditMode = this.employeeId !== null;
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly icons = ICON_NAMES;

  private formPatched = false;

  protected readonly form = this.formBuilder.nonNullable.group({
    department: ['', notBlankValidator],
    jobTitle: ['', notBlankValidator],
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
      // isEditMode guard is required, not redundant: EmployeeStore.selected is a
      // singleton signal that outlives this component - without it, opening
      // "New Employee" right after editing another record would patch this
      // blank create form with that other employee's still-cached data.
      if (employee && this.isEditMode && !this.formPatched) {
        this.form.patchValue({
          department: employee.department,
          jobTitle: employee.jobTitle,
          salary: String(employee.salary),
          dateOfJoining: employee.dateOfJoining,
          userId: employee.userId ?? '',
          managerId: employee.managerId ?? '',
        });
        this.formPatched = true;
      }
    });
  }

  ngOnInit(): void {
    if (this.isEditMode && this.employeeId) {
      this.employeeStore.loadOne(this.employeeId);
    }
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.serverError.set(null);
    this.submitting.set(true);

    const raw = this.form.getRawValue();
    const base = {
      department: raw.department,
      jobTitle: raw.jobTitle,
      // Safe: positiveNumberValidator already confirmed this parses cleanly.
      salary: Number(raw.salary),
      // Safe: Validators.required on this control already gated submission above.
      dateOfJoining: raw.dateOfJoining as Date,
    };

    // Create omits an empty userId/managerId (nothing to unlink yet); edit
    // sends null instead, so clearing a previously-set field actually
    // clears it server-side rather than silently leaving it unchanged
    // (see UpdateEmployeeRequest's own comment).
    const result$ =
      this.isEditMode && this.employeeId
        ? this.employeeStore.updateEmployee(this.employeeId, {
            ...base,
            userId: raw.userId || null,
            managerId: raw.managerId || null,
          })
        : this.employeeStore.createEmployee({
            ...base,
            userId: raw.userId || undefined,
            managerId: raw.managerId || undefined,
          });

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
