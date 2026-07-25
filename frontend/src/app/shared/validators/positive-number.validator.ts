import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// Whole dollars or up to 2 decimal places - deliberately stricter than
// JS's own `Number()` parsing, which would otherwise silently accept
// scientific notation ("1e5") or multiple decimal points as "positive".
const NUMERIC_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Mirrors the backend's `salary` rule (`z.number().positive().max(...)`,
 * blueprint §9). Operates on a plain text control (not a native
 * `type="number"` input) - a number input silently reports an empty
 * value the instant what's typed doesn't parse as a number, which made a
 * garbled entry look like "required" instead of "not a valid number".
 */
export function positiveNumberValidator(max: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string | null;

    if (value === null || value === undefined || value === '') {
      return null; // Validators.required handles emptiness
    }

    if (!NUMERIC_PATTERN.test(value)) {
      return { notANumber: true };
    }

    const numeric = Number(value);

    if (numeric <= 0) {
      return { notPositive: true };
    }

    return numeric > max ? { tooLarge: true } : null;
  };
}
