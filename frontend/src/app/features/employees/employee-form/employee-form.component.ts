import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { extractErrorMessage } from '../../../shared/utils/extract-error-message.util';
import { notFutureDateValidator } from '../../../shared/validators/not-future-date.validator';
import { positiveNumberValidator } from '../../../shared/validators/positive-number.validator';
import { uuidValidator } from '../../../shared/validators/uuid.validator';
import { EmployeeStore } from '../data-access/employee.store';

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
    MatCardModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    RouterLink,
  ],
  templateUrl: './employee-form.component.html',
  styleUrl: './employee-form.component.scss',
})
export class EmployeeFormPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly employeeStore = inject(EmployeeStore);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly employeeId = this.route.snapshot.paramMap.get('id');
  protected readonly isEditMode = this.employeeId !== null;
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  private formPatched = false;

  protected readonly form = this.formBuilder.nonNullable.group({
    department: ['', Validators.required],
    jobTitle: ['', Validators.required],
    salary: [0, [Validators.required, positiveNumberValidator]],
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
      if (employee && !this.formPatched) {
        this.form.patchValue({
          department: employee.department,
          jobTitle: employee.jobTitle,
          salary: employee.salary,
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
    const request = {
      department: raw.department,
      jobTitle: raw.jobTitle,
      salary: raw.salary,
      // Safe: Validators.required on this control already gated submission above.
      dateOfJoining: raw.dateOfJoining as Date,
      userId: raw.userId || undefined,
      managerId: raw.managerId || undefined,
    };

    const result$ =
      this.isEditMode && this.employeeId
        ? this.employeeStore.updateEmployee(this.employeeId, request)
        : this.employeeStore.createEmployee(request);

    result$.subscribe({
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
