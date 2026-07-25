import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Mirrors the backend's `department`/`jobTitle` rule (`z.string().trim().min(1)`)
 * - plain `Validators.required` treats whitespace-only input ("   ") as
 * valid, since it only checks for a null/empty string. Uses the same
 * `required` error key `Validators.required` would, so existing
 * `hasError`/`invalid` template checks need no change.
 */
export const notBlankValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value as string | null;
  return value && value.trim().length > 0 ? null : { required: true };
};
