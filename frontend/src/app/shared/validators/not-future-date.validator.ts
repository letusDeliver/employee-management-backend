import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Mirrors the backend's `dateOfJoining` rule (blueprint §9) - a UX convenience, server remains the authority. */
export const notFutureDateValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value as Date | null;

  if (!value) {
    return null;
  }

  return value > new Date() ? { futureDate: true } : null;
};
