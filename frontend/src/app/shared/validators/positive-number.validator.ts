import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Mirrors the backend's `salary` rule (`z.number().positive()`, blueprint §9) - a UX convenience, server remains the authority. */
export const positiveNumberValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value as number | null;

  if (value === null || value === undefined) {
    return null;
  }

  return value > 0 ? null : { notPositive: true };
};
