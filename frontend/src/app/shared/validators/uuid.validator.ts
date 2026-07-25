import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mirrors the backend's `z.string().uuid()` rule, used across every
 * optional raw-id field (`userId`, `managerId`) - without this, a typo'd
 * id only surfaces as a raw "Invalid UUID" message after a full
 * round-trip to the server, instead of immediate inline feedback.
 */
export const uuidValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value as string;

  if (!value) {
    return null; // empty is valid - these fields are optional
  }

  return UUID_PATTERN.test(value) ? null : { invalidUuid: true };
};
